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

            const docRef = this.db.collection("exam_hell_sync").doc(SYNC_USER_DOC);
            const doc = await docRef.get();

            if (doc.exists) {
                const cloudData = doc.data() || {};
                console.log("📥 Cloud data received, merging into local storage...", cloudData.updatedAt);

                // 1. Merge custom question edits
                if (cloudData.customEdits && typeof cloudData.customEdits === "object") {
                    const localEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
                    const mergedEdits = { ...localEdits, ...cloudData.customEdits };
                    localStorage.setItem("housing_exam_custom_edits", JSON.stringify(mergedEdits));
                }

                // 2. Merge needs edit flags
                if (cloudData.needsEditMap && typeof cloudData.needsEditMap === "object") {
                    const localNeeds = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
                    const mergedNeeds = { ...localNeeds, ...cloudData.needsEditMap };
                    localStorage.setItem("housing_exam_needs_edit", JSON.stringify(mergedNeeds));
                }

                // 3. Merge question statistics in IDB
                if (window.IDBStore && Array.isArray(cloudData.stats)) {
                    await window.IDBStore.importBackupJSON({
                        stats: cloudData.stats,
                        history: cloudData.history || []
                    });
                }

                // 4. Merge deleted questions
                if (Array.isArray(cloudData.deletedKeys)) {
                    const localDel = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");
                    const mergedDel = Array.from(new Set([...localDel, ...cloudData.deletedKeys]));
                    localStorage.setItem("housing_exam_deleted_keys", JSON.stringify(mergedDel));
                }

                this.lastSyncTime = new Date();
                this.syncStatus = "synced";
                console.log("✅ Cloud pull & merge complete at", this.lastSyncTime.toLocaleTimeString());
            } else {
                console.log("☁️ No remote data found in Firestore. Performing initial push to Cloud...");
                await this.pushToCloud();
            }

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
                stats = fullBackup.stats || [];
                history = fullBackup.history || [];
            }

            const customEdits = JSON.parse(localStorage.getItem("housing_exam_custom_edits") || "{}");
            const needsEditMap = JSON.parse(localStorage.getItem("housing_exam_needs_edit") || "{}");
            const deletedKeys = JSON.parse(localStorage.getItem("housing_exam_deleted_keys") || "[]");

            const payload = {
                updatedAt: new Date().toISOString(),
                stats,
                history,
                customEdits,
                needsEditMap,
                deletedKeys
            };

            const docRef = this.db.collection("exam_hell_sync").doc(SYNC_USER_DOC);
            await docRef.set(payload, { merge: true });

            this.lastSyncTime = new Date();
            this.syncStatus = "synced";
            this.isSyncing = false;
            console.log("📤 Cloud push complete at", this.lastSyncTime.toLocaleTimeString());
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
