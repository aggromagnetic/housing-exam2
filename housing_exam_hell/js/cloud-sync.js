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
            
            // 1. Try modular documents first (edits, stats, history, flags)
            const [editsDoc, statsDoc, historyDoc, flagsDoc, legacyDoc] = await Promise.all([
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

            // A. Load Custom Edits
            if (editsDoc && editsDoc.exists && editsDoc.data()?.customEdits) {
                mergedCustomEdits = editsDoc.data().customEdits;
            } else if (legacyDoc && legacyDoc.exists && legacyDoc.data()?.customEdits) {
                mergedCustomEdits = legacyDoc.data().customEdits;
            }

            // B. Load Flags & Deleted Keys
            if (flagsDoc && flagsDoc.exists) {
                const fData = flagsDoc.data() || {};
                mergedNeedsEdit = fData.needsEditMap || {};
                mergedDeletedKeys = fData.deletedKeys || [];
            } else if (legacyDoc && legacyDoc.exists) {
                const lData = legacyDoc.data() || {};
                mergedNeedsEdit = lData.needsEditMap || {};
                mergedDeletedKeys = lData.deletedKeys || [];
            }

            // C. Load Stats & History
            if (statsDoc && statsDoc.exists && Array.isArray(statsDoc.data()?.stats)) {
                mergedStats = statsDoc.data().stats;
            } else if (legacyDoc && legacyDoc.exists && Array.isArray(legacyDoc.data()?.stats)) {
                mergedStats = legacyDoc.data().stats;
            }

            if (historyDoc && historyDoc.exists && Array.isArray(historyDoc.data()?.history)) {
                mergedHistory = historyDoc.data().history;
            } else if (legacyDoc && legacyDoc.exists && Array.isArray(legacyDoc.data()?.history)) {
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
            console.log("✅ Cloud modular pull & merge complete. Custom edits count:", Object.keys(mergedCustomEdits).length);
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
                // Filter active stats only (tryCount > 0 or wrongCount > 0 or weight > 1) to keep size minimal
                stats = (fullBackup.stats || []).filter(s => (s.tryCount > 0 || s.wrongCount > 0 || (s.weight && s.weight > 1)));
                history = (fullBackup.history || []).slice(-100);
            }

            const customEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
            const needsEditMap = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
            const deletedKeys = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
            const nowIso = new Date().toISOString();

            const syncCol = this.db.collection("exam_hell_sync");

            // Save in modular documents to never exceed Firestore 1MB limit
            await Promise.all([
                syncCol.doc("edits_store").set({ customEdits, count: Object.keys(customEdits).length, updatedAt: nowIso }, { merge: true }),
                syncCol.doc("stats_store").set({ stats, count: stats.length, updatedAt: nowIso }, { merge: true }),
                syncCol.doc("history_store").set({ history, count: history.length, updatedAt: nowIso }, { merge: true }),
                syncCol.doc("flags_store").set({ needsEditMap, deletedKeys, updatedAt: nowIso }, { merge: true })
            ]);

            // Legacy backward-compatible doc (optional best effort)
            try {
                await syncCol.doc(SYNC_USER_DOC).set({
                    updatedAt: nowIso,
                    customEdits,
                    needsEditMap,
                    deletedKeys,
                    statsCount: stats.length
                }, { merge: true });
            } catch (e) {}

            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            this.isSyncing = false;
            console.log("📤 Cloud modular push complete. Custom edits count:", Object.keys(customEdits).length);
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
