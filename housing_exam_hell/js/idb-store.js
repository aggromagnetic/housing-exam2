/**
 * Housing Exam Hell - IndexedDB User Learning Store
 * Manages question weights, wrong-answer counters, spaced repetition, session histories, and canvas drawings.
 */

const DB_NAME = 'housing_exam_hell_db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = req.result;

            // 1. Question statistics store (Weights, Wrong count, Success count)
            if (!db.objectStoreNames.contains('question_stats')) {
                const statsStore = db.createObjectStore('question_stats', { keyPath: 'qKey' });
                statsStore.createIndex('subject', 'subject', { unique: false });
                statsStore.createIndex('weight', 'weight', { unique: false });
                statsStore.createIndex('wrongCount', 'wrongCount', { unique: false });
            }

            // 2. Test Session History store
            if (!db.objectStoreNames.contains('session_history')) {
                const sessionStore = db.createObjectStore('session_history', { keyPath: 'sessionId' });
                sessionStore.createIndex('subject', 'subject', { unique: false });
                sessionStore.createIndex('mode', 'mode', { unique: false });
                sessionStore.createIndex('date', 'date', { unique: false });
            }

            // 3. Stylus Pen Drawing Strokes store
            if (!db.objectStoreNames.contains('drawing_strokes')) {
                db.createObjectStore('drawing_strokes', { keyPath: 'qKey' });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    return dbPromise;
}

export const IDBStore = {
    async init() {
        return await openDB();
    },

    /**
     * Get statistics for a specific question
     */
    async getQuestionStat(qKey) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('question_stats', 'readonly');
            const store = tx.objectStore('question_stats');
            const req = store.get(qKey);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Get all question statistics as a map { [qKey]: statObject }
     */
    async getAllStatsMap() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('question_stats', 'readonly');
            const store = tx.objectStore('question_stats');
            const req = store.getAll();
            req.onsuccess = () => {
                const map = {};
                (req.result || []).forEach(item => {
                    map[item.qKey] = item;
                });
                resolve(map);
            };
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Record an answer result and calculate new weight based on spaced repetition rules:
     * - Wrong answers: 1st -> 2, 2nd -> 4, 3rd -> 6, 4th+ -> 10 (MAX)
     * - Correct answers: 10 -> 6 -> 4 -> 2 -> 1 (MIN)
     */
    async recordAnswer(qKey, isCorrect, meta = {}) {
        const db = await openDB();
        const existing = await this.getQuestionStat(qKey) || {
            qKey,
            subject: meta.subject || '',
            type: meta.type || 'choice',
            chapter: meta.chapter || '',
            weight: 1,
            wrongCount: 0,
            correctCount: 0,
            tryCount: 0
        };

        existing.tryCount = (existing.tryCount || 0) + 1;
        existing.lastAttempt = new Date().toISOString();
        existing.lastResult = isCorrect;

        if (!isCorrect) {
            existing.wrongCount = (existing.wrongCount || 0) + 1;
            // Spaced repetition escalating weight: 2 -> 4 -> 6 -> 10
            if (existing.wrongCount === 1) existing.weight = 2;
            else if (existing.wrongCount === 2) existing.weight = 4;
            else if (existing.wrongCount === 3) existing.weight = 6;
            else existing.weight = 10;

            // 오답 시 3일 망각 임시 감점 즉시 리셋 (원래 본래 Score로 복구)
            existing.scoreDeductions = 0;
            existing.lastWrongAt = new Date().toISOString();
        } else {
            existing.correctCount = (existing.correctCount || 0) + 1;
            // De-escalating step: 10 -> 6 -> 4 -> 2 -> 1
            if (existing.weight === 10) existing.weight = 6;
            else if (existing.weight === 6) existing.weight = 4;
            else if (existing.weight === 4) existing.weight = 2;
            else existing.weight = 1;

            // 정답 시 임시 Score 1점씩 감점 누적 (3일간 유지) & 최근 정답 시각 기록
            existing.scoreDeductions = (existing.scoreDeductions || 0) + 1;
            existing.lastCorrectAt = new Date().toISOString();
        }

        return new Promise((resolve, reject) => {
            const tx = db.transaction('question_stats', 'readwrite');
            const store = tx.objectStore('question_stats');
            const req = store.put(existing);
            req.onsuccess = () => {
                if (window.CloudSync) window.CloudSync.schedulePush();
                resolve(existing);
            };
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Manually override answer (e.g. user marks typo as correct)
     */
    async overrideToCorrect(qKey) {
        const stat = await this.getQuestionStat(qKey);
        if (!stat) return null;
        stat.wrongCount = Math.max(0, (stat.wrongCount || 1) - 1);
        // Step down weight
        if (stat.weight === 10) stat.weight = 6;
        else if (stat.weight === 6) stat.weight = 4;
        else if (stat.weight === 4) stat.weight = 2;
        else stat.weight = 1;
        stat.lastResult = true;

        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('question_stats', 'readwrite');
            const store = tx.objectStore('question_stats');
            const req = store.put(stat);
            req.onsuccess = () => resolve(stat);
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Save drawing strokes for tablet stylus
     */
    async saveDrawingStrokes(qKey, strokes) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('drawing_strokes', 'readwrite');
            const store = tx.objectStore('drawing_strokes');
            const req = store.put({ qKey, strokes, updatedAt: new Date().toISOString() });
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Get drawing strokes for a question
     */
    async getDrawingStrokes(qKey) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('drawing_strokes', 'readonly');
            const store = tx.objectStore('drawing_strokes');
            const req = store.get(qKey);
            req.onsuccess = () => resolve(req.result ? req.result.strokes : null);
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Clear drawing strokes for a question
     */
    async clearDrawingStrokes(qKey) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('drawing_strokes', 'readwrite');
            const store = tx.objectStore('drawing_strokes');
            const req = store.delete(qKey);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Save completed session history
     */
    async saveSession(sessionData) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('session_history', 'readwrite');
            const store = tx.objectStore('session_history');
            const req = store.put({
                sessionId: sessionData.sessionId || 'sess_' + Date.now(),
                ...sessionData,
                createdAt: new Date().toISOString()
            });
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    },

    /**
     * Export all user statistics and histories to JSON
     */
    async exportBackupJSON() {
        const db = await openDB();
        let stats = [];
        let history = [];
        if (db) {
            try {
                stats = await new Promise(r => {
                    const tx = db.transaction('question_stats', 'readonly');
                    tx.objectStore('question_stats').getAll().onsuccess = e => r(e.target.result || []);
                });
                history = await new Promise(r => {
                    const tx = db.transaction('session_history', 'readonly');
                    tx.objectStore('session_history').getAll().onsuccess = e => r(e.target.result || []);
                });
            } catch (e) {}
        }

        let customEdits = {};
        let needsEditMap = {};
        try {
            customEdits = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
            needsEditMap = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
        } catch (e) {}

        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            stats,
            history,
            customEdits,
            needsEditMap
        };
    },

    /**
     * Import user statistics and histories from JSON
     */
    async importBackupJSON(backupData) {
        if (!backupData) {
            throw new Error('올바르지 않은 백업 데이터 포맷입니다.');
        }

        const db = await openDB();
        if (db) {
            try {
                const tx = db.transaction(['question_stats', 'session_history'], 'readwrite');
                if (Array.isArray(backupData.stats)) {
                    const statsStore = tx.objectStore('question_stats');
                    for (const item of backupData.stats) {
                        statsStore.put(item);
                    }
                }
                if (Array.isArray(backupData.history)) {
                    const historyStore = tx.objectStore('session_history');
                    for (const sess of backupData.history) {
                        historyStore.put(sess);
                    }
                }
            } catch (e) {}
        }

        if (backupData.customEdits && typeof backupData.customEdits === 'object') {
            try {
                const existing = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
                const merged = { ...existing, ...backupData.customEdits };
                localStorage.setItem('housing_exam_custom_edits', JSON.stringify(merged));
            } catch (e) {}
        }

        if (backupData.needsEditMap && typeof backupData.needsEditMap === 'object') {
            try {
                const existing = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
                const merged = { ...existing, ...backupData.needsEditMap };
                localStorage.setItem('housing_exam_needs_edit', JSON.stringify(merged));
            } catch (e) {}
        }

        return true;
    },

    /**
     * Save custom question edit
     */
    async saveQuestionEdit(qKey, editData) {
        try {
            const map = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
            const item = {
                ...editData,
                editedAt: editData.editedAt || new Date().toISOString()
            };
            map[qKey] = item;
            localStorage.setItem('housing_exam_custom_edits', JSON.stringify(map));
            return item;
        } catch (e) {
            return editData;
        }
    },

    /**
     * Get custom question edit
     */
    async getQuestionEdit(qKey) {
        try {
            const map = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
            return map[qKey] || null;
        } catch (e) { return null; }
    },

    /**
     * Get all custom question edits
     */
    async getAllQuestionEditsMap() {
        try {
            return JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
        } catch (e) { return {}; }
    },

    /**
     * Delete custom question edit (reset to original)
     */
    async deleteQuestionEdit(qKey) {
        try {
            const map = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
            delete map[qKey];
            localStorage.setItem('housing_exam_custom_edits', JSON.stringify(map));
        } catch (e) {}
    },

    /**
     * Flag question as Needs Edit (수정 필요 플래그)
     */
    async saveNeedsEdit(qKey, qInfo) {
        try {
            const map = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
            map[qKey] = {
                qKey,
                subject: qInfo.subject || '',
                chapterName: qInfo.chapterName || '',
                type: qInfo.type || 'choice',
                question: qInfo.question || qInfo.title || '',
                flaggedAt: new Date().toISOString()
            };
            localStorage.setItem('housing_exam_needs_edit', JSON.stringify(map));
            return map[qKey];
        } catch (e) { return null; }
    },

    /**
     * Get all Needs Edit map
     */
    async getAllNeedsEditMap() {
        try {
            return JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
        } catch (e) { return {}; }
    },

    /**
     * Delete/Resolve Needs Edit flag
     */
    async deleteNeedsEdit(qKey) {
        try {
            const map = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
            delete map[qKey];
            localStorage.setItem('housing_exam_needs_edit', JSON.stringify(map));
        } catch (e) {}
    },

    /**
     * Reset all learning statistics
     */
    async resetAllStats() {
        const db = await openDB();
        const tx = db.transaction(['question_stats', 'session_history', 'drawing_strokes'], 'readwrite');
        tx.objectStore('question_stats').clear();
        tx.objectStore('session_history').clear();
        tx.objectStore('drawing_strokes').clear();
        return new Promise(resolve => {
            tx.oncomplete = () => resolve(true);
        });
    }
};
