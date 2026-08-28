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

const CloudSync = {
    db: null,
    isInitialized: false,
    isSyncing: false,
    syncStatus: "offline", // "synced", "syncing", "offline", "error", "local_only"
    lastSyncTime: null,
    listeners: [],

    init() {
        if (typeof firebase === "undefined") {
            console.warn("Firebase SDK not loaded. Running in local-only mode.");
            this.syncStatus = "local_only";
            this.notifyStatusChange();
            return;
        }

        try {
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            this.db = firebase.firestore();
            this.isInitialized = true;
            this.syncStatus = "synced";
            console.log("☁️ Firebase Cloud Sync Engine initialized successfully.");
            this.notifyStatusChange();

            // Initial pull from cloud on startup
            this.pullFromCloud();
        } catch (err) {
            console.error("Firebase init error:", err);
            this.syncStatus = "error";
            this.notifyStatusChange();
        }
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
            const [editsMetaDoc, editsDoc, statsDoc, historyDoc, flagsDoc, legacyDoc] = await Promise.all([
                syncCol.doc("edits_meta").get().catch(() => null),
                syncCol.doc("edits_store").get().catch(() => null),
                syncCol.doc("stats_store").get().catch(() => null),
                syncCol.doc("history_store").get().catch(() => null),
                syncCol.doc("flags_store").get().catch(() => null),
                syncCol.doc(SYNC_USER_DOC).get().catch(() => null)
            ]);

            let mergedCustomEdits = {};
            let mergedNeedsEdit = {};
            let mergedDeletedKeys = [];
            let mergedStats = [];
            let mergedHistory = [];

            // A. Load Custom Edits via High-Speed Chunked Store
            if (editsMetaDoc && editsMetaDoc.exists) {
                const meta = editsMetaDoc.data() || {};
                const totalChunks = meta.totalChunks || 1;
                const chunkPromises = [];
                for (let i = 0; i < totalChunks; i++) {
                    chunkPromises.push(syncCol.doc(`edits_chunk_${i}`).get().catch(() => null));
                }
                const chunkDocs = await Promise.all(chunkPromises);
                chunkDocs.forEach(cDoc => {
                    if (cDoc && cDoc.exists) {
                        const cData = cDoc.data() || {};
                        if (cData.data) {
                            try {
                                const parsed = JSON.parse(cData.data);
                                Object.assign(mergedCustomEdits, parsed);
                            } catch (e) {}
                        }
                    }
                });
            }

            // Fallback: If chunked store not yet created, load from legacy docs
            if (Object.keys(mergedCustomEdits).length === 0) {
                if (editsDoc && editsDoc.exists && editsDoc.data()?.customEdits) {
                    mergedCustomEdits = editsDoc.data().customEdits;
                } else if (legacyDoc && legacyDoc.exists && legacyDoc.data()?.customEdits) {
                    mergedCustomEdits = legacyDoc.data().customEdits;
                }
            }

            // B. Load Flags & Deleted Keys
            if (flagsDoc && flagsDoc.exists) {
                const fData = flagsDoc.data() || {};
                if (fData.needsEditData) {
                    try { mergedNeedsEdit = JSON.parse(fData.needsEditData); } catch (e) {}
                } else if (fData.needsEditMap) {
                    mergedNeedsEdit = fData.needsEditMap;
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

            // Apply merged data to LocalStorage & IndexedDB
            if (Object.keys(mergedCustomEdits).length > 0) {
                const localEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
                const finalEdits = { ...localEdits, ...mergedCustomEdits };
                localStorage.setItem("housing_exam_custom_edits", JSON.stringify(finalEdits));
            }

            if (Object.keys(mergedNeedsEdit).length > 0) {
                const localNeeds = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
                const finalNeeds = { ...localNeeds, ...mergedNeedsEdit };
                localStorage.setItem("housing_exam_needs_edit", JSON.stringify(finalNeeds));
            }

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

            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            console.log("✅ Cloud modular chunk pull complete. Custom edits count:", Object.keys(mergedCustomEdits).length);
            this.notifyStatusChange();
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
    schedulePush(delayMs = 1500) {
        if (this._pushTimeout) clearTimeout(this._pushTimeout);
        this._pushTimeout = setTimeout(() => {
            this.pushToCloud();
        }, delayMs);
    },

    async pushToCloud() {
        if (!this.isInitialized || !this.db) return false;
        if (this.isSyncing) return;

        try {
            this.isSyncing = true;
            this.syncStatus = "syncing";
            this.notifyStatusChange();

            let stats = [];
            let history = [];
            if (window.IDBStore) {
                const fullBackup = await window.IDBStore.exportBackupJSON();
                // Filter active stats only (tryCount > 0 or wrongCount > 0 or weight > 1)
                stats = (fullBackup.stats || []).filter(s => (s.tryCount > 0 || s.wrongCount > 0 || (s.weight && s.weight > 1)));
                history = (fullBackup.history || []).slice(-100);
            }

            const customEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
            const needsEditMap = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
            const deletedKeys = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
            const nowIso = new Date().toISOString();

            const syncCol = this.db.collection("exam_hell_sync");
            const chunkPromises = [];

            // 1. Save Custom Edits into safe 150-item JSON-string chunks (max ~75KB each, 100% immune to 1MB limit)
            const editKeys = Object.keys(customEdits);
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
                sliceKeys.forEach(k => { chunkObj[k] = customEdits[k]; });
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
                statsData: JSON.stringify(stats),
                count: stats.length,
                updatedAt: nowIso
            }));

            chunkPromises.push(syncCol.doc("history_store").set({
                historyData: JSON.stringify(history),
                count: history.length,
                updatedAt: nowIso
            }));

            chunkPromises.push(syncCol.doc("flags_store").set({
                needsEditData: JSON.stringify(needsEditMap),
                deletedKeys,
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
