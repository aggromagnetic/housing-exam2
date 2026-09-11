/**
 * Housing Exam Hell - Firebase Cloud Realtime Sync Engine
 * Realtime WebSocket Synchronizer (onSnapshot) + Ultra-Fast Stats Push (50ms)
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
    "관리실무_short_CHAPTER 01 주택의 정의 및 종류_06",
    "관리실무_short_CHAPTER 04 관리조직 및 입주자대표회의_28",
    "관리실무_short_CHAPTER 04 관리조직 및 입주자대표회의_91",
    "관리실무_short_CHAPTER 11 시설관리_472"
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
    _statsListeners: [],
    _flagsListeners: [],
    _unsubs: [],

    _lastPushedStatsTime: null,
    _lastPushedFlagsTime: null,
    _isStatsPushing: false,
    _hasPendingStatsPush: false,

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

            // 1. Start Realtime WebSocket Listeners for Instant 0.1s Zero-Click Sync!
            this.startRealtimeListeners();

            // 2. Start 3-minute idle background polling fallback
            this.startIdlePolling();

            // 3. Online network reconnection listener
            if (typeof window !== "undefined") {
                window.addEventListener("online", () => {
                    console.log("🌐 Network online restored! Triggering immediate sync...");
                    this.pullFromCloud();
                    this.pushStatsOnly();
                });
            }

            // Return initial pull promise so caller can await it
            return this.pullFromCloud();
        } catch (err) {
            console.error("Firebase init error:", err);
            this.syncStatus = "error";
            this.notifyStatusChange();
            return Promise.resolve(false);
        }
    },

    startRealtimeListeners() {
        if (!this.db || this._unsubs.length > 0) return;
        const syncCol = this.db.collection("exam_hell_sync");

        // ⚡ 1. Realtime Stats Listener: Instant 0.05s push/pull across PC & Tablet!
        try {
            const unsubStats = syncCol.doc("stats_store").onSnapshot(async (doc) => {
                if (!doc.exists) return;
                const data = doc.data();
                if (!data) return;
                const cloudUpdatedAt = data.updatedAt || "";
                if (this._lastPushedStatsTime && cloudUpdatedAt === this._lastPushedStatsTime) {
                    return; // Echo from our own push, ignore
                }

                let cloudStats = [];
                if (data.statsData) {
                    try { cloudStats = JSON.parse(data.statsData); } catch (e) {}
                } else if (Array.isArray(data.stats)) {
                    cloudStats = data.stats;
                }

                if (cloudStats.length > 0 && window.IDBStore) {
                    await window.IDBStore.importBackupJSON({ stats: cloudStats });
                    this.notifyStatsUpdated();
                }
            }, err => console.warn("stats onSnapshot warning:", err));
            this._unsubs.push(unsubStats);
        } catch (e) { console.warn("Failed to attach stats onSnapshot:", e); }

        // ⚡ 2. Realtime Flags Listener: Needs-edit flags sync in 0.1s
        try {
            const unsubFlags = syncCol.doc("flags_store").onSnapshot(async (doc) => {
                if (!doc.exists) return;
                const data = doc.data();
                if (!data) return;
                const cloudUpdatedAt = data.updatedAt || "";
                if (this._lastPushedFlagsTime && cloudUpdatedAt === this._lastPushedFlagsTime) {
                    return;
                }

                let cloudNeedsEdit = {};
                if (data.needsEditData) {
                    try { cloudNeedsEdit = JSON.parse(data.needsEditData); } catch (e) {}
                } else if (data.needsEditMap) {
                    cloudNeedsEdit = data.needsEditMap;
                }

                let cloudUnflagged = {};
                if (data.unflaggedData) {
                    try { cloudUnflagged = JSON.parse(data.unflaggedData); } catch (e) {}
                }

                const localUnflagged = JSON.parse(localStorage.getItem("housing_exam_unflagged_keys") || "{}");
                const mergedUnflagged = { ...localUnflagged, ...cloudUnflagged };
                localStorage.setItem("housing_exam_unflagged_keys", JSON.stringify(mergedUnflagged));

                // Safe union merge with local needsEdit
                const localNeeds = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
                const combinedNeeds = { ...localNeeds, ...cloudNeedsEdit };
                if (Object.keys(combinedNeeds).length > 0) {
                    Object.keys(combinedNeeds).forEach(k => {
                        if (PURGED_NEEDS_EDIT_KEYS.has(k) || mergedUnflagged[k]) {
                            delete combinedNeeds[k];
                        }
                    });
                }
                localStorage.setItem("housing_exam_needs_edit", JSON.stringify(combinedNeeds));
                if (data.deletedKeys) {
                    const localDel = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
                    localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(Array.from(new Set([...localDel, ...data.deletedKeys]))));
                }
                this.notifyFlagsUpdated();
            }, err => console.warn("flags onSnapshot warning:", err));
            this._unsubs.push(unsubFlags);
        } catch (e) { console.warn("Failed to attach flags onSnapshot:", e); }

        // ⚡ 3. Realtime Version Check Listener
        try {
            const unsubVer = syncCol.doc("version_meta").onSnapshot((doc) => {
                if (!doc.exists) return;
                const vData = doc.data() || {};
                const cloudBuild = String(vData.latestBuild || "0");
                const cloudVer = vData.latestVersion || ("v." + cloudBuild);
                const localBuild = String((typeof window !== "undefined" && window.APP_BUILD_VERSION) || "0");
                if (parseInt(cloudBuild, 10) > parseInt(localBuild, 10)) {
                    this.isOutdated = true;
                    this.cloudBuild = cloudBuild;
                    this.cloudVersion = cloudVer;
                    this.syncStatus = "update_required";
                    this.notifyStatusChange();
                }
            }, err => console.warn("version onSnapshot warning:", err));
            this._unsubs.push(unsubVer);
        } catch (e) { console.warn("Failed to attach version onSnapshot:", e); }
    },

    startIdlePolling() {
        if (this._idleInterval) clearInterval(this._idleInterval);
        this._idleInterval = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState === "visible" && !this.isSyncing) {
                this.pullFromCloud();
            }
        }, 180000); // 3 minutes
    },

    onStatusChange(cb) {
        if (typeof cb === "function") this.listeners.push(cb);
    },

    notifyStatusChange() {
        this.listeners.forEach(cb => {
            try { cb(this.syncStatus, this.lastSyncTime); } catch (e) {}
        });
    },

    onStatsUpdated(cb) {
        if (typeof cb === "function") this._statsListeners.push(cb);
    },

    notifyStatsUpdated() {
        this._statsListeners.forEach(cb => {
            try { cb(); } catch (e) {}
        });
    },

    onFlagsUpdated(cb) {
        if (typeof cb === "function") this._flagsListeners.push(cb);
    },

    notifyFlagsUpdated() {
        this._flagsListeners.forEach(cb => {
            try { cb(); } catch (e) {}
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
            
            // Fetch metadata and documents concurrently
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

            // Version check
            let cloudBuild = "0";
            let cloudVer = "";
            if (versionDoc && versionDoc.exists) {
                const vData = versionDoc.data() || {};
                cloudBuild = String(vData.latestBuild || "0");
                cloudVer = vData.latestVersion || ("v." + cloudBuild);
            }
            const localBuild = String((typeof window !== "undefined" && window.APP_BUILD_VERSION) || "0");
            const localVer = (typeof window !== "undefined" && window.APP_SEMVER) || ("v." + localBuild);

            if (parseInt(cloudBuild, 10) > parseInt(localBuild, 10)) {
                this.isOutdated = true;
                this.cloudBuild = cloudBuild;
                this.cloudVersion = cloudVer;
                this.syncStatus = "update_required";
                this.notifyStatusChange();
            } else {
                this.isOutdated = false;
            }

            let mergedCustomEdits = {};
            let mergedNeedsEdit = {};
            let mergedDeletedKeys = [];
            let mergedStats = [];
            let mergedHistory = [];

            // A. Load Custom Edits (If totalCount == 0, base bank is baked in!)
            let allChunksLoadedSuccessfully = false;
            if (editsMetaDoc && editsMetaDoc.exists) {
                const meta = editsMetaDoc.data() || {};
                const totalChunks = meta.totalChunks || 0;
                if (totalChunks > 0) {
                    const chunkPromises = [];
                    for (let i = 0; i < totalChunks; i++) {
                        chunkPromises.push(syncCol.doc(`edits_chunk_${i}`).get().catch(() => null));
                    }
                    const chunkDocs = await Promise.all(chunkPromises);
                    let failedChunks = 0;
                    chunkDocs.forEach(cDoc => {
                        if (cDoc && cDoc.exists && cDoc.data()?.data) {
                            try {
                                Object.assign(mergedCustomEdits, JSON.parse(cDoc.data().data));
                            } catch (e) { failedChunks++; }
                        } else { failedChunks++; }
                    });
                    if (failedChunks === 0) allChunksLoadedSuccessfully = true;
                } else {
                    allChunksLoadedSuccessfully = true;
                    // Reset localStorage custom edits since all 1,275 edits are now baked into exam_bank.js!
                    localStorage.setItem("housing_exam_custom_edits", "{}");
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

            if (historyDoc && historyDoc.exists) {
                const hData = historyDoc.data() || {};
                if (hData.historyData) {
                    try { mergedHistory = JSON.parse(hData.historyData); } catch (e) {}
                } else if (Array.isArray(hData.history)) {
                    mergedHistory = hData.history;
                }
            }

            // Apply custom edits merge if any dynamic edits exist
            if (Object.keys(mergedCustomEdits).length > 0) {
                const localEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
                const finalEdits = { ...localEdits, ...mergedCustomEdits };
                localStorage.setItem("housing_exam_custom_edits", JSON.stringify(finalEdits));
            }

            // Merge unflagged and clean needsEdit
            const localUnflagged = JSON.parse(localStorage.getItem("housing_exam_unflagged_keys") || "{}");
            const mergedUnflagged = { ...localUnflagged, ...cloudUnflagged };
            localStorage.setItem("housing_exam_unflagged_keys", JSON.stringify(mergedUnflagged));

            // Safe Bidirectional Union Merge for needsEdit: Never wipe local flags!
            const localNeeds = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
            const combinedNeeds = { ...localNeeds, ...(mergedNeedsEdit || {}) };

            if (combinedNeeds && typeof combinedNeeds === "object") {
                Object.keys(combinedNeeds).forEach(k => {
                    if (PURGED_NEEDS_EDIT_KEYS.has(k) || mergedUnflagged[k]) {
                        delete combinedNeeds[k];
                    }
                });
            }
            localStorage.setItem("housing_exam_needs_edit", JSON.stringify(combinedNeeds || {}));

            if (mergedDeletedKeys.length > 0) {
                const localDel = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
                localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(Array.from(new Set([...localDel, ...mergedDeletedKeys]))));
            }

            // Import stats into IndexedDB
            if (window.IDBStore && (mergedStats.length > 0 || mergedHistory.length > 0)) {
                await window.IDBStore.importBackupJSON({
                    stats: mergedStats,
                    history: mergedHistory
                });
            }

            // Reports store (keep local max 10 to protect 5MB quota)
            if (reportsDoc && reportsDoc.exists && reportsDoc.data()?.reportsData) {
                try {
                    const cloudReports = JSON.parse(reportsDoc.data().reportsData || "[]");
                    if (Array.isArray(cloudReports) && cloudReports.length > 0) {
                        const localReports = JSON.parse(localStorage.getItem("housing_exam_tutoring_reports") || "[]");
                        const map = new Map();
                        cloudReports.forEach(r => map.set(r.id, r));
                        localReports.forEach(r => map.set(r.id, r));
                        const mergedReports = Array.from(map.values()).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);
                        localStorage.setItem("housing_exam_tutoring_reports", JSON.stringify(mergedReports));
                    }
                } catch (e) {}
            }

            this.lastSyncTime = new Date();
            if (!this.isOutdated) {
                this.syncStatus = "synced";
            }
            this.notifyStatusChange();

            // After pull completes, if this device has local stats that were never pushed (e.g. tablet),
            // trigger instant stats push so cloud receives them immediately!
            setTimeout(() => {
                this.pushStatsOnly();
                this.pushFlagsOnly();
            }, 300);

            return true;
        } catch (err) {
            console.error("Cloud pull error:", err);
            this.syncStatus = "error";
            this.notifyStatusChange();
            return false;
        }
    },

    /**
     * ⚡ Ultra-Fast 0.05s Stats Only Push (Used on every question answer)
     * Reads/writes ONLY stats_store (1 document, 50ms). Never blocks on 9-chunk loading!
     */
    _statsPushTimeout: null,
    scheduleStatsPush(delayMs = 60) {
        if (this._statsPushTimeout) clearTimeout(this._statsPushTimeout);
        this._statsPushTimeout = setTimeout(() => {
            this.pushStatsOnly();
        }, delayMs);
    },

    async pushStatsOnly() {
        if (!this.isInitialized || !this.db) return false;
        if (this._isStatsPushing) {
            this._hasPendingStatsPush = true;
            return false;
        }

        try {
            this._isStatsPushing = true;
            if (!window.IDBStore) return false;

            const fullBackup = await window.IDBStore.exportBackupJSON();
            const localStats = (fullBackup.stats || []).filter(s => (s.tryCount > 0 || s.wrongCount > 0 || (s.weight && s.weight > 1) || s.resetAt));

            const syncCol = this.db.collection("exam_hell_sync");
            const statsDoc = await syncCol.doc("stats_store").get().catch(() => null);
            let currentCloudStats = [];
            if (statsDoc && statsDoc.exists) {
                const sData = statsDoc.data() || {};
                if (sData.statsData) {
                    try { currentCloudStats = JSON.parse(sData.statsData); } catch (e) {}
                } else if (Array.isArray(sData.stats)) {
                    currentCloudStats = sData.stats;
                }
            }

            // CRDT Merge with Tombstone Support
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
                    // Check Tombstone (resetQuestionWeight)
                    if (loc.resetAt) {
                        const resetTime = new Date(loc.resetAt).getTime();
                        const cldWrongTime = cld.lastWrongAt ? new Date(cld.lastWrongAt).getTime() : 0;
                        if (resetTime >= cldWrongTime) {
                            mergedStatsMap.set(loc.qKey, loc);
                            return;
                        }
                    }

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
            const nowIso = new Date().toISOString();
            this._lastPushedStatsTime = nowIso;

            await syncCol.doc("stats_store").set({
                statsData: JSON.stringify(mergedStatsToPush),
                count: mergedStatsToPush.length,
                updatedAt: nowIso
            });

            // Update local IDB with merged result
            await window.IDBStore.importBackupJSON({ stats: mergedStatsToPush });
            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            this.notifyStatusChange();
            console.log(`⚡ [FastSync] Pushed ${mergedStatsToPush.length} stats in real-time.`);
            return true;
        } catch (err) {
            console.error("pushStatsOnly error:", err);
            return false;
        } finally {
            this._isStatsPushing = false;
            if (this._hasPendingStatsPush) {
                this._hasPendingStatsPush = false;
                this.pushStatsOnly();
            }
        }
    },

    /**
     * Fast real-time flags sync (needsEdit, unflagged, deletedKeys)
     */
    _isFlagsPushing: false,
    _hasPendingFlagsPush: false,
    _flagsPushTimeout: null,

    scheduleFlagsPush(delayMs = 50) {
        if (this._flagsPushTimeout) clearTimeout(this._flagsPushTimeout);
        this._flagsPushTimeout = setTimeout(() => {
            this.pushFlagsOnly();
        }, delayMs);
    },

    async pushFlagsOnly() {
        if (!this.isInitialized || !this.db) return false;
        if (this._isFlagsPushing) {
            this._hasPendingFlagsPush = true;
            return false;
        }

        try {
            this._isFlagsPushing = true;
            const syncCol = this.db.collection("exam_hell_sync");
            const flagsDoc = await syncCol.doc("flags_store").get().catch(() => null);

            let currentCloudNeedsEdit = {};
            let currentCloudUnflagged = {};
            let currentCloudDeletedKeys = [];
            if (flagsDoc && flagsDoc.exists) {
                const fData = flagsDoc.data() || {};
                if (fData.needsEditData) {
                    try { currentCloudNeedsEdit = JSON.parse(fData.needsEditData); } catch (e) {}
                }
                if (fData.unflaggedData) {
                    try { currentCloudUnflagged = JSON.parse(fData.unflaggedData); } catch (e) {}
                }
                currentCloudDeletedKeys = fData.deletedKeys || [];
            }

            const localNeedsEdit = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
            const localUnflagged = JSON.parse(localStorage.getItem("housing_exam_unflagged_keys") || "{}");
            const localDeletedKeys = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");

            // Unflagged merge
            const mergedUnflagged = { ...currentCloudUnflagged };
            Object.keys(localUnflagged).forEach(k => {
                const lTime = localUnflagged[k] ? new Date(localUnflagged[k]).getTime() : 0;
                const cTime = mergedUnflagged[k] ? new Date(mergedUnflagged[k]).getTime() : 0;
                if (lTime >= cTime) mergedUnflagged[k] = localUnflagged[k];
            });
            localStorage.setItem("housing_exam_unflagged_keys", JSON.stringify(mergedUnflagged));

            // NeedsEdit merge
            const mergedNeedsEdit = { ...currentCloudNeedsEdit };
            Object.keys(localNeedsEdit).forEach(k => {
                if (PURGED_NEEDS_EDIT_KEYS.has(k)) return;
                const loc = localNeedsEdit[k];
                const cld = mergedNeedsEdit[k];
                if (!cld) {
                    mergedNeedsEdit[k] = loc;
                } else {
                    const lTime = loc.flaggedAt ? new Date(loc.flaggedAt).getTime() : 0;
                    const cTime = cld.flaggedAt ? new Date(cld.flaggedAt).getTime() : 0;
                    if (lTime >= cTime) mergedNeedsEdit[k] = loc;
                }
            });

            // Filter unflagged and purged
            Object.keys(mergedNeedsEdit).forEach(k => {
                if (PURGED_NEEDS_EDIT_KEYS.has(k) || mergedUnflagged[k]) {
                    delete mergedNeedsEdit[k];
                }
            });
            localStorage.setItem("housing_exam_needs_edit", JSON.stringify(mergedNeedsEdit));

            const mergedDelKeys = Array.from(new Set([...localDeletedKeys, ...currentCloudDeletedKeys]));
            localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(mergedDelKeys));

            const nowIso = new Date().toISOString();
            this._lastPushedFlagsTime = nowIso;

            await syncCol.doc("flags_store").set({
                needsEditData: JSON.stringify(mergedNeedsEdit),
                unflaggedData: JSON.stringify(mergedUnflagged),
                deletedKeys: mergedDelKeys,
                updatedAt: nowIso
            });

            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            this.notifyStatusChange();
            this.notifyFlagsUpdated();
            console.log(`⚡ [FastSync] Pushed ${Object.keys(mergedNeedsEdit).length} flags in real-time.`);
            return true;
        } catch (err) {
            console.error("pushFlagsOnly error:", err);
            return false;
        } finally {
            this._isFlagsPushing = false;
            if (this._hasPendingFlagsPush) {
                this._hasPendingFlagsPush = false;
                this.pushFlagsOnly();
            }
        }
    },

    /**
     * Push full data (edits, flags, history, reports) - Called on manual edits in manager or session finish
     */
    _pushTimeout: null,
    schedulePush(delayMs = 200) {
        if (this._pushTimeout) clearTimeout(this._pushTimeout);
        this._pushTimeout = setTimeout(() => {
            this.pushToCloud();
        }, delayMs);
    },

    flushPendingPush() {
        if (this._statsPushTimeout) {
            clearTimeout(this._statsPushTimeout);
            this._statsPushTimeout = null;
            this.pushStatsOnly();
        }
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
                    localStats = (fullBackup.stats || []).filter(s => (s.tryCount > 0 || s.wrongCount > 0 || (s.weight && s.weight > 1) || s.resetAt));
                    localHistory = (fullBackup.history || []).slice(-50);
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

            let currentCloudEdits = {};
            let currentCloudStats = [];
            let currentCloudHistory = [];
            let currentCloudNeedsEdit = {};
            let currentCloudUnflagged = {};
            let currentCloudDeletedKeys = [];
            let cloudBuild = "0";
            let cloudVer = "";

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
                    cloudBuild = String(vData.latestBuild || "0");
                    cloudVer = vData.latestVersion || ("v." + cloudBuild);
                }

                if (metaDoc && metaDoc.exists) {
                    const totalChunks = metaDoc.data()?.totalChunks || 0;
                    if (totalChunks > 0) {
                        const cPromises = [];
                        for (let i = 0; i < totalChunks; i++) {
                            cPromises.push(syncCol.doc(`edits_chunk_${i}`).get().catch(() => null));
                        }
                        const cDocs = await Promise.all(cPromises);
                        cDocs.forEach(cd => {
                            if (cd && cd.exists && cd.data()?.data) {
                                try { Object.assign(currentCloudEdits, JSON.parse(cd.data().data)); } catch (e) {}
                            }
                        });
                    }
                }

                if (statsDoc && statsDoc.exists) {
                    const sData = statsDoc.data() || {};
                    if (sData.statsData) {
                        try { currentCloudStats = JSON.parse(sData.statsData); } catch (e) {}
                    }
                }

                if (histDoc && histDoc.exists) {
                    const hData = histDoc.data() || {};
                    if (hData.historyData) {
                        try { currentCloudHistory = JSON.parse(hData.historyData); } catch (e) {}
                    }
                }

                if (flagsDoc && flagsDoc.exists) {
                    const fData = flagsDoc.data() || {};
                    if (fData.needsEditData) {
                        try { currentCloudNeedsEdit = JSON.parse(fData.needsEditData); } catch (e) {}
                    }
                    if (fData.unflaggedData) {
                        try { currentCloudUnflagged = JSON.parse(fData.unflaggedData); } catch (e) {}
                    }
                    currentCloudDeletedKeys = fData.deletedKeys || [];
                }
            } catch (e) {}

            // Version Guard
            const localBuild = String((typeof window !== "undefined" && window.APP_BUILD_VERSION) || "0");
            const localVer = (typeof window !== "undefined" && window.APP_SEMVER) || ("v." + localBuild);

            if (parseInt(cloudBuild, 10) > parseInt(localBuild, 10)) {
                this.isOutdated = true;
                this.cloudBuild = cloudBuild;
                this.cloudVersion = cloudVer;
                this.isSyncing = false;
                this.syncStatus = "update_required";
                this.notifyStatusChange();
                return false;
            }

            // Stats Merge
            const mergedStatsMap = new Map();
            currentCloudStats.forEach(s => { if (s && s.qKey) mergedStatsMap.set(s.qKey, s); });
            localStats.forEach(loc => {
                if (!loc || !loc.qKey) return;
                const cld = mergedStatsMap.get(loc.qKey);
                if (!cld) {
                    mergedStatsMap.set(loc.qKey, loc);
                } else {
                    if (loc.resetAt) {
                        const resetTime = new Date(loc.resetAt).getTime();
                        const cldWrongTime = cld.lastWrongAt ? new Date(cld.lastWrongAt).getTime() : 0;
                        if (resetTime >= cldWrongTime) {
                            mergedStatsMap.set(loc.qKey, loc);
                            return;
                        }
                    }
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

            // History Merge
            const mergedHistMap = new Map();
            currentCloudHistory.forEach(h => { if (h && (h.sessionId || h.date)) mergedHistMap.set(h.sessionId || h.date, h); });
            localHistory.forEach(h => { if (h && (h.sessionId || h.date)) mergedHistMap.set(h.sessionId || h.date, h); });
            const mergedHistToPush = Array.from(mergedHistMap.values()).slice(-50);

            // Custom Edits Merge (Only newly edited questions)
            const mergedToPush = { ...currentCloudEdits };
            Object.keys(customEdits).forEach(k => {
                const loc = customEdits[k];
                const cld = mergedToPush[k];
                if (!cld) {
                    mergedToPush[k] = loc;
                } else {
                    const lTime = loc.editedAt ? new Date(loc.editedAt).getTime() : 0;
                    const cTime = cld.editedAt ? new Date(cld.editedAt).getTime() : 0;
                    if (lTime >= cTime) mergedToPush[k] = loc;
                }
            });

            // Flags Merge
            const mergedUnflagged = { ...currentCloudUnflagged };
            Object.keys(unflaggedKeys).forEach(k => {
                const lTime = unflaggedKeys[k] ? new Date(unflaggedKeys[k]).getTime() : 0;
                const cTime = mergedUnflagged[k] ? new Date(mergedUnflagged[k]).getTime() : 0;
                if (lTime >= cTime) mergedUnflagged[k] = unflaggedKeys[k];
            });
            localStorage.setItem("housing_exam_unflagged_keys", JSON.stringify(mergedUnflagged));

            const mergedNeedsEdit = { ...currentCloudNeedsEdit };
            Object.keys(needsEditMap).forEach(k => {
                if (PURGED_NEEDS_EDIT_KEYS.has(k)) {
                    delete needsEditMap[k];
                    return;
                }
                const loc = needsEditMap[k];
                const cld = mergedNeedsEdit[k];
                if (!cld) {
                    mergedNeedsEdit[k] = loc;
                } else {
                    const lTime = loc.flaggedAt ? new Date(loc.flaggedAt).getTime() : 0;
                    const cTime = cld.flaggedAt ? new Date(cld.flaggedAt).getTime() : 0;
                    if (lTime >= cTime) mergedNeedsEdit[k] = loc;
                }
            });

            Object.keys(mergedNeedsEdit).forEach(k => {
                if (PURGED_NEEDS_EDIT_KEYS.has(k) || mergedUnflagged[k]) {
                    delete mergedNeedsEdit[k];
                }
            });
            localStorage.setItem("housing_exam_needs_edit", JSON.stringify(mergedNeedsEdit));

            const mergedDelKeys = Array.from(new Set([...deletedKeys, ...currentCloudDeletedKeys]));
            localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(mergedDelKeys));

            // Push Edits: Only if there are dynamic custom edits
            const editKeys = Object.keys(mergedToPush);
            if (editKeys.length > 0) {
                const CHUNK_SIZE = 150;
                const numChunks = Math.ceil(editKeys.length / CHUNK_SIZE);
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
            } else {
                chunkPromises.push(syncCol.doc("edits_meta").set({
                    totalChunks: 0,
                    totalCount: 0,
                    updatedAt: nowIso
                }));
            }

            // Push Stats & History & Flags
            this._lastPushedStatsTime = nowIso;
            this._lastPushedFlagsTime = nowIso;

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

            if (parseInt(localBuild, 10) >= parseInt(cloudBuild, 10)) {
                chunkPromises.push(syncCol.doc("version_meta").set({
                    latestBuild: localBuild,
                    latestVersion: localVer,
                    updatedAt: nowIso
                }));
            }

            const tutoringReports = JSON.parse(localStorage.getItem("housing_exam_tutoring_reports") || "[]").slice(0, 10);
            chunkPromises.push(syncCol.doc("reports_store").set({
                reportsData: JSON.stringify(tutoringReports),
                count: tutoringReports.length,
                updatedAt: nowIso
            }));

            await Promise.all(chunkPromises);

            if (window.IDBStore) {
                await window.IDBStore.importBackupJSON({
                    stats: mergedStatsToPush,
                    history: mergedHistToPush
                });
            }

            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            this.isSyncing = false;
            this.notifyStatusChange();
            console.log("📤 Cloud push complete.");
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
