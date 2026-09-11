/**
 * Housing Exam Hell - Firebase Cloud Realtime Sync Engine
 * Synchronizes question stats, custom edits, needs-edit flags, and mock exam histories across PC & Tablet.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA7jlW5vM65IptoXqxl0oukRDCs-Ndzks0",
  authDomain: "housing-exam.firebaseapp.com",
  projectId: "housing-exam",
  storageBucket: "housing-exam.firebasestorage.app",
  messagingSenderId: "263827587908",
  appId: "1:263827587908:web:8293318d4cf38000258d11",
  measurementId: "G-26G08BQ2ML"
};

const SYNC_USER_DOC = "main_study_profile";

const PURGED_NEEDS_EDIT_KEYS = new Set([
    '관리실무_short_CHAPTER 01 주택의 정의 및 종류_06',
    '관리실무_short_CHAPTER 04 관리조직 및 입주자대표회의_28',
    '관리실무_short_CHAPTER 04 관리조직 및 입주자대표회의_91',
    '관리실무_short_CHAPTER 11 시설관리_472'
]);

const CloudSync = {
    db: null,
    isInitialized: false,
    isSyncing: false,
    syncStatus: "offline", // "synced", "syncing", "offline", "error", "local_only", "update_required"
    lastSyncTime: null,
    isOutdated: false,
    cloudVersion: null,
    cloudBuild: null,
    sessionStartTime: new Date().toISOString(),
    _idleInterval: null,
    listeners: [],

    init() {
        if (typeof firebase === "undefined") {
            console.warn("Firebase SDK not loaded. Running in local-only mode.");
            this.syncStatus = "local_only";
            this.notifyStatusChange();
            return Promise.resolve(false);
        }

        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            this.db = firebase.firestore();
            this.sessionStartTime = new Date().toISOString();
            this.isInitialized = true;
            this.syncStatus = "syncing";
            console.log("☁️ Firebase Cloud Sync Engine initialized successfully.");
            this.notifyStatusChange();

            // Start 3-minute idle background polling
            this.startIdlePolling();

            // Return initial pull promise so caller can await it
            return this.pullFromCloud();
        } catch (err) {
            console.error("Firebase init error:", err);
            this.syncStatus = "error";
            this.notifyStatusChange();
            return Promise.resolve(false);
        }
    },

    startIdlePolling() {
        if (this._idleInterval) clearInterval(this._idleInterval);
        this._idleInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !this.isSyncing) {
                this.pullFromCloud();
            }
        }, 180000); // 3 minutes
    },

    onStatusChange(cb) {
        if (typeof cb === "function") {
            this.listeners.push(cb);
        }
    },

    notifyStatusChange() {
        this.listeners.forEach(cb => {
            try { cb(this.syncStatus, this.lastSyncTime); } catch (e) {}
        });
    },

    /**
     * Pull latest data from Firestore and merge into local IndexedDB & localStorage
     */
    async pullFromCloud() {
        if (!this.isInitialized || !this.db) return false;
        try {
            this.syncStatus = "syncing";
            this.notifyStatusChange();

            const syncCol = this.db.collection("exam_hell_sync");
            
            // 1. Fetch metadata and modular documents concurrently
            const [editsMetaDoc, editsDoc, statsDoc, historyDoc, flagsDoc, reportsDoc, versionDoc, legacyDoc] = await Promise.all([
                syncCol.doc("edits_meta").get().catch(() => null),
                syncCol.doc("edits_store").get().catch(() => null),
                syncCol.doc("stats_store").get().catch(() => null),
                syncCol.doc("history_store").get().catch(() => null),
                syncCol.doc("flags_store").get().catch(() => null),
                syncCol.doc("reports_store").get().catch(() => null),
                syncCol.doc("version_meta").get().catch(() => null),
                syncCol.doc(SYNC_USER_DOC).get().catch(() => null)
            ]);

            // Version check: inspect if cloud has a newer build
            let cloudBuild = '0';
            let cloudVer = '';
            if (versionDoc && versionDoc.exists) {
                const vData = versionDoc.data() || {};
                cloudBuild = String(vData.latestBuild || '0');
                cloudVer = vData.latestVersion || ('v.' + cloudBuild);
            }
            const localBuild = String((typeof window !== 'undefined' && window.APP_BUILD_VERSION) || '0');
            const localVer = (typeof window !== 'undefined' && window.APP_SEMVER) || ('v.' + localBuild);

            if (parseInt(cloudBuild, 10) > parseInt(localBuild, 10)) {
                this.isOutdated = true;
                this.cloudBuild = cloudBuild;
                this.cloudVersion = cloudVer;
                this.syncStatus = "update_required";
                console.warn(`📢 [Version Notice] Cloud has newer build: ${cloudVer} (${cloudBuild}) > local: ${localVer} (${localBuild})`);
                this.notifyStatusChange();
            } else {
                this.isOutdated = false;
            }

            let mergedCustomEdits = {};
            let mergedNeedsEdit = {};
            let mergedDeletedKeys = [];
            let mergedStats = [];
            let mergedHistory = [];

            // A. Load Custom Edits via High-Speed Chunked Store
            let allChunksLoadedSuccessfully = false;
            if (editsMetaDoc && editsMetaDoc.exists) {
                const meta = editsMetaDoc.data() || {};
                const totalChunks = meta.totalChunks || 1;
                const chunkPromises = [];
                for (let i = 0; i < totalChunks; i++) {
                    chunkPromises.push(syncCol.doc(`edits_chunk_${i}`).get().catch(() => null));
                }
                const chunkDocs = await Promise.all(chunkPromises);
                let failedChunks = 0;
                chunkDocs.forEach(cDoc => {
                    if (cDoc && cDoc.exists) {
                        const cData = cDoc.data() || {};
                        if (cData.data) {
                            try {
                                const parsed = JSON.parse(cData.data);
                                Object.assign(mergedCustomEdits, parsed);
                            } catch (e) { failedChunks++; }
                        } else { failedChunks++; }
                    } else {
                        failedChunks++;
                    }
                });
                const expectedCount = meta.totalCount || 0;
                if (failedChunks === 0 && Object.keys(mergedCustomEdits).length >= expectedCount) {
                    allChunksLoadedSuccessfully = true;
                } else {
                    console.warn(`🛑 [CloudSync pull] Incomplete chunk load (failed: ${failedChunks}/${totalChunks}, got ${Object.keys(mergedCustomEdits).length}/${expectedCount} edits)! Preserving local custom edits.`);
                }
            }

            // Fallback: If chunked store not yet created, load from legacy docs
            if (Object.keys(mergedCustomEdits).length === 0) {
                if (editsDoc && editsDoc.exists && editsDoc.data()?.customEdits) {
                    mergedCustomEdits = editsDoc.data().customEdits;
                    allChunksLoadedSuccessfully = true;
                } else if (legacyDoc && legacyDoc.exists && legacyDoc.data()?.customEdits) {
                    mergedCustomEdits = legacyDoc.data().customEdits;
                    allChunksLoadedSuccessfully = true;
                }
            }

            // B. Load Flags, Unflagged Resolves & Deleted Keys
            let cloudUnflagged = {};
            if (flagsDoc && flagsDoc.exists) {
                const fData = flagsDoc.data() || {};
                if (fData.needsEditData) {
                    try { mergedNeedsEdit = JSON.parse(fData.needsEditData); } catch (e) {}
                } else if (fData.needsEditMap) {
                    mergedNeedsEdit = fData.needsEditMap;
                }
                if (fData.unflaggedData) {
                    try { cloudUnflagged = JSON.parse(fData.unflaggedData); } catch (e) {}
                }
                mergedDeletedKeys = fData.deletedKeys || [];
            } else if (legacyDoc && legacyDoc.exists) {
                const lData = legacyDoc.data() || {};
                mergedNeedsEdit = lData.needsEditMap || {};
                mergedDeletedKeys = lData.deletedKeys || [];
            }

            // C. Load Stats & History
            if (statsDoc && statsDoc.exists) {
                const sData = statsDoc.data() || {};
                if (sData.statsData) {
                    try { mergedStats = JSON.parse(sData.statsData); } catch (e) {}
                } else if (Array.isArray(sData.stats)) {
                    mergedStats = sData.stats;
                }
            }
            if (mergedStats.length === 0 && legacyDoc && legacyDoc.exists && Array.isArray(legacyDoc.data()?.stats)) {
                mergedStats = legacyDoc.data().stats;
            }

            if (historyDoc && historyDoc.exists) {
                const hData = historyDoc.data() || {};
                if (hData.historyData) {
                    try { mergedHistory = JSON.parse(hData.historyData); } catch (e) {}
                } else if (Array.isArray(hData.history)) {
                    mergedHistory = hData.history;
                }
            }
            if (mergedHistory.length === 0 && legacyDoc && legacyDoc.exists && Array.isArray(legacyDoc.data()?.history)) {
                mergedHistory = legacyDoc.data().history;
            }

            // Apply merged data to LocalStorage & IndexedDB (Timestamp-based CRDT merge)
            const localEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
            const finalEdits = { ...localEdits };
            if (allChunksLoadedSuccessfully || Object.keys(localEdits).length === 0) {
                if (Object.keys(mergedCustomEdits).length > 0) {
                    Object.keys(mergedCustomEdits).forEach(k => {
                        const cItem = mergedCustomEdits[k];
                        const lItem = finalEdits[k];
                        if (!lItem) {
                            finalEdits[k] = cItem;
                        } else {
                            const cTime = cItem.editedAt ? new Date(cItem.editedAt).getTime() : 0;
                            const lTime = lItem.editedAt ? new Date(lItem.editedAt).getTime() : 0;
                            if (cTime > lTime) {
                                finalEdits[k] = cItem;
                            }
                        }
                    });
                    // Filter against deletedEdits ONLY if deletion happened strictly after edit
                    const localDelEdits = JSON.parse(localStorage.getItem("housing_exam_deleted_edits") || "{}");
                    Object.keys(finalEdits).forEach(k => {
                        const delTime = localDelEdits[k] ? new Date(localDelEdits[k]).getTime() : 0;
                        const editTime = finalEdits[k]?.editedAt ? new Date(finalEdits[k].editedAt).getTime() : 0;
                        if (delTime > 0 && delTime > editTime) {
                            delete finalEdits[k];
                        }
                    });
                    localStorage.setItem("housing_exam_custom_edits", JSON.stringify(finalEdits));
                }
            }

            // Merge local and cloud unflagged records with timestamp comparison
            const localUnflagged = JSON.parse(localStorage.getItem("housing_exam_unflagged_keys") || "{}");
            const mergedUnflagged = { ...localUnflagged };
            Object.keys(cloudUnflagged).forEach(k => {
                const cTime = cloudUnflagged[k] ? new Date(cloudUnflagged[k]).getTime() : 0;
                const lTime = mergedUnflagged[k] ? new Date(mergedUnflagged[k]).getTime() : 0;
                if (cTime >= lTime) mergedUnflagged[k] = cloudUnflagged[k];
            });
            localStorage.setItem("housing_exam_unflagged_keys", JSON.stringify(mergedUnflagged));

            // Clean mergedNeedsEdit against unflagged timestamps and PURGED_NEEDS_EDIT_KEYS
            if (mergedNeedsEdit && typeof mergedNeedsEdit === 'object') {
                Object.keys(mergedNeedsEdit).forEach(k => {
                    if (PURGED_NEEDS_EDIT_KEYS.has(k)) {
                        delete mergedNeedsEdit[k];
                        return;
                    }
                    const unflagTime = mergedUnflagged[k] ? new Date(mergedUnflagged[k]).getTime() : 0;
                    const flagTime = mergedNeedsEdit[k]?.flaggedAt ? new Date(mergedNeedsEdit[k].flaggedAt).getTime() : 0;
                    if (unflagTime > 0 && unflagTime >= flagTime) {
                        delete mergedNeedsEdit[k];
                    }
                });
            }

            if (flagsDoc && flagsDoc.exists) {
                localStorage.setItem("housing_exam_needs_edit", JSON.stringify(mergedNeedsEdit || {}));
            } else if (Object.keys(mergedNeedsEdit).length > 0) {
                const localNeeds = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
                const finalNeeds = { ...localNeeds, ...mergedNeedsEdit };
                // Also clean against unflagged and PURGED_NEEDS_EDIT_KEYS
                Object.keys(finalNeeds).forEach(k => {
                    if (PURGED_NEEDS_EDIT_KEYS.has(k) || mergedUnflagged[k]) delete finalNeeds[k];
                });
                localStorage.setItem("housing_exam_needs_edit", JSON.stringify(finalNeeds));
            }

            // Wipe stale local deleted_edits so old local tombstones never kill cloud edits!
            localStorage.removeItem("housing_exam_deleted_edits");

            if (mergedDeletedKeys.length > 0) {
                const localDel = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
                const finalDel = Array.from(new Set([...localDel, ...mergedDeletedKeys]));
                localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(finalDel));
            }

            if (window.IDBStore && (mergedStats.length > 0 || mergedHistory.length > 0)) {
                await window.IDBStore.importBackupJSON({
                    stats: mergedStats,
                    history: mergedHistory
                });
            }

            if (reportsDoc && reportsDoc.exists && reportsDoc.data()?.reportsData) {
                try {
                    const cloudReports = JSON.parse(reportsDoc.data().reportsData || "[]");
                    if (Array.isArray(cloudReports) && cloudReports.length > 0) {
                        const localReports = JSON.parse(localStorage.getItem("housing_exam_tutoring_reports") || "[]");
                        const map = new Map();
                        cloudReports.forEach(r => map.set(r.id, r));
                        localReports.forEach(r => map.set(r.id, r));
                        const mergedReports = Array.from(map.values()).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
                        localStorage.setItem("housing_exam_tutoring_reports", JSON.stringify(mergedReports));
                    }
                } catch (e) {
                    console.error("Reports pull error:", e);
                }
            }

            this.lastSyncTime = new Date();
            if (!this.isOutdated) {
                this.syncStatus = "synced";
            }
            console.log("✅ Cloud modular chunk pull complete. Custom edits count:", Object.keys(mergedCustomEdits).length, "Stats count:", mergedStats.length);
            this.notifyStatusChange();
            // REMOVED auto-push schedulePush(1500) to prevent ghost overwrites on simple page read!
            return true;
        } catch (err) {
            console.error("Cloud pull error:", err);
            this.syncStatus = "error";
            this.notifyStatusChange();
            return false;
        }
    },

    /**
     * Push current local data (stats, edits, flags, history) to Firestore
     */
    _pushTimeout: null,
    schedulePush(delayMs = 300) {
        if (this._pushTimeout) clearTimeout(this._pushTimeout);
        this._pushTimeout = setTimeout(() => {
            this.pushToCloud();
        }, delayMs);
    },

    flushPendingPush() {
        if (this._pushTimeout) {
            clearTimeout(this._pushTimeout);
            this._pushTimeout = null;
            return this.pushToCloud();
        }
        return Promise.resolve(false);
    },

    async pushToCloud() {
        if (!this.isInitialized || !this.db) return false;
        if (this.isSyncing) return;

        try {
            this.isSyncing = true;
            this.syncStatus = "syncing";
            this.notifyStatusChange();

            let localStats = [];
            let localHistory = [];
            if (window.IDBStore) {
                try {
                    const fullBackup = await window.IDBStore.exportBackupJSON();
                    // Filter active stats only (tryCount > 0 or wrongCount > 0 or weight > 1)
                    localStats = (fullBackup.stats || []).filter(s => (s.tryCount > 0 || s.wrongCount > 0 || (s.weight && s.weight > 1)));
                    localHistory = (fullBackup.history || []).slice(-100);
                } catch (e) {
                    console.error("IDBStore export error in pushToCloud:", e);
                }
            }

            const customEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
            const needsEditMap = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
            const unflaggedKeys = JSON.parse(localStorage.getItem("housing_exam_unflagged_keys") || "{}");
            const deletedKeys = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
            const nowIso = new Date().toISOString();

            const syncCol = this.db.collection("exam_hell_sync");
            const chunkPromises = [];

            // 1. Fetch current cloud edits, stats, history, flags & version for safe bidirectional merge & version check
            let currentCloudEdits = {};
            let currentCloudStats = [];
            let currentCloudHistory = [];
            let currentCloudNeedsEdit = {};
            let currentCloudUnflagged = {};
            let currentCloudDeletedKeys = [];
            let cloudBuild = '0';
            let cloudVer = '';

            try {
                const [metaDoc, statsDoc, histDoc, flagsDoc, versionDoc] = await Promise.all([
                    syncCol.doc("edits_meta").get().catch(() => null),
                    syncCol.doc("stats_store").get().catch(() => null),
                    syncCol.doc("history_store").get().catch(() => null),
                    syncCol.doc("flags_store").get().catch(() => null),
                    syncCol.doc("version_meta").get().catch(() => null)
                ]);

                if (versionDoc && versionDoc.exists) {
                    const vData = versionDoc.data() || {};
                    cloudBuild = String(vData.latestBuild || '0');
                    cloudVer = vData.latestVersion || ('v.' + cloudBuild);
                }

                if (metaDoc && metaDoc.exists) {
                    const totalChunks = metaDoc.data()?.totalChunks || 1;
                    const cPromises = [];
                    for (let i = 0; i < totalChunks; i++) {
                        cPromises.push(syncCol.doc(`edits_chunk_${i}`).get().catch(() => null));
                    }
                    const cDocs = await Promise.all(cPromises);
                    let missingChunk = false;
                    cDocs.forEach(cd => {
                        if (cd && cd.exists && cd.data()?.data) {
                            try { Object.assign(currentCloudEdits, JSON.parse(cd.data().data)); } catch (e) { missingChunk = true; }
                        } else {
                            missingChunk = true;
                        }
                    });
                    const expectedTotal = metaDoc.data()?.totalCount || 0;
                    if (missingChunk || Object.keys(currentCloudEdits).length < expectedTotal) {
                        console.warn(`🛑 [CloudSync push] Failed to load complete cloud chunks (${Object.keys(currentCloudEdits).length}/${expectedTotal})! Aborting push to protect data.`);
                        this.isSyncing = false;
                        this.syncStatus = "synced";
                        this.notifyStatusChange();
                        return false;
                    }
                }

                if (statsDoc && statsDoc.exists) {
                    const sData = statsDoc.data() || {};
                    if (sData.statsData) {
                        try { currentCloudStats = JSON.parse(sData.statsData); } catch (e) {}
                    } else if (Array.isArray(sData.stats)) {
                        currentCloudStats = sData.stats;
                    }
                }

                if (histDoc && histDoc.exists) {
                    const hData = histDoc.data() || {};
                    if (hData.historyData) {
                        try { currentCloudHistory = JSON.parse(hData.historyData); } catch (e) {}
                    } else if (Array.isArray(hData.history)) {
                        currentCloudHistory = hData.history;
                    }
                }

                if (flagsDoc && flagsDoc.exists) {
                    const fData = flagsDoc.data() || {};
                    if (fData.needsEditData) {
                        try { currentCloudNeedsEdit = JSON.parse(fData.needsEditData); } catch (e) {}
                    } else if (fData.needsEditMap) {
                        currentCloudNeedsEdit = fData.needsEditMap;
                    }
                    if (fData.unflaggedData) {
                        try { currentCloudUnflagged = JSON.parse(fData.unflaggedData); } catch (e) {}
                    }
                    currentCloudDeletedKeys = fData.deletedKeys || [];
                }
            } catch (e) {
                console.warn("Error fetching cloud data in pushToCloud:", e);
            }

            // Version Guard: Refuse push if local client is outdated!
            const localBuild = String((typeof window !== 'undefined' && window.APP_BUILD_VERSION) || '0');
            const localVer = (typeof window !== 'undefined' && window.APP_SEMVER) || ('v.' + localBuild);

            if (parseInt(cloudBuild, 10) > parseInt(localBuild, 10)) {
                console.warn(`🛑 [Version Guard] Upload BLOCKED! Cloud build (${cloudBuild}, ${cloudVer}) > local build (${localBuild}, ${localVer}).`);
                this.isOutdated = true;
                this.cloudBuild = cloudBuild;
                this.cloudVersion = cloudVer;
                this.isSyncing = false;
                this.syncStatus = "update_required";
                this.notifyStatusChange();
                return false;
            }

            // Bidirectional CRDT Merge for Stats
            const mergedStatsMap = new Map();
            currentCloudStats.forEach(s => {
                if (s && s.qKey) mergedStatsMap.set(s.qKey, s);
            });
            localStats.forEach(loc => {
                if (!loc || !loc.qKey) return;
                const cld = mergedStatsMap.get(loc.qKey);
                if (!cld) {
                    mergedStatsMap.set(loc.qKey, loc);
                } else {
                    const locTime = loc.lastAttempt ? new Date(loc.lastAttempt).getTime() : 0;
                    const cldTime = cld.lastAttempt ? new Date(cld.lastAttempt).getTime() : 0;
                    const base = (locTime >= cldTime) ? { ...loc } : { ...cld };
                    base.tryCount = Math.max(loc.tryCount || 0, cld.tryCount || 0);
                    base.totalWrongCount = Math.max(loc.totalWrongCount || 0, cld.totalWrongCount || 0);
                    base.correctCount = Math.max(loc.correctCount || 0, cld.correctCount || 0);
                    mergedStatsMap.set(loc.qKey, base);
                }
            });
            const mergedStatsToPush = Array.from(mergedStatsMap.values());

            // Bidirectional merge for History
            const mergedHistMap = new Map();
            currentCloudHistory.forEach(h => {
                if (h && (h.sessionId || h.date)) mergedHistMap.set(h.sessionId || h.date, h);
            });
            localHistory.forEach(h => {
                if (h && (h.sessionId || h.date)) mergedHistMap.set(h.sessionId || h.date, h);
            });
            const mergedHistToPush = Array.from(mergedHistMap.values()).slice(-100);

            // If cloud had stats/history that local was missing, update local IDB immediately
            if (window.IDBStore && (currentCloudStats.length > 0 || currentCloudHistory.length > 0)) {
                try {
                    await window.IDBStore.importBackupJSON({
                        stats: mergedStatsToPush,
                        history: mergedHistToPush
                    });
                } catch (e) {}
            }

            // Merge cloud + local edits by editedAt timestamp
            const mergedToPush = { ...currentCloudEdits };
            Object.keys(customEdits).forEach(k => {
                const loc = customEdits[k];
                const cld = mergedToPush[k];
                if (!cld) {
                    mergedToPush[k] = loc;
                } else {
                    const lTime = loc.editedAt ? new Date(loc.editedAt).getTime() : 0;
                    const cTime = cld.editedAt ? new Date(cld.editedAt).getTime() : 0;
                    if (lTime >= cTime) {
                        mergedToPush[k] = loc;
                    }
                }
            });
            // Filter against deletedEdits ONLY if deletion happened strictly after edit
            const localDelEdits = JSON.parse(localStorage.getItem("housing_exam_deleted_edits") || "{}");
            Object.keys(mergedToPush).forEach(k => {
                const delTime = localDelEdits[k] ? new Date(localDelEdits[k]).getTime() : 0;
                const editTime = mergedToPush[k]?.editedAt ? new Date(mergedToPush[k].editedAt).getTime() : 0;
                if (delTime > 0 && delTime > editTime) {
                    delete mergedToPush[k];
                }
            });

            // ANTI-SHRINK GUARD: Block upload if custom edits totalCount would shrink significantly (more than 2 items)!
            const cloudTotalCount = (metaDoc && metaDoc.exists) ? (metaDoc.data()?.totalCount || 0) : 0;
            const localCountToPush = Object.keys(mergedToPush).length;
            if (cloudTotalCount > 0 && (cloudTotalCount - localCountToPush) > 2) {
                console.warn(`🛑 [CloudSync Anti-Shrink Guard] Upload BLOCKED! Cloud has ${cloudTotalCount} edits, but candidate only has ${localCountToPush}. Aborting push to prevent loss.`);
                this.isSyncing = false;
                this.syncStatus = "synced";
                this.notifyStatusChange();
                return false;
            }

            localStorage.setItem("housing_exam_custom_edits", JSON.stringify(mergedToPush));

            // Bidirectional CRDT Merge for Flags (needsEdit, unflagged, deletedKeys)
            const mergedUnflagged = { ...currentCloudUnflagged };
            Object.keys(unflaggedKeys).forEach(k => {
                const lTime = unflaggedKeys[k] ? new Date(unflaggedKeys[k]).getTime() : 0;
                const cTime = mergedUnflagged[k] ? new Date(mergedUnflagged[k]).getTime() : 0;
                if (lTime >= cTime) mergedUnflagged[k] = unflaggedKeys[k];
            });
            localStorage.setItem("housing_exam_unflagged_keys", JSON.stringify(mergedUnflagged));

            const mergedNeedsEdit = { ...currentCloudNeedsEdit };
            const cloudFlagsUpdatedTime = (flagsDoc && flagsDoc.exists && flagsDoc.data()?.updatedAt)
                ? new Date(flagsDoc.data().updatedAt).getTime() : 0;
            const sessionStartMs = new Date(this.sessionStartTime || Date.now()).getTime();

            Object.keys(needsEditMap).forEach(k => {
                if (PURGED_NEEDS_EDIT_KEYS.has(k)) {
                    delete needsEditMap[k];
                    return;
                }
                const loc = needsEditMap[k];
                const cld = mergedNeedsEdit[k];
                if (!cld) {
                    // CRITICAL: Only add if loc was flagged in CURRENT active session!
                    const locTime = loc.flaggedAt ? new Date(loc.flaggedAt).getTime() : 0;
                    if (locTime < sessionStartMs || (cloudFlagsUpdatedTime > 0 && locTime <= cloudFlagsUpdatedTime)) {
                        // Stale ghost flag from a past session! Discard!
                        return;
                    }
                    mergedNeedsEdit[k] = loc;
                } else {
                    const lTime = loc.flaggedAt ? new Date(loc.flaggedAt).getTime() : 0;
                    const cTime = cld.flaggedAt ? new Date(cld.flaggedAt).getTime() : 0;
                    if (lTime >= cTime) mergedNeedsEdit[k] = loc;
                }
            });

            // Clean mergedNeedsEdit against unflagged timestamps and PURGED_NEEDS_EDIT_KEYS
            Object.keys(mergedNeedsEdit).forEach(k => {
                if (PURGED_NEEDS_EDIT_KEYS.has(k)) {
                    delete mergedNeedsEdit[k];
                    return;
                }
                const unflagTime = mergedUnflagged[k] ? new Date(mergedUnflagged[k]).getTime() : 0;
                const flagTime = mergedNeedsEdit[k]?.flaggedAt ? new Date(mergedNeedsEdit[k].flaggedAt).getTime() : 0;
                if (unflagTime > 0 && unflagTime >= flagTime) {
                    delete mergedNeedsEdit[k];
                }
            });
            localStorage.setItem("housing_exam_needs_edit", JSON.stringify(mergedNeedsEdit));

            const mergedDelKeys = Array.from(new Set([...deletedKeys, ...currentCloudDeletedKeys]));
            localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(mergedDelKeys));

            // 1. Save Custom Edits into safe 150-item JSON-string chunks
            const editKeys = Object.keys(mergedToPush);
            const CHUNK_SIZE = 150;
            const numChunks = Math.max(1, Math.ceil(editKeys.length / CHUNK_SIZE));

            chunkPromises.push(syncCol.doc("edits_meta").set({
                totalChunks: numChunks,
                totalCount: editKeys.length,
                updatedAt: nowIso
            }));

            for (let i = 0; i < numChunks; i++) {
                const sliceKeys = editKeys.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                const chunkObj = {};
                sliceKeys.forEach(k => { chunkObj[k] = mergedToPush[k]; });
                chunkPromises.push(syncCol.doc(`edits_chunk_${i}`).set({
                    chunkIndex: i,
                    chunkSize: sliceKeys.length,
                    totalChunks: numChunks,
                    data: JSON.stringify(chunkObj),
                    updatedAt: nowIso
                }));
            }

            // 2. Save active Stats, History, and Flags as compact JSON-strings
            chunkPromises.push(syncCol.doc("stats_store").set({
                statsData: JSON.stringify(mergedStatsToPush),
                count: mergedStatsToPush.length,
                updatedAt: nowIso
            }));

            chunkPromises.push(syncCol.doc("history_store").set({
                historyData: JSON.stringify(mergedHistToPush),
                count: mergedHistToPush.length,
                updatedAt: nowIso
            }));

            chunkPromises.push(syncCol.doc("flags_store").set({
                needsEditData: JSON.stringify(mergedNeedsEdit),
                unflaggedData: JSON.stringify(mergedUnflagged),
                deletedKeys: mergedDelKeys,
                updatedAt: nowIso
            }));

            // Record latest version in Firestore
            if (parseInt(localBuild, 10) >= parseInt(cloudBuild, 10)) {
                chunkPromises.push(syncCol.doc("version_meta").set({
                    latestBuild: localBuild,
                    latestVersion: localVer,
                    updatedAt: nowIso
                }));
            }

            const tutoringReports = JSON.parse(localStorage.getItem("housing_exam_tutoring_reports") || "[]");
            chunkPromises.push(syncCol.doc("reports_store").set({
                reportsData: JSON.stringify(tutoringReports.slice(0, 50)),
                count: Math.min(tutoringReports.length, 50),
                updatedAt: nowIso
            }));

            await Promise.all(chunkPromises);

            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            this.isSyncing = false;
            console.log(`📤 Cloud chunk push complete. ${editKeys.length} edits across ${numChunks} chunks.`);
            this.notifyStatusChange();
            return true;
        } catch (err) {
            console.error("Cloud push error:", err);
            this.isSyncing = false;
            this.syncStatus = "error";
            this.notifyStatusChange();
            return false;
        }
    }
};

window.CloudSync = CloudSync;
