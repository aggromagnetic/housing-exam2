/**
 * Housing Exam Hell - Master Standalone Application Controller
 * Fully self-contained to work seamlessly across file://, http://, and GitHub Pages.
 */

(function () {
    'use strict';

    // -------------------------------------------------------------
    // 1. IndexedDB User Learning Store
    // -------------------------------------------------------------
    const DB_NAME = 'housing_exam_hell_db';
    const DB_VERSION = 1;
    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                console.warn('IndexedDB is not supported on this browser.');
                resolve(null);
                return;
            }

            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = req.result;
                if (!db.objectStoreNames.contains('question_stats')) {
                    const statsStore = db.createObjectStore('question_stats', { keyPath: 'qKey' });
                    statsStore.createIndex('subject', 'subject', { unique: false });
                    statsStore.createIndex('weight', 'weight', { unique: false });
                }
                if (!db.objectStoreNames.contains('session_history')) {
                    db.createObjectStore('session_history', { keyPath: 'sessionId' });
                }
                if (!db.objectStoreNames.contains('drawing_strokes')) {
                    db.createObjectStore('drawing_strokes', { keyPath: 'qKey' });
                }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                console.warn('IndexedDB open error:', req.error);
                resolve(null); // Fallback to memory
            };
        });

        return dbPromise;
    }

    const IDBStore = {
        async init() {
            return await openDB();
        },

        async getQuestionStat(qKey) {
            const db = await openDB();
            if (!db) return null;
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction('question_stats', 'readonly');
                    const req = tx.objectStore('question_stats').get(qKey);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            });
        },

        async getAllStatsMap() {
            const db = await openDB();
            if (!db) return {};
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction('question_stats', 'readonly');
                    const req = tx.objectStore('question_stats').getAll();
                    req.onsuccess = () => {
                        const map = {};
                        (req.result || []).forEach(item => { map[item.qKey] = item; });
                        resolve(map);
                    };
                    req.onerror = () => resolve({});
                } catch (e) { resolve({}); }
            });
        },

        async recordAnswer(qKey, isCorrect, meta = {}) {
            const db = await openDB();
            const existing = (await this.getQuestionStat(qKey)) || {
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
                if (existing.wrongCount === 1) existing.weight = 2;
                else if (existing.wrongCount === 2) existing.weight = 4;
                else if (existing.wrongCount === 3) existing.weight = 6;
                else existing.weight = 10;

                // 오답 시 3일 망각 임시 감점 즉시 리셋 (원래 본래 Score로 복구)
                existing.scoreDeductions = 0;
                existing.lastWrongAt = new Date().toISOString();
            } else {
                existing.correctCount = (existing.correctCount || 0) + 1;
                if (existing.weight === 10) existing.weight = 6;
                else if (existing.weight === 6) existing.weight = 4;
                else if (existing.weight === 4) existing.weight = 2;
                else existing.weight = 1;

                // 정답 시 임시 Score 1점씩 감점 누적 (3일간 유지) & 최근 정답 시각 기록
                existing.scoreDeductions = (existing.scoreDeductions || 0) + 1;
                existing.lastCorrectAt = new Date().toISOString();
            }

            if (db) {
                try {
                    const tx = db.transaction('question_stats', 'readwrite');
                    tx.objectStore('question_stats').put(existing);
                } catch (e) {}
            }
            if (window.CloudSync) window.CloudSync.schedulePush();
            return existing;
        },

        async overrideToCorrect(qKey) {
            const stat = await this.getQuestionStat(qKey);
            if (!stat) return null;
            stat.wrongCount = Math.max(0, (stat.wrongCount || 1) - 1);
            if (stat.weight >= 2.5) stat.weight = 2.0;
            else if (stat.weight >= 2.0) stat.weight = 1.5;
            else stat.weight = 1.0;
            stat.lastResult = true;

            const db = await openDB();
            if (db) {
                try {
                    const tx = db.transaction('question_stats', 'readwrite');
                    tx.objectStore('question_stats').put(stat);
                } catch (e) {}
            }
            if (window.CloudSync) window.CloudSync.schedulePush();
            return stat;
        },

        async resetQuestionWeight(qKey) {
            const stat = (await this.getQuestionStat(qKey)) || { qKey };
            stat.weight = 1;
            stat.wrongCount = 0;
            stat.correctCount = 0;
            stat.tryCount = 0;
            stat.lastAttempt = new Date().toISOString();

            const db = await openDB();
            if (db) {
                try {
                    const tx = db.transaction('question_stats', 'readwrite');
                    tx.objectStore('question_stats').put(stat);
                } catch (e) {}
            }
            if (window.CloudSync) window.CloudSync.schedulePush();
            return stat;
        },

        async saveDrawingStrokes(qKey, strokes) {
            const db = await openDB();
            if (!db) return;
            try {
                const tx = db.transaction('drawing_strokes', 'readwrite');
                tx.objectStore('drawing_strokes').put({ qKey, strokes, updatedAt: new Date().toISOString() });
            } catch (e) {}
        },

        async getDrawingStrokes(qKey) {
            const db = await openDB();
            if (!db) return null;
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction('drawing_strokes', 'readonly');
                    const req = tx.objectStore('drawing_strokes').get(qKey);
                    req.onsuccess = () => resolve(req.result ? req.result.strokes : null);
                    req.onerror = () => resolve(null);
                } catch (e) { resolve(null); }
            });
        },

        async clearDrawingStrokes(qKey) {
            const db = await openDB();
            if (!db) return;
            try {
                const tx = db.transaction('drawing_strokes', 'readwrite');
                tx.objectStore('drawing_strokes').delete(qKey);
            } catch (e) {}
        },

        async saveSession(sessionData) {
            const db = await openDB();
            if (!db) return;
            try {
                const tx = db.transaction('session_history', 'readwrite');
                tx.objectStore('session_history').put({
                    sessionId: 'sess_' + Date.now(),
                    ...sessionData,
                    createdAt: new Date().toISOString()
                });
            } catch (e) {}
            if (window.CloudSync) window.CloudSync.schedulePush();
        },

        async saveQuestionEdit(qKey, editData) {
            try {
                const map = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
                const item = {
                    ...editData,
                    editedAt: editData.editedAt || new Date().toISOString()
                };
                map[qKey] = item;
                localStorage.setItem('housing_exam_custom_edits', JSON.stringify(map));
                if (window.CloudSync) window.CloudSync.schedulePush();
                return item;
            } catch (e) {
                return editData;
            }
        },

        async getQuestionEdit(qKey) {
            try {
                const map = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
                return map[qKey] || null;
            } catch (e) { return null; }
        },

        async getAllQuestionEditsMap() {
            try {
                return JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
            } catch (e) { return {}; }
        },

        async deleteQuestionEdit(qKey) {
            try {
                const map = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
                delete map[qKey];
                localStorage.setItem('housing_exam_custom_edits', JSON.stringify(map));
            } catch (e) {}
            if (window.CloudSync) window.CloudSync.schedulePush();
        },

        async saveNeedsEdit(qKey, qInfo) {
            try {
                const map = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
                map[qKey] = {
                    qKey,
                    subject: qInfo.subject,
                    chapterName: qInfo.chapterName,
                    type: qInfo.type,
                    question: qInfo.question || qInfo.title,
                    flaggedAt: new Date().toISOString()
                };
                localStorage.setItem('housing_exam_needs_edit', JSON.stringify(map));
            } catch (e) {}
            if (window.CloudSync) window.CloudSync.schedulePush();
        },

        async getNeedsEdit(qKey) {
            try {
                const map = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
                return map[qKey] || null;
            } catch (e) { return null; }
        },

        async getAllNeedsEditMap() {
            try {
                return JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
            } catch (e) { return {}; }
        },

        async deleteNeedsEdit(qKey) {
            try {
                const map = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
                delete map[qKey];
                localStorage.setItem('housing_exam_needs_edit', JSON.stringify(map));
            } catch (e) {}
            if (window.CloudSync) window.CloudSync.schedulePush();
        },

        async saveDeletedKey(qKey) {
            try {
                const arr = JSON.parse(localStorage.getItem('housing_exam_deleted_keys') || '[]');
                if (!arr.includes(qKey)) {
                    arr.push(qKey);
                    localStorage.setItem('housing_exam_deleted_keys', JSON.stringify(arr));
                }
            } catch (e) {}
            if (window.CloudSync) window.CloudSync.schedulePush();
        },

        async restoreDeletedKey(qKey) {
            try {
                let arr = JSON.parse(localStorage.getItem('housing_exam_deleted_keys') || '[]');
                arr = arr.filter(k => k !== qKey);
                localStorage.setItem('housing_exam_deleted_keys', JSON.stringify(arr));
            } catch (e) {}
            if (window.CloudSync) window.CloudSync.schedulePush();
        },

        async getDeletedKeysSet() {
            try {
                const arr = JSON.parse(localStorage.getItem('housing_exam_deleted_keys') || '[]');
                return new Set(arr);
            } catch (e) { return new Set(); }
        },

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
            let deletedKeys = [];
            try {
                customEdits = JSON.parse(localStorage.getItem('housing_exam_custom_edits') || '{}');
                needsEditMap = JSON.parse(localStorage.getItem('housing_exam_needs_edit') || '{}');
                deletedKeys = JSON.parse(localStorage.getItem('housing_exam_deleted_keys') || '[]');
            } catch (e) {}

            return {
                version: 2,
                exportedAt: new Date().toISOString(),
                stats,
                history,
                customEdits,
                needsEditMap,
                deletedKeys
            };
        },

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

            if (Array.isArray(backupData.deletedKeys)) {
                try {
                    const existing = JSON.parse(localStorage.getItem('housing_exam_deleted_keys') || '[]');
                    const merged = Array.from(new Set([...existing, ...backupData.deletedKeys]));
                    localStorage.setItem('housing_exam_deleted_keys', JSON.stringify(merged));
                } catch (e) {}
            }

            return true;
        }
    };

    // -------------------------------------------------------------
    // Part Progress Save & Resume Manager (Local Storage)
    // -------------------------------------------------------------
    const PartProgressManager = {
        getKey(subject, chapter) {
            return `housing_part_progress_${subject}_${chapter}`;
        },

        saveProgress(subject, chapter, state) {
            if (!subject || !chapter || !state || !state.questions || state.questions.length === 0) return;
            try {
                let answeredCount = 0;
                let correctCount = 0;
                let wrongCount = 0;

                state.results.forEach(res => {
                    if (res !== undefined && res !== null) {
                        answeredCount++;
                        if (res.isCorrect) correctCount++;
                        else wrongCount++;
                    }
                });

                const data = {
                    subject,
                    chapter,
                    currentIndex: state.currentIndex,
                    totalQuestions: state.questions.length,
                    answeredCount,
                    correctCount,
                    wrongCount,
                    userAnswers: state.userAnswers,
                    results: state.results,
                    firstAttemptResults: state.firstAttemptResults,
                    elapsedSeconds: state.elapsedSeconds || 0,
                    questionKeys: state.questions.map(q => q.qKey),
                    updatedAt: new Date().toISOString()
                };

                localStorage.setItem(this.getKey(subject, chapter), JSON.stringify(data));
            } catch (e) {
                console.error('Failed to save part progress:', e);
            }
        },

        getProgress(subject, chapter) {
            try {
                const raw = localStorage.getItem(this.getKey(subject, chapter));
                if (!raw) return null;
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },

        clearProgress(subject, chapter) {
            try {
                localStorage.removeItem(this.getKey(subject, chapter));
            } catch (e) {}
        }
    };

    // -------------------------------------------------------------
    // 2. Grader & Text Normalizer
    // -------------------------------------------------------------
    const Grader = {
        parseFraction(str) {
            if (!str) return null;
            const clean = String(str).replace(/[\s\(\)\[\]]/g, '').trim();
            // 1. "5분의 4" -> numerator: 4, denominator: 5 -> 4/5
            const hangulMatch = clean.match(/^(\d+)분의(\d+)$/);
            if (hangulMatch) {
                return { num: parseInt(hangulMatch[2], 10), den: parseInt(hangulMatch[1], 10) };
            }
            // 2. "4/5" -> numerator: 4, denominator: 5 -> 4/5
            const slashMatch = clean.match(/^(\d+)\/(\d+)$/);
            if (slashMatch) {
                return { num: parseInt(slashMatch[1], 10), den: parseInt(slashMatch[2], 10) };
            }
            return null;
        },

        normalizeText(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/[\s\t\r\n]+/g, '')
                .replace(/[.,·•ㆍ'"`~!?@#$%^&*()_+=\-\[\]{}|\\:;<>/\\]/g, '')
                .replace(/^[은는이가을를의에로으로]+|[은는이가을를의에로으로]+$/g, '')
                .toLowerCase()
                .trim();
        },

        getAnswerVariants(targetStr) {
            if (!targetStr) return [];
            const parts = String(targetStr).split(/[,|]|\b또는\b/).map(s => s.trim()).filter(Boolean);
            const variants = [];

            parts.forEach(part => {
                const frac = this.parseFraction(part);
                if (frac) {
                    variants.push(`${frac.num}/${frac.den}`);
                    variants.push(`${frac.den}분의${frac.num}`);
                } else {
                    if (part.includes('/') && !part.match(/\d+\/\d+/)) {
                        part.split('/').forEach(sub => {
                            const norm = this.normalizeText(sub);
                            if (norm) variants.push(norm);
                        });
                    } else {
                        const norm = this.normalizeText(part);
                        if (norm) variants.push(norm);
                    }
                }
            });

            return Array.from(new Set(variants));
        },

        isMatch(userAnswer, targetAnswer) {
            if (!userAnswer || !targetAnswer) return false;

            // 1. Fraction comparison (e.g. "4/5" vs "5분의 4")
            const userFrac = this.parseFraction(userAnswer);
            const targetVariants = this.getAnswerVariants(targetAnswer);
            const isTargetFraction = targetVariants.some(v => this.parseFraction(v) !== null);

            if (userFrac) {
                const userFracKey = `${userFrac.num}/${userFrac.den}`;
                return targetVariants.some(v => {
                    const targetFrac = this.parseFraction(v);
                    if (targetFrac) {
                        return userFrac.num === targetFrac.num && userFrac.den === targetFrac.den;
                    }
                    return v === userFracKey || v === `${userFrac.den}분의${userFrac.num}`;
                });
            }

            if (isTargetFraction && !userFrac) {
                return false;
            }

            // 2. Pure Number / Text comparison
            const normUser = this.normalizeText(userAnswer);
            if (!normUser) return false;

            const isUserNum = /^\d+$/.test(normUser);

            return targetVariants.some(targetVar => {
                const normTarget = this.normalizeText(targetVar);
                const isTargetNum = /^\d+$/.test(normTarget);

                // Numbers must strictly match exactly
                if (isUserNum || isTargetNum) {
                    return normUser === normTarget;
                }

                // Exact text match
                if (normUser === normTarget) return true;

                // Long term fuzzy match (length >= 4 and >= 75% coverage)
                if (normTarget.length >= 4 && normUser.length >= 4) {
                    if (normTarget.includes(normUser) || normUser.includes(normTarget)) {
                        const minLen = Math.min(normUser.length, normTarget.length);
                        const maxLen = Math.max(normUser.length, normTarget.length);
                        if (minLen / maxLen >= 0.75) return true;
                    }
                }

                return false;
            });
        },

        grade(question, userResponse) {
            if (question.type === 'choice') {
                const userChoice = parseInt(userResponse, 10);
                const targetChoice = parseInt(question.answer, 10);
                const isCorrect = userChoice === targetChoice;

                return {
                    isCorrect,
                    userChoice,
                    targetChoice,
                    userSummary: userChoice ? `${userChoice}번` : '(미선택)',
                    correctSummary: `${targetChoice}번`
                };
            } else {
                const targetAnswers = question.answers || {};
                const keys = sortSubjectiveEntries(Object.entries(targetAnswers)).map(([k]) => k);

                if (keys.length === 0) {
                    return { isCorrect: false, details: {}, userSummary: '', correctSummary: '' };
                }

                const details = {};
                let allCorrect = true;
                const userParts = [];
                const correctParts = [];

                keys.forEach(k => {
                    const userVal = (userResponse && userResponse[k]) ? String(userResponse[k]).trim() : '';
                    const targetVal = targetAnswers[k] || '';
                    const match = this.isMatch(userVal, targetVal);

                    if (!match) allCorrect = false;

                    details[k] = { key: k, user: userVal, correct: targetVal, isCorrect: match };
                    userParts.push(`[${k}] ${userVal || '(공란)'}`);
                    correctParts.push(`[${k}] ${targetVal}`);
                });

                return {
                    isCorrect: allCorrect,
                    details,
                    userSummary: userParts.join(' | '),
                    correctSummary: correctParts.join(' | ')
                };
            }
        }
    };

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // 3. Exam Engine (5-Year Blueprint & Core 300 Keywords)
    // -------------------------------------------------------------
    const ExamEngine = {
        getBank() {
            return window.HOUSING_EXAM_BANK || null;
        },

        getCoreKeywordsDB(subject) {
            if (!window.HOUSING_CORE_KEYWORDS_DB) return [];
            return window.HOUSING_CORE_KEYWORDS_DB[subject] || [];
        },

        GENERIC_STOP_WORDS: new Set([
            "공동주택", "주택", "주택법", "건축법", "공동주택관리법", "관리실무", "관계법규",
            "관리", "관리의", "기준", "요건", "구분", "비교", "산정", "의무", "절차", "규정",
            "종류", "범위", "특성", "적용", "경우", "사항", "설치", "확인", "대상", "내용",
            "대통령령", "국토교통부령", "시장", "군수", "구청장", "시도지사", "장관", "특별시장",
            "광역시장", "특별자치시", "도지사", "특별자치도", "방법", "조치", "행위", "제외",
            "포함", "관련", "대하여", "따른", "의한", "모두", "옳은", "옳지", "틀린", "것은",
            "골라", "다음", "아래", "설명", "규정된", "해당하는", "이하", "이상", "초과", "미만",
            "비율", "조문", "출제", "빈출", "유력", "주관식", "객관식", "사람", "이내", "시작",
            "시작한", "예외", "사람에", "있음", "없음", "가능", "불가", "특례", "관련된", "대한",
            "받아야", "하는", "받은", "정기적", "신청", "소유자", "결과", "기한", "설비", "공사",
            "안전관리", "안전관리법", "관리법", "시행규칙", "시행령", "법률", "규칙", "조례",
            "실시", "통보", "작성", "제출", "보고", "검사", "점검", "정기검사", "자체점검", "수시검사",
            "어느", "하나", "각호", "해당", "규정", "또는", "위한", "통해", "대해", "암기", "시기"
        ]),

        SUFFIX_2CHAR_REGEX: /(으로|에서|에게|부터|까지|마다|따라|따른|관한|대한|위한|통해|대해)$/,
        SUFFIX_1CHAR_REGEX: /(은|는|이|을|를|의|에|와|과|도|만|상|별|등|용)$/,

        cleanWord(w) {
            if (!w) return "";
            let cleaned = w.trim();
            cleaned = cleaned.replace(this.SUFFIX_2CHAR_REGEX, "");
            if (cleaned.length >= 3) {
                cleaned = cleaned.replace(this.SUFFIX_1CHAR_REGEX, "");
            }
            return cleaned.trim();
        },

        extractDistinctiveKeywords(topic, note) {
            const text = (topic || "") + " " + (note || "");
            return Array.from(new Set(text
                .replace(/[\(\)·,\.\/vs\-\+vs\:\[\]\<\>\"\'\?\!~]/g, " ")
                .split(/\s+/)
                .map(w => this.cleanWord(w))
                .filter(w => w.length >= 2 && !this.GENERIC_STOP_WORDS.has(w))));
        },

        checkSubcategoryRequirement(category, fullText) {
            if (!category) return true;
            const cat = category.trim();

            if (cat.includes("승강기")) {
                return /승강기|엘리베이터|에스컬레이터|무빙워크|리프트|덤웨이터|권상기|조속기/i.test(fullText);
            }
            if (cat.includes("전기사업") || cat.includes("전기설비")) {
                return /전기|전력|변전|수전|발전|배전|전압|전류|자가용|배선|접지|누전/i.test(fullText);
            }
            if (cat.includes("가스")) {
                return /가스|도시가스|LPG|LNG|가스누설|가스배관/i.test(fullText);
            }
            if (cat.includes("소방") || cat.includes("화재")) {
                return /소방|화재|소화|스프링클러|감지기|유도등|경보|비상벨|방화/i.test(fullText);
            }
            if (cat.includes("급수")) {
                return /급수|수조|저수조|수도|수질|물탱크|부스터|수격|워터해머|크로스커넥션|위생점검|급수관/i.test(fullText);
            }
            if (cat.includes("급탕")) {
                return /급탕|온수|가열기|서큘레이터|리버스|환수관/i.test(fullText);
            }
            if (cat.includes("난방") || cat.includes("보일러")) {
                return /난방|보일러|방열기|라디에이터|지역난방|개별난방|중앙난방|열교환기|팽창탱크|난방코일/i.test(fullText);
            }
            if (cat.includes("오수") || cat.includes("정화조")) {
                return /오수|정화조|하수|BOD|생물학적|침전|폭기|부패탱크/i.test(fullText);
            }
            if (cat.includes("배수") || cat.includes("통기") || cat.includes("환기")) {
                return /배수|통기|환기|트랩|봉수|루프통기|각개통기|드레인|환기설비|송풍기/i.test(fullText);
            }
            if (cat.includes("회계")) {
                return /회계|예산|결산|재무제표|대차대조표|손익계산서|관리비|잡수입|장기수선충당금|예치금|감사/i.test(fullText);
            }
            if (cat.includes("노동") || cat.includes("인사") || cat.includes("사무")) {
                return /근로|임금|퇴직|퇴직금|휴가|연차|취업규칙|근로계약|최저임금|수습|산업재해|고용보험|국민연금|건강보험|노동조합/i.test(fullText);
            }
            if (cat.includes("주택관리사")) {
                return /주택관리사|보증보험|공제|자격증|손해배상책임|배치신고|행정처분|자격취소|자격정지/i.test(fullText);
            }
            if (cat.includes("입주자대표회의") || cat.includes("선거관리위원회")) {
                return /입주자대표회의|동별\s*대표자|선거관리위원회|임원|회장|감사|해임|의결/i.test(fullText);
            }
            if (cat.includes("민간임대")) {
                return /민간임대|임대사업자|임차인대표회의|임대보증금|임대차계약|표준임대차|특별수선충당금/i.test(fullText);
            }
            if (cat.includes("공공주택")) {
                return /공공주택|공공임대|영구임대|국민임대|행복주택|장기전세|통합공공임대|임대의무기간/i.test(fullText);
            }
            if (cat.includes("정비") || cat.includes("도시및주거환경")) {
                return /정비사업|재건축|재개발|주거환경개선|조합설립|관리처분|사업시행|안전진단/i.test(fullText);
            }
            if (cat.includes("시설물의안전") || cat.includes("시특법")) {
                return /시설물|시특법|안전점검|정밀안전진단|제1종|제2종|제3종|중대한\s*결함/i.test(fullText);
            }
            if (cat.includes("집합건물")) {
                return /집합건물|구분소유|관리단|관리인|규약|관리단집회|공용부분|대지사용권/i.test(fullText);
            }
            return true;
        },

        isCategoryMatch(chapterName, itemCategory) {
            if (!itemCategory) return true;
            const chap = (chapterName || "").replace(/^CHAPTER\s+\d+\s*/i, "").trim();
            const cat = itemCategory.trim();

            if (chap.includes(cat) || cat.includes(chap)) return true;
            
            // Specific mappings for 관계법규
            if (cat === "주택법" && chap.includes("주택법")) return true;
            if (cat.includes("공동주택관리법") && chap.includes("공동주택관리법")) return true;
            if (cat === "건축법" && chap.includes("건축법")) return true;
            if (cat.includes("민간임대") && chap.includes("민간임대")) return true;
            if (cat.includes("공공주택") && chap.includes("공공주택")) return true;
            if (cat.includes("정비") && chap.includes("정비")) return true;
            if (cat.includes("시설물의안전") && (chap.includes("시설물의") || chap.includes("시특법") || chap.includes("안전점검"))) return true;
            if (cat.includes("전기사업") && chap.includes("전기")) return true;
            if (cat.includes("승강기") && chap.includes("승강기")) return true;
            if (cat.includes("소방기본") && chap.includes("소방기본")) return true;
            if (cat.includes("화재") && chap.includes("화재")) return true;
            if (cat.includes("소방시설") && chap.includes("소방시설")) return true;
            if (cat.includes("집합건물") && chap.includes("집합건물")) return true;

            // 관리실무 mappings
            if (cat.includes("주택의") && chap.includes("주택의")) return true;
            if (cat.includes("관리기준") && (chap.includes("총칙") || chap.includes("관리기준") || chap.includes("관리규약"))) return true;
            if (cat.includes("관리방법") && chap.includes("관리방법")) return true;
            if (cat.includes("관리조직") && (chap.includes("관리조직") || chap.includes("입주자대표회의"))) return true;
            if (cat.includes("주택관리사") && chap.includes("주택관리사")) return true;
            if (cat.includes("벌칙") && chap.includes("벌칙")) return true;
            if (cat.includes("입주자관리") && (chap.includes("입주자관리") || chap.includes("자치규약") || chap.includes("규약"))) return true;
            if (cat.includes("사무") && (chap.includes("사무") || chap.includes("인사") || chap.includes("노동"))) return true;
            if (cat.includes("대외업무") && (chap.includes("대외업무") || chap.includes("리모델링"))) return true;
            if (cat.includes("회계관리") && chap.includes("회계관리")) return true;
            if (cat.includes("시설관리") && chap.includes("시설관리")) return true;
            if (cat.includes("환경안전방재") && (chap.includes("환경") || chap.includes("안전"))) return true;

            return false;
        },

        LADDER_WEIGHTS: {
            7: 1.8,
            6: 1.7,
            5: 1.6,
            4: 1.5,
            3: 1.3,
            2: 1.1,
            1: 1.0,
            0: 1.0
        },

        matchQuestionKeywords(q, subject) {
            const subjectKeywords = this.getCoreKeywordsDB(subject);
            if (!subjectKeywords || subjectKeywords.length === 0) return [];

            // Search question, title, passage, answers ONLY (excluding explanation/tip to prevent dilution)
            const ansText = q.answers ? Object.values(q.answers).join(' ') : (q.answer || '');
            const fullText = [
                q.question || '',
                q.title || '',
                q.passage || '',
                ansText,
                (q.options || []).join(' '),
                q.keyword || ''
            ].join(' ');

            const matches = [];
            for (const item of subjectKeywords) {
                if (!this.isCategoryMatch(q.chapterName, item.category)) continue;
                if (!this.checkSubcategoryRequirement(item.category, fullText)) continue;

                const distinctiveKws = this.extractDistinctiveKeywords(item.topic, item.note);
                if (distinctiveKws.length === 0) continue;

                const matched = distinctiveKws.filter(kw => fullText.includes(kw));
                const exactTopicMatch = item.topic && fullText.includes(item.topic);

                // Smooth 7-point ladder scoring:
                // base = matched.length (1 to 6+)
                // +1 for exact topic match
                // +1 for chapter category match (if score > 0)
                // capped at 7 points
                let score = matched.length;
                if (exactTopicMatch) score += 1;
                const isChapterMatch = this.isCategoryMatch(q.chapterName, item.category);
                if (isChapterMatch && score > 0) score += 1;
                score = Math.min(7, score);

                if (score >= 2) {
                    matches.push({
                        item,
                        matched,
                        score,
                        isChapterMatch
                    });
                }
            }

            matches.sort((a, b) => b.score - a.score || (b.isChapterMatch ? 1 : 0) - (a.isChapterMatch ? 1 : 0));
            return matches;
        },

        _poolCache: {},

        getQuestionPool(subject, type) {
            const cacheKey = `${subject}_${type}`;
            if (this._poolCache[cacheKey]) {
                const cached = this._poolCache[cacheKey];
                return (state && state.deletedKeysSet && state.deletedKeysSet.size > 0)
                    ? cached.filter(q => !state.deletedKeysSet.has(q.qKey))
                    : cached;
            }

            const bank = this.getBank();
            if (!bank || !bank.datasets) return [];

            const key = subject === '관리실무' 
                ? (type === 'choice' ? 'gwanri_mc' : 'gwanri_sa')
                : (type === 'choice' ? 'law_mc' : 'law_sa');

            const dataset = bank.datasets[key];
            if (!dataset || !Array.isArray(dataset.chapters)) return [];

            const pool = [];
            dataset.chapters.forEach(chap => {
                (chap.questions || []).forEach(q => {
                    const matches = this.matchQuestionKeywords({ ...q, chapterName: chap.chapter }, subject);
                    const topMatch = matches.length > 0 ? matches[0] : null;
                    const topScore = topMatch ? topMatch.score : 0;
                    // ⭐ 핵심 300선 뱃지는 5점 이상 (7점, 6점, 5점)에 부착 (상위 44.7%)
                    const isHighYield = topScore >= 5;
                    const isSuperHighYield = topScore >= 6;
                    pool.push({
                        ...q,
                        qKey: `${subject}_${type}_${chap.chapter}_${q.id}`,
                        subject,
                        type,
                        chapterName: chap.chapter,
                        sourceFile: chap.source_file || '',
                        coreMatches: matches,
                        topCoreMatch: topMatch,
                        topScore: topScore,
                        isHighYield: isHighYield,
                        isSuperHighYield: isSuperHighYield,
                        primaryCoreItem: isHighYield ? topMatch.item : null,
                        scoreWeight: this.LADDER_WEIGHTS[topScore] || 1.0
                    });
                });
            });

            this._poolCache[cacheKey] = pool;
            return (state && state.deletedKeysSet && state.deletedKeysSet.size > 0)
                ? pool.filter(q => !state.deletedKeysSet.has(q.qKey))
                : pool;
        },

        RESET_COOLDOWN_HOURS: 30, // 30시간 망각 주기 쿨다운
        
        /**
         * Get Effective Score with 30-Hour Spaced Repetition Decay
         * Base score: topScore (0~7)
         * For each correct answer within 30 hours, score decreases by 1 (minimum 1)
         * After 30 hours without answering, resets back to baseScore.
         */
        getEffectiveScore(question, stat) {
            const baseScore = (question && question.topScore !== undefined) ? question.topScore : ((question && question.score) || 0);
            if (!stat || !stat.scoreDeductions || !stat.lastCorrectAt) {
                return baseScore;
            }

            const lastCorrectTime = new Date(stat.lastCorrectAt).getTime();
            const elapsedHours = (Date.now() - lastCorrectTime) / (1000 * 60 * 60);

            // 30시간 경과 시 원래 score로 완전 복원!
            if (isNaN(elapsedHours) || elapsedHours >= 30) {
                return baseScore;
            }

            // 30시간 이내: 맞춘 횟수만큼 감점 (최솟값 1점)
            return Math.max(1, baseScore - stat.scoreDeductions);
        },

        getScoreWeight(effectiveScore) {
            return this.LADDER_WEIGHTS[effectiveScore] || 1.0;
        },

        weightedPick(items, statsMap = {}, count, excludeKeysSet = new Set()) {
            const available = items.filter(it => !excludeKeysSet.has(it.qKey));
            if (available.length <= count) return available;

            const weights = available.map(it => {
                const stat = statsMap[it.qKey];
                const userWeight = (stat && stat.weight) ? stat.weight : 1.0;
                
                // 3일 망각 주기 반영된 동적 임시 Score 기반 사다리 가중치
                const effScore = this.getEffectiveScore(it, stat);
                const scoreWeight = this.getScoreWeight(effScore);
                
                return userWeight * scoreWeight;
            });

            const selected = [];
            const pickedIndices = new Set();

            for (let step = 0; step < count; step++) {
                let totalWeight = 0;
                for (let i = 0; i < available.length; i++) {
                    if (!pickedIndices.has(i)) totalWeight += weights[i];
                }

                if (totalWeight <= 0) break;

                let rnd = Math.random() * totalWeight;
                let current = 0;
                let chosenIdx = -1;

                for (let i = 0; i < available.length; i++) {
                    if (pickedIndices.has(i)) continue;
                    current += weights[i];
                    if (rnd <= current) {
                        chosenIdx = i;
                        break;
                    }
                }

                if (chosenIdx !== -1) {
                    pickedIndices.add(chosenIdx);
                    selected.push(available[chosenIdx]);
                }
            }

            return selected;
        },

        getBlueprint(subject) {
            if (subject === '관리실무') {
                return [
                    { pattern: /01.*주택의.*정의/, mc: 1, sa: 0 },
                    { pattern: /02.*총칙/, mc: 1, sa: 0 },
                    { pattern: /03.*관리방법/, mc: 2, sa: 1 },
                    { pattern: /04.*관리조직/, mc: 2, sa: 2 },
                    { pattern: /05.*주택관리사/, mc: 1, sa: 0 },
                    { pattern: /06.*벌칙/, mc: 0, sa: 1, randomSwap: true },
                    { pattern: /07.*입주자관리/, mc: 1, sa: 1 },
                    { pattern: /08.*사무.*인사/, mc: 3, sa: 3 },
                    { pattern: /09.*대외업무/, mc: 1, sa: 0 },
                    { pattern: /10.*회계관리/, mc: 1, sa: 0 },
                    { pattern: /11.*시설관리/, mc: 9, sa: 6 },
                    { pattern: /12.*환경.*안전/, mc: 2, sa: 3 }
                ];
            } else {
                return [
                    { pattern: /01.*주택법/, mc: 5, sa: 3 },
                    { pattern: /02.*공동주택관리법/, mc: 5, sa: 3 },
                    { pattern: /03.*민간임대주택/, mc: 1, sa: 1 },
                    { pattern: /04.*공공주택/, mc: 1, sa: 1 },
                    { pattern: /05.*건축법/, mc: 4, sa: 3 },
                    { pattern: /06.*도시.*주거환경정비/, mc: 1, sa: 1 },
                    { pattern: /07.*도시재정비/, mc: 1, sa: 0 },
                    { pattern: /08.*시설물의.*안전/, mc: 1, sa: 1 },
                    { pattern: /09.*소방기본법/, mc: 1, sa: 0 },
                    { pattern: /10.*화재의.*예방/, mc: 1, sa: 0 },
                    { pattern: /11.*소방시설/, mc: 1, sa: 0 },
                    { pattern: /12.*전기사업법/, mc: 1, sa: 1 },
                    { pattern: /13.*승강기/, mc: 1, sa: 1 },
                    { pattern: /14.*집합건물/, mc: 0, sa: 1 }
                ];
            }
        },

        /**
         * Hell Mode Blueprint Table (50% MC : 50% SA = 20 MC + 20 SA per subject)
         */
        getHellBlueprint(subject) {
            if (subject === '관리실무') {
                return [
                    { pattern: /01.*주택의.*정의/, mc: 1, sa: 0 },
                    { pattern: /02.*총칙/, mc: 1, sa: 0 },
                    { pattern: /03.*관리방법/, mc: 2, sa: 2 },
                    { pattern: /04.*관리조직/, mc: 2, sa: 2 },
                    { pattern: /05.*주택관리사/, mc: 1, sa: 0 },
                    { pattern: /06.*벌칙/, mc: 0, sa: 1 },
                    { pattern: /07.*입주자관리/, mc: 1, sa: 1 },
                    { pattern: /08.*사무.*인사/, mc: 2, sa: 3 },
                    { pattern: /09.*대외업무/, mc: 1, sa: 0 },
                    { pattern: /10.*회계관리/, mc: 1, sa: 1 },
                    { pattern: /11.*시설관리/, mc: 6, sa: 8 },
                    { pattern: /12.*환경.*안전/, mc: 2, sa: 3 }
                ];
            } else {
                // 관계법규 (20 MC + 20 SA)
                return [
                    { pattern: /01.*주택법/, mc: 4, sa: 4 },
                    { pattern: /02.*공동주택관리법/, mc: 4, sa: 4 },
                    { pattern: /03.*민간임대주택/, mc: 1, sa: 1 },
                    { pattern: /04.*공공주택/, mc: 1, sa: 1 },
                    { pattern: /05.*건축법/, mc: 4, sa: 4 },
                    { pattern: /06.*도시.*주거환경정비/, mc: 1, sa: 1 },
                    { pattern: /07.*도시재정비/, mc: 1, sa: 0 },
                    { pattern: /08.*시설물의.*안전/, mc: 1, sa: 1 },
                    { pattern: /09.*소방기본법/, mc: 0, sa: 1 },
                    { pattern: /10.*화재의.*예방/, mc: 1, sa: 0 },
                    { pattern: /11.*소방시설/, mc: 1, sa: 0 },
                    { pattern: /12.*전기사업법/, mc: 1, sa: 1 },
                    { pattern: /13.*승강기/, mc: 1, sa: 1 },
                    { pattern: /14.*집합건물/, mc: 0, sa: 1 }
                ];
            }
        },

        /**
         * Pick unseen high-yield questions first. If exhausted, pick least-attempted + high wrong-rate questions.
         */
        pickUnseenHighYieldFirst(items, statsMap = {}, count, excludeKeysSet = new Set()) {
            const available = items.filter(it => !excludeKeysSet.has(it.qKey));
            if (available.length <= count) return available;

            // 1단계: 한 번도 안 푼 문제 (tryCount === 0 또는 미등록)
            const unseen = available.filter(it => {
                const stat = statsMap[it.qKey];
                return !stat || !stat.tryCount || stat.tryCount === 0;
            });

            // 안 푼 문제가 목표 수량 이상이면 그 안에서 가중치 추첨
            if (unseen.length >= count) {
                return this.weightedPick(unseen, statsMap, count, excludeKeysSet);
            }

            // 2단계: 안 푼 문제는 전원 선발
            const selected = [...unseen];
            const pickedKeys = new Set(unseen.map(it => it.qKey));

            // 3단계: 부족분은 풀어본 것 중 [덜 푼 것(낮은 tryCount)] + [자주 틀린 오답(높은 weight)] 우선 가중치 추첨
            const seen = available.filter(it => !pickedKeys.has(it.qKey));
            const remainderNeeded = count - selected.length;

            const remainderWeights = seen.map(it => {
                const stat = statsMap[it.qKey] || {};
                const userWeight = stat.weight || 1.0;
                const tryCount = stat.tryCount || 1;
                const effScore = this.getEffectiveScore(it, stat);
                const scoreWeight = this.getScoreWeight(effScore);
                return (userWeight * scoreWeight) / Math.sqrt(tryCount);
            });

            const additional = [];
            const pickedIndices = new Set();

            for (let step = 0; step < remainderNeeded; step++) {
                let totalWeight = 0;
                for (let i = 0; i < seen.length; i++) {
                    if (!pickedIndices.has(i)) totalWeight += remainderWeights[i];
                }
                if (totalWeight <= 0) break;

                let rnd = Math.random() * totalWeight;
                let current = 0;
                let chosenIdx = -1;

                for (let i = 0; i < seen.length; i++) {
                    if (pickedIndices.has(i)) continue;
                    current += remainderWeights[i];
                    if (rnd <= current) {
                        chosenIdx = i;
                        break;
                    }
                }

                if (chosenIdx !== -1) {
                    pickedIndices.add(chosenIdx);
                    additional.push(seen[chosenIdx]);
                }
            }

            return [...selected, ...additional];
        },

        generateExamSet(subject, statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.40) {
            const mcPool = this.getQuestionPool(subject, 'choice');
            const saPool = this.getQuestionPool(subject, 'short');
            const blueprint = this.getBlueprint(subject);

            const selectedMC = [];
            const selectedSA = [];
            const pickedKeys = new Set(excludeKeysSet);

            blueprint.forEach(rule => {
                let targetMc = rule.mc;
                let targetSa = rule.sa;

                if (rule.randomSwap && (targetMc + targetSa === 1)) {
                    if (Math.random() < 0.5) {
                        targetMc = 0; targetSa = 1;
                    } else {
                        targetMc = 1; targetSa = 0;
                    }
                }

                const chapterMcList = mcPool.filter(q => rule.pattern.test(q.chapterName));
                const chapterSaList = saPool.filter(q => rule.pattern.test(q.chapterName));

                // 1) MC: Guaranteed at least 40% high yield from core 300 candidates
                if (targetMc > 0) {
                    const hyCandidates = chapterMcList.filter(q => q.isHighYield);
                    const targetHyMc = Math.min(hyCandidates.length, Math.ceil(targetMc * highYieldRatio));
                    const pickedHy = this.weightedPick(hyCandidates, statsMap, targetHyMc, pickedKeys);

                    pickedHy.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedMC.push(q);
                    });

                    // 2) Remaining quota picked randomly/weighted from all chapter questions
                    const remainingMcCount = targetMc - pickedHy.length;
                    if (remainingMcCount > 0) {
                        const pickedRest = this.weightedPick(chapterMcList, statsMap, remainingMcCount, pickedKeys);
                        pickedRest.forEach(q => {
                            pickedKeys.add(q.qKey);
                            selectedMC.push(q);
                        });
                    }
                }

                // 2) SA: Guaranteed at least 40% high yield from core 300 candidates
                if (targetSa > 0) {
                    const hyCandidates = chapterSaList.filter(q => q.isHighYield);
                    const targetHySa = Math.min(hyCandidates.length, Math.ceil(targetSa * highYieldRatio));
                    const pickedHy = this.weightedPick(hyCandidates, statsMap, targetHySa, pickedKeys);

                    pickedHy.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedSA.push(q);
                    });

                    // Remaining quota picked from all chapter questions
                    const remainingSaCount = targetSa - pickedHy.length;
                    if (remainingSaCount > 0) {
                        const pickedRest = this.weightedPick(chapterSaList, statsMap, remainingSaCount, pickedKeys);
                        pickedRest.forEach(q => {
                            pickedKeys.add(q.qKey);
                            selectedSA.push(q);
                        });
                    }
                }
            });

            if (selectedMC.length < 24) {
                const remainderAll = this.weightedPick(mcPool, statsMap, 24 - selectedMC.length, pickedKeys);
                remainderAll.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedMC.push(q);
                });
            }
            if (selectedSA.length < 16) {
                const remainderAll = this.weightedPick(saPool, statsMap, 16 - selectedSA.length, pickedKeys);
                remainderAll.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedSA.push(q);
                });
            }

            // 실전 시험지 순서와 100% 동일하게 정렬:
            // 1~24번: 객관식 (주택법/행정관리 -> 공주법 -> 건축법/시설관리 -> 기타법/안전환경)
            // 25~40번: 주관식 (주택법/행정관리 -> 공주법 -> 건축법/시설관리 -> 기타법/안전환경)
            return [...selectedMC.slice(0, 24), ...selectedSA.slice(0, 16)];
        },

        /**
         * Generate 40-question Hell Mode Set (20 MC + 20 SA: 50% unseen high-yield + 50% weighted roulette)
         */
        generateHellSubjectSet(subject, statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.50) {
            const mcPool = this.getQuestionPool(subject, 'choice');
            const saPool = this.getQuestionPool(subject, 'short');
            const blueprint = this.getHellBlueprint(subject);

            const selectedMC = [];
            const selectedSA = [];
            const pickedKeys = new Set(excludeKeysSet);

            blueprint.forEach(rule => {
                const targetMc = rule.mc;
                const targetSa = rule.sa;

                const chapterMcList = mcPool.filter(q => rule.pattern.test(q.chapterName));
                const chapterSaList = saPool.filter(q => rule.pattern.test(q.chapterName));

                // 1) MC (20문항): 50%는 안 푼 초특급/핵심 우선 선정 + 50%는 스마트 룰렛
                if (targetMc > 0) {
                    const hyCandidates = chapterMcList.filter(q => q.isHighYield);
                    const targetHyMc = Math.min(hyCandidates.length, Math.ceil(targetMc * highYieldRatio));
                    const pickedHy = this.pickUnseenHighYieldFirst(hyCandidates, statsMap, targetHyMc, pickedKeys);

                    pickedHy.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedMC.push(q);
                    });

                    const remainingMcCount = targetMc - pickedHy.length;
                    if (remainingMcCount > 0) {
                        const pickedRest = this.weightedPick(chapterMcList, statsMap, remainingMcCount, pickedKeys);
                        pickedRest.forEach(q => {
                            pickedKeys.add(q.qKey);
                            selectedMC.push(q);
                        });
                    }
                }

                // 2) SA (20문항): 50%는 안 푼 초특급/핵심 우선 선정 + 50%는 스마트 룰렛
                if (targetSa > 0) {
                    const hyCandidates = chapterSaList.filter(q => q.isHighYield);
                    const targetHySa = Math.min(hyCandidates.length, Math.ceil(targetSa * highYieldRatio));
                    const pickedHy = this.pickUnseenHighYieldFirst(hyCandidates, statsMap, targetHySa, pickedKeys);

                    pickedHy.forEach(q => {
                        pickedKeys.add(q.qKey);
                        selectedSA.push(q);
                    });

                    const remainingSaCount = targetSa - pickedHy.length;
                    if (remainingSaCount > 0) {
                        const pickedRest = this.weightedPick(chapterSaList, statsMap, remainingSaCount, pickedKeys);
                        pickedRest.forEach(q => {
                            pickedKeys.add(q.qKey);
                            selectedSA.push(q);
                        });
                    }
                }
            });

            // Quota fallback if pool is tight
            if (selectedMC.length < 20) {
                const remainderAll = this.weightedPick(mcPool, statsMap, 20 - selectedMC.length, pickedKeys);
                remainderAll.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedMC.push(q);
                });
            }
            if (selectedSA.length < 20) {
                const remainderAll = this.weightedPick(saPool, statsMap, 20 - selectedSA.length, pickedKeys);
                remainderAll.forEach(q => {
                    pickedKeys.add(q.qKey);
                    selectedSA.push(q);
                });
            }

            return [...selectedMC.slice(0, 20), ...selectedSA.slice(0, 20)];
        },

        shuffleWithAntiClumping(questions) {
            const shuffled = [...questions].sort(() => Math.random() - 0.5);
            const result = [];

            while (shuffled.length > 0) {
                let bestIdx = 0;
                const last = result[result.length - 1];

                if (last) {
                    const diffIdx = shuffled.findIndex(q => q.chapterName !== last.chapterName);
                    if (diffIdx !== -1) bestIdx = diffIdx;
                }

                result.push(shuffled.splice(bestIdx, 1)[0]);
            }

            return result;
        },

        generateReviewSet(subject, statsMap = {}, count = 40) {
            const mcPool = this.getQuestionPool(subject, 'choice');
            const saPool = this.getQuestionPool(subject, 'short');
            const all = [...mcPool, ...saPool];

            const weakItems = all.filter(q => (statsMap[q.qKey]?.weight || 1) >= 2);
            let picked = [];

            if (weakItems.length >= count) {
                picked = this.weightedPick(weakItems, statsMap, count);
            } else {
                const weakSet = new Set(weakItems.map(q => q.qKey));
                const remaining = this.weightedPick(all, statsMap, count - weakItems.length, weakSet);
                picked = [...weakItems, ...remaining];
            }

            return this.shuffleWithAntiClumping(picked);
        },

        generatePartSet(subject, chapterPattern) {
            const mcPool = this.getQuestionPool(subject, 'choice');
            const saPool = this.getQuestionPool(subject, 'short');
            const regex = new RegExp(chapterPattern);

            const mcMatches = mcPool.filter(q => regex.test(q.chapterName));
            const saMatches = saPool.filter(q => regex.test(q.chapterName));

            const all = [...mcMatches, ...saMatches];
            return all.sort(() => Math.random() - 0.5);
        },

        generateInfiniteHellSet(statsMap = {}, excludeKeysSet = new Set(), highYieldRatio = 0.50) {
            // 1. 관계법규 40문항 (객관식 20 + 주관식 20: 50% 안 푼 핵심 보장)
            const lawSet = this.generateHellSubjectSet('관계법규', statsMap, excludeKeysSet, highYieldRatio);
            
            // 2. 중복 방지를 위한 키 누적
            const lawKeys = new Set(excludeKeysSet);
            lawSet.forEach(q => lawKeys.add(q.qKey));

            // 3. 관리실무 40문항 (객관식 20 + 주관식 20: 50% 안 푼 핵심 보장)
            const gwanriSet = this.generateHellSubjectSet('관리실무', statsMap, lawKeys, highYieldRatio);

            // 4. 총 80문항 융합 및 군집 방지 셔플 (관계법규 + 관리실무 50:50)
            const combined = [...lawSet, ...gwanriSet];
            return this.shuffleWithAntiClumping(combined);
        },

        getChapterList(subject) {
            const bank = this.getBank();
            if (!bank || !bank.datasets) return [];

            const mcKey = subject === '관리실무' ? 'gwanri_mc' : 'law_mc';
            const dataset = bank.datasets[mcKey];
            if (!dataset || !Array.isArray(dataset.chapters)) return [];

            return dataset.chapters.map(c => ({
                chapter: c.chapter,
                title: c.chapter.replace(/^CHAPTER\s+\d+\s*/i, '')
            }));
        }
    };

    // -------------------------------------------------------------
    // 4. Tablet Stylus Canvas Engine
    // -------------------------------------------------------------
    class TabletCanvas {
        constructor(canvasElement, toolbarContainer) {
            this.canvas = canvasElement;
            this.ctx = canvasElement.getContext('2d');
            this.toolbar = toolbarContainer;

            this.isEnabled = false;
            this.isDrawing = false;
            this.currentTool = 'pen'; // 'pen' | 'eraser'
            this.penColor = '#38BDF8';
            this.penWidth = 3;
            this.palmRejection = true;

            this.currentQuestionKey = null;
            this.strokes = [];
            this.currentStroke = null;

            this.initEvents();
            this.initResizeObserver();
        }

        initResizeObserver() {
            if (!this.canvas || !this.canvas.parentElement) return;
            if (window.ResizeObserver) {
                this.resizeObserver = new ResizeObserver(() => {
                    this.handleResize();
                });
                this.resizeObserver.observe(this.canvas.parentElement);
            }
            window.addEventListener('resize', () => this.handleResize());
            window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 150));
        }

        handleResize() {
            if (!this.canvas || !this.canvas.parentElement) return;
            const rect = this.canvas.parentElement.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const dpr = window.devicePixelRatio || 1;
            const targetWidth = Math.round(rect.width);
            const targetHeight = Math.round(rect.height);

            this.canvas.width = targetWidth * dpr;
            this.canvas.height = targetHeight * dpr;
            this.canvas.style.width = targetWidth + 'px';
            this.canvas.style.height = targetHeight + 'px';

            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.redraw();
        }

        initEvents() {
            this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
            this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
            this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
            this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e));

            if (this.toolbar) {
                this.toolbar.querySelectorAll('.stylus-btn[data-tool]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.toolbar.querySelectorAll('.stylus-btn[data-tool]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.currentTool = btn.dataset.tool;
                    });
                });

                this.toolbar.querySelectorAll('.color-dot').forEach(dot => {
                    dot.addEventListener('click', () => {
                        this.toolbar.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
                        dot.classList.add('selected');
                        this.penColor = dot.dataset.color || '#38BDF8';
                        this.currentTool = 'pen';
                        this.toolbar.querySelectorAll('.stylus-btn[data-tool]').forEach(b => {
                            b.classList.toggle('active', b.dataset.tool === 'pen');
                        });
                    });
                });

                const clearBtn = document.getElementById('btn-clear-canvas');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => this.clearCurrentStrokes());
                }

                const closeBtn = document.getElementById('btn-close-stylus');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        this.togglePen(false);
                        const headerPen = document.getElementById('btn-toggle-pen');
                        if (headerPen) headerPen.classList.remove('active');
                    });
                }
            }
        }

        getPos(e) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }

        onPointerDown(e) {
            if (!this.isEnabled) return;

            if (this.palmRejection && e.pointerType === 'touch' && e.isPrimary === false) return;

            this.isDrawing = true;
            this.pointerDownPos = this.getPos(e);
            this.pointerDownClient = { x: e.clientX, y: e.clientY };
            this.pointerDownTime = Date.now();
            this.pointerMoved = false;

            try {
                this.canvas.setPointerCapture(e.pointerId);
            } catch (err) {}

            const pos = this.pointerDownPos;
            this.currentStroke = {
                tool: this.currentTool,
                color: this.penColor,
                width: this.currentTool === 'eraser' ? 24 : this.penWidth,
                points: [pos]
            };
            this.strokes.push(this.currentStroke);

            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
        }

        onPointerMove(e) {
            if (!this.isDrawing || !this.currentStroke) return;

            const pos = this.getPos(e);
            if (this.pointerDownPos) {
                const dist = Math.hypot(pos.x - this.pointerDownPos.x, pos.y - this.pointerDownPos.y);
                if (dist > 5) {
                    this.pointerMoved = true;
                }
            }

            this.currentStroke.points.push(pos);

            if (this.currentTool === 'eraser') {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, 16, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            } else {
                this.ctx.save();
                this.ctx.strokeStyle = this.penColor;
                this.ctx.lineWidth = this.penWidth;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
                this.ctx.restore();
            }
        }

        async onPointerUp(e) {
            if (!this.isDrawing) return;
            this.isDrawing = false;

            const stroke = this.currentStroke;
            this.currentStroke = null;

            try {
                if (e && e.pointerId) this.canvas.releasePointerCapture(e.pointerId);
            } catch (err) {}

            const duration = Date.now() - (this.pointerDownTime || 0);
            const totalDist = (stroke && stroke.points && stroke.points.length > 1) ? 
                Math.hypot(
                    stroke.points[stroke.points.length - 1].x - stroke.points[0].x,
                    stroke.points[stroke.points.length - 1].y - stroke.points[0].y
                ) : 0;

            // If this was a quick tap (< 8px movement and < 350ms), pass click through to underlying buttons/options/inputs
            if (!this.pointerMoved && totalDist < 8 && duration < 350) {
                this.strokes.pop();
                this.redraw();

                this.canvas.style.pointerEvents = 'none';
                const clientX = (e && e.clientX) ? e.clientX : (this.pointerDownClient ? this.pointerDownClient.x : 0);
                const clientY = (e && e.clientY) ? e.clientY : (this.pointerDownClient ? this.pointerDownClient.y : 0);
                const underEl = document.elementFromPoint(clientX, clientY);
                this.canvas.style.pointerEvents = 'auto';

                if (underEl) {
                    const targetInteractive = underEl.closest('button, input, textarea, a, .option-item, .blank-input, .btn-ctrl, .btn-ctrl-sm, .btn-override, .color-dot, .stylus-btn, .btn-toggle-hw');
                    if (targetInteractive) {
                        targetInteractive.click();
                        if (['INPUT', 'TEXTAREA'].includes(targetInteractive.tagName)) {
                            targetInteractive.focus();
                        }
                        return;
                    }
                }
            }

            if (this.currentQuestionKey && state.sessionStrokes) {
                state.sessionStrokes.set(this.currentQuestionKey, [...this.strokes]);
            }
        }

        redraw() {
            const dpr = window.devicePixelRatio || 1;
            const rect = this.canvas.getBoundingClientRect();
            const w = rect.width || this.canvas.width / dpr;
            const h = rect.height || this.canvas.height / dpr;

            this.ctx.clearRect(0, 0, w, h);

            this.strokes.forEach(stroke => {
                if (!stroke.points || stroke.points.length === 0) return;

                this.ctx.save();
                if (stroke.tool === 'eraser') {
                    this.ctx.globalCompositeOperation = 'destination-out';
                    this.ctx.lineWidth = stroke.width || 24;
                } else {
                    this.ctx.strokeStyle = stroke.color || this.penColor;
                    this.ctx.lineWidth = stroke.width || this.penWidth;
                }
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';

                this.ctx.beginPath();
                this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length; i++) {
                    this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                }
                this.ctx.stroke();
                this.ctx.restore();
            });
        }

        loadQuestionStrokes(qKey) {
            this.currentQuestionKey = qKey;
            this.strokes = (state.sessionStrokes && state.sessionStrokes.get(qKey)) ? [...state.sessionStrokes.get(qKey)] : [];
            this.handleResize();
        }

        clearCurrentStrokes() {
            this.strokes = [];
            this.redraw();
            if (this.currentQuestionKey && state.sessionStrokes) {
                state.sessionStrokes.delete(this.currentQuestionKey);
            }
            showToast('필기가 모두 지워졌습니다.');
        }

        togglePen(forceState) {
            this.isEnabled = typeof forceState === 'boolean' ? forceState : !this.isEnabled;
            this.canvas.style.pointerEvents = this.isEnabled ? 'auto' : 'none';
            if (this.toolbar) {
                this.toolbar.classList.toggle('active', this.isEnabled);
            }
            if (this.isEnabled) {
                this.handleResize();
            }
            return this.isEnabled;
        }
    }

    // -------------------------------------------------------------
    // 4.5. Korean Handwriting Recognition Engine
    // -------------------------------------------------------------
    const HandwritingRecognizer = {
        async recognize(strokes, width = 400, height = 200) {
            if (!strokes || strokes.length === 0) return [];

            const formattedInk = strokes.map(stroke => {
                const xs = [];
                const ys = [];
                const ts = [];
                stroke.forEach(pt => {
                    xs.push(Math.round(pt.x));
                    ys.push(Math.round(pt.y));
                    ts.push(Math.round(pt.t || 0));
                });
                return [xs, ys, ts];
            });

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);

                const res = await fetch('https://inputtools.google.com/request?itc=ko-t-i0-handwrit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        app_version: 0.4,
                        api_level: '537.36',
                        device: 'web',
                        input_type: '0',
                        options: 'enable_pre_space',
                        requests: [{
                            writing_guide: { writing_area_width: width, writing_area_height: height },
                            ink: formattedInk,
                            language: 'ko'
                        }]
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) return [];
                const data = await res.json();
                if (Array.isArray(data) && data[0] === 'SUCCESS' && data[1] && data[1][0] && Array.isArray(data[1][0][1])) {
                    return data[1][0][1];
                }
            } catch (err) {
                console.warn('Handwriting recognition API error:', err);
            }
            return [];
        }
    };

    // -------------------------------------------------------------
    // 5. OMR Sheet & AI Prompt Generator
    // -------------------------------------------------------------
    const OMRSheet = {
        renderGrid(container, questions, userAnswers, results, onSelectQuestion) {
            if (!container) return;
            container.innerHTML = '';

            questions.forEach((q, idx) => {
                const btn = document.createElement('button');
                btn.className = 'omr-cell';
                if (idx === state.currentIndex) {
                    btn.classList.add('current');
                }

                if (state.mode === 'infinite') {
                    btn.classList.add(q.subject === '관계법규' ? 'omr-law-cell' : 'omr-gwanri-cell');
                }

                const isAnswered = userAnswers[idx] !== undefined && userAnswers[idx] !== null && userAnswers[idx] !== '';
                const res = results[idx];

                if (res !== undefined) {
                    btn.classList.add(res.isCorrect ? 'correct' : 'wrong');
                } else if (isAnswered) {
                    btn.classList.add('answered');
                }

                const subLabel = state.mode === 'infinite' ? `<span style="font-size: 0.62rem; font-weight: 700; color: ${q.subject === '관계법규' ? '#38BDF8' : '#34D399'}; opacity: 0.9;">${q.subject === '관계법규' ? '법규' : '실무'}</span>` : '';

                btn.innerHTML = `
                    ${subLabel}
                    <span class="num">${idx + 1}</span>
                    <span class="status-icon">${
                        res !== undefined 
                            ? (res.isCorrect ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>')
                            : (isAnswered ? '<i class="fa-solid fa-pen"></i>' : '')
                    }</span>
                `;

                btn.addEventListener('click', () => onSelectQuestion(idx));
                container.appendChild(btn);
            });
        },

        buildAIPrompt(sessionData) {
            const { subject, score, correctCount, wrongCount, questions, userAnswers, results } = sessionData;

            let md = `## 📝 [주택관리사 2차] 오답 분석 및 AI 일타 과외 요청서\n\n`;
            md += `- **응시 과목**: ${subject}\n`;
            md += `- **종합 점수**: ${Math.round(score)}점 / 100점 (${score >= 60 ? '🎉 합격권 (PASS)' : '⚠️ 과락주의 (RE-STUDY)'})\n`;
            md += `- **채점 결과**: 맞춤 ${correctCount}개 / 틀림 ${wrongCount}개\n`;
            md += `- **작성 일시**: ${new Date().toLocaleString('ko-KR')}\n\n`;
            md += `### ⚠️ 틀린 문항 정보 및 취약 포인트 목록\n\n`;

            let wrongIdx = 1;
            questions.forEach((q, idx) => {
                const res = results[idx];
                if (res && !res.isCorrect) {
                    md += `#### [오답 ${wrongIdx}] (단원: ${q.chapterName}) ${q.question}\n`;
                    if (q.passage) {
                        md += `\`\`\`\n${q.passage}\n\`\`\`\n`;
                    }

                    if (q.type === 'choice') {
                        const uChoice = userAnswers[idx];
                        const tChoice = q.answer;
                        md += `- **나의 선택 오답**: [${uChoice || '미선택'}번] ${q.options[uChoice - 1] || ''}\n`;
                        md += `- **실제 기준 정답**: [${tChoice}번] ${q.options[tChoice - 1] || ''}\n`;
                    } else {
                        md += `- **나의 기입 오답**: ${res.userSummary || '(공란)'}\n`;
                        md += `- **올바른 기준 답안**: ${res.correctSummary || ''}\n`;
                    }

                    md += `- **정답 해설**: ${q.explanation}\n`;
                    if (q.tip) md += `- **출제 함정 팁**: ${q.tip}\n`;
                    md += `\n---\n\n`;
                    wrongIdx++;
                }
            });

            if (wrongIdx === 1) {
                md += `🎉 축하합니다! 틀린 문제가 전혀 없습니다. 완벽한 실전 합격권입니다!\n`;
            } else {
                md += `### 🤖 [AI 과외 요청 지침]\n`;
                md += `위 오답 데이터들을 분석하여 제가 주로 어떤 법령/실무 개념에서 함정에 빠졌는지 취약점을 짚어주시고, 시험장에서 절대 틀리지 않도록 1문장 핵심 암기 공식과 유사 변형 출제 포인트를 요약해 주세요!\n`;
            }

            return md;
        }
    };

    // -------------------------------------------------------------
    // 6. Application Controller & State
    // -------------------------------------------------------------
    const state = {
        subject: localStorage.getItem('hell_subject') || '관계법규',
        mode: 'home',
        currentPartPattern: '',

        questions: [],
        currentIndex: 0,
        userAnswers: [],
        results: [],
        firstAttemptResults: [],
        statsMap: {},
        customEdits: {},
        needsEditMap: {},
        wrongManagerTab: 'wrong',
        wrongManagerFilter: 'all',

        infiniteSetCount: 1,
        infiniteUsedKeys: new Set(),

        currentCombo: 0,
        maxCombo: 0,

        timerInterval: null,
        elapsedSeconds: 0,
        mockRemainingSeconds: 40 * 60,

        isExplanationOpen: false,
        tabletCanvas: null,
        sessionStrokes: new Map()
    };

    let elements = {};

    const HANGUL_CIRCLED_ORDER = [
        '㉠','㉡','㉢','㉣','㉤','㉥','㉦','㉧','㉨','㉩','㉪','㉫','㉬','㉭',
        'ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ',
        '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
        '1','2','3','4','5','6','7','8','9','10',
        'A','B','C','D','E'
    ];

    function sortSubjectiveEntries(entries) {
        if (!entries || !Array.isArray(entries)) return [];
        return [...entries].sort(([kA], [kB]) => {
            const cleanA = String(kA).replace(/[\(\)\[\]\s]/g, '');
            const cleanB = String(kB).replace(/[\(\)\[\]\s]/g, '');
            const idxA = HANGUL_CIRCLED_ORDER.indexOf(cleanA);
            const idxB = HANGUL_CIRCLED_ORDER.indexOf(cleanB);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return cleanA.localeCompare(cleanB, 'ko');
        });
    }

    function getSortedAnswersObject(answersObj) {
        if (!answersObj || typeof answersObj !== 'object') return {};
        const sorted = {};
        const entries = sortSubjectiveEntries(Object.entries(answersObj));
        entries.forEach(([k, v]) => {
            sorted[k] = v;
        });
        return sorted;
    }

    function applyCustomEdits(q) {
        if (!q || !q.qKey || !state.customEdits) return q;
        const custom = state.customEdits[q.qKey];
        if (custom) {
            if (custom.question !== undefined) q.question = custom.question;
            if (custom.passage !== undefined) q.passage = custom.passage;
            if (custom.options !== undefined) q.options = [...custom.options];
            if (custom.answer !== undefined) q.answer = custom.answer;
            if (custom.answers !== undefined) q.answers = getSortedAnswersObject(custom.answers);
            if (custom.explanation !== undefined) q.explanation = custom.explanation;
            if (custom.tip !== undefined) q.tip = custom.tip;
            q.isCustomEdited = true;
        }
        return q;
    }

    function initDOMElements() {
        elements = {
            body: document.body,
            screens: {
                home: document.getElementById('screen-home'),
                quiz: document.getElementById('screen-quiz'),
                result: document.getElementById('screen-result'),
                manager: document.getElementById('screen-manager')
            },
            header: {
                modeTitle: document.getElementById('header-mode-title'),
                brandBadge: document.getElementById('header-brand-badge'),
                timerBadge: document.getElementById('header-timer'),
                bloodBar: document.getElementById('blood-progress-fill'),
                bloodScoreText: document.getElementById('blood-score-text'),
                btnPen: document.getElementById('btn-toggle-pen'),
                btnManager: document.getElementById('btn-open-manager'),
                btnFullscreen: document.getElementById('btn-fullscreen'),
                btnOMR: document.getElementById('btn-open-omr'),
                btnHome: document.getElementById('btn-go-home'),
                btnCloudSync: document.getElementById('btn-cloud-sync')
            },
            quiz: {
                card: document.getElementById('quiz-card'),
                qNum: document.getElementById('q-num-text'),
                chapterBadge: document.getElementById('q-chapter-badge'),
                comboBadge: document.getElementById('q-combo-badge'),
                weightBadge: document.getElementById('q-weight-badge'),
                qTitle: document.getElementById('q-title-text'),
                passageBox: document.getElementById('q-passage-box'),
                optionsContainer: document.getElementById('q-options-container'),
                subjectiveContainer: document.getElementById('q-subjective-container'),
                explanationCard: document.getElementById('explanation-card'),
                expAnswerBox: document.getElementById('exp-answer-box'),
                expBody: document.getElementById('exp-body-text'),
                tipBox: document.getElementById('tip-box-text'),
                btnPrev: document.getElementById('btn-prev-q'),
                btnNext: document.getElementById('btn-next-q'),
                btnToggleExp: document.getElementById('btn-toggle-exp'),
                btnRetry: document.getElementById('btn-retry-q'),
                btnFlagNeedsEdit: document.getElementById('btn-flag-needs-edit')
            },
            manager: {
                screen: document.getElementById('screen-manager'),
                tabWrong: document.getElementById('mgr-tab-wrong'),
                tabNeedsEdit: document.getElementById('mgr-tab-needs-edit'),
                tabCustomEdits: document.getElementById('mgr-tab-custom-edits'),
                tabSearchAll: document.getElementById('mgr-tab-search-all'),
                cntWrong: document.getElementById('mgr-cnt-wrong'),
                cntNeedsEdit: document.getElementById('mgr-cnt-needs-edit'),
                cntCustomEdits: document.getElementById('mgr-cnt-custom-edits'),
                searchInput: document.getElementById('mgr-search-input'),
                btnSearch: document.getElementById('mgr-btn-search'),
                btnClearSearch: document.getElementById('mgr-btn-clear-search'),
                listCount: document.getElementById('mgr-list-count'),
                itemsList: document.getElementById('mgr-items-list'),
                editorPanel: document.getElementById('mgr-editor-panel'),
                editorEmpty: document.getElementById('mgr-editor-empty'),
                editorForm: document.getElementById('mgr-editor-form'),
                editorBody: document.getElementById('mgr-editor-body'),
                editQKey: document.getElementById('mgr-edit-q-key'),
                metaSubject: document.getElementById('mgr-meta-subject'),
                metaChapter: document.getElementById('mgr-meta-chapter'),
                metaType: document.getElementById('mgr-meta-type'),
                metaId: document.getElementById('mgr-meta-id'),
                flagBadge: document.getElementById('mgr-meta-flag-badge'),
                editedBadge: document.getElementById('mgr-meta-edited-badge'),
                btnFlagToggle: document.getElementById('mgr-btn-flag-toggle'),
                flagText: document.getElementById('mgr-flag-text'),
                btnDeleteWrong: document.getElementById('mgr-btn-delete-wrong'),
                wrongBtnText: document.getElementById('mgr-wrong-btn-text'),
                btnCopyAI: document.getElementById('mgr-btn-copy-ai'),
                btnResetOrig: document.getElementById('mgr-btn-reset-orig'),
                btnDeleteQ: document.getElementById('mgr-btn-delete-q'),
                btnSaveTop: document.getElementById('mgr-btn-save-top'),
                btnSaveBottom: document.getElementById('mgr-btn-save-bottom'),
                editTitle: document.getElementById('mgr-edit-title'),
                editPassage: document.getElementById('mgr-edit-passage'),
                choiceGroup: document.getElementById('mgr-choice-options-group'),
                shortGroup: document.getElementById('mgr-short-answers-group'),
                editShortAns: document.getElementById('mgr-edit-short-ans'),
                editExp: document.getElementById('mgr-edit-exp'),
                editTip: document.getElementById('mgr-edit-tip'),
                btnExportBackup: document.getElementById('btn-export-backup'),
                btnImportBackup: document.getElementById('btn-import-backup'),
                fileImportBackup: document.getElementById('file-import-backup')
            },
            modals: {
                omr: document.getElementById('modal-omr'),
                partSelect: document.getElementById('modal-part-select'),
                pinAuth: document.getElementById('modal-pin-auth'),
                wrongManager: document.getElementById('modal-wrong-manager'),
                editQuestion: document.getElementById('modal-edit-question'),
                downloadMd: document.getElementById('modal-download-md'),
                questionPreview: document.getElementById('modal-question-preview'),
                omrGrid: document.getElementById('omr-grid-container'),
                partList: document.getElementById('part-list-container'),
                wrongList: document.getElementById('wrong-items-container'),
                cntTotalWrong: document.getElementById('cnt-total-wrong'),
                tabWrongList: document.getElementById('tab-btn-wrong-list'),
                tabNeedsEdit: document.getElementById('tab-btn-needs-edit'),
                tabCustomEdits: document.getElementById('tab-btn-custom-edits'),
                tabSearchAll: document.getElementById('tab-btn-search-all'),
                cntWrongTab: document.getElementById('cnt-wrong-tab'),
                cntNeedsEditTab: document.getElementById('cnt-needs-edit-tab'),
                cntCustomEditsTab: document.getElementById('cnt-custom-edits-tab'),
                inputSearch: document.getElementById('input-wrong-manager-search'),
                inputPin: document.getElementById('input-pin-code'),
                formPin: document.getElementById('form-pin-auth')
            },
            result: {
                scoreText: document.getElementById('res-score-text'),
                passPill: document.getElementById('res-pass-pill'),
                correctCount: document.getElementById('res-correct-count'),
                wrongCount: document.getElementById('res-wrong-count'),
                comboCount: document.getElementById('res-combo-count'),
                timeCount: document.getElementById('res-time-count'),
                btnCopyAI: document.getElementById('btn-copy-ai-prompt'),
                btnRetry: document.getElementById('btn-retry-session'),
                btnHomeFromRes: document.getElementById('btn-home-from-result')
            },
            toast: document.getElementById('toast-msg')
        };
    }

    function showScreen(screenKey) {
        if (!elements.screens) return;
        Object.keys(elements.screens).forEach(k => {
            if (elements.screens[k]) {
                elements.screens[k].classList.toggle('active', k === screenKey);
            }
        });

        const appContainer = document.querySelector('.app-container');
        if (screenKey === 'manager') {
            if (elements.body) elements.body.classList.add('manager-mode');
            if (appContainer) appContainer.classList.add('manager-active');
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = '<i class="fa-solid fa-layer-group text-rose-500"></i> 오답 관리 & 전체 문제 에디터 <span class="version-tag" style="font-size: 0.68rem; font-weight: 600; color: #94A3B8; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; vertical-align: middle; margin-left: 4px; border: 1px solid rgba(255,255,255,0.1);">v.0.260830.0110</span>';
            }
        } else {
            if (elements.body) elements.body.classList.remove('manager-mode');
            if (appContainer) appContainer.classList.remove('manager-active');
        }

        const bottomCtrl = document.getElementById('quiz-bottom-controls');
        if (bottomCtrl) {
            bottomCtrl.style.display = screenKey === 'quiz' ? 'block' : 'none';
        }

        if (screenKey === 'quiz') {
            setTimeout(() => {
                if (state.tabletCanvas) {
                    state.tabletCanvas.handleResize();
                }
            }, 60);
        }

        // 홈 화면 복귀 시 헤더 타이틀, 타이머, 게이지 깔끔하게 초기화
        if (screenKey === 'home') {
            state.mode = 'home';
            clearInterval(state.timerInterval);
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = '<i class="fa-solid fa-fire text-amber-500"></i> 주관사 2차 문제지옥 <span class="version-tag" style="font-size: 0.68rem; font-weight: 600; color: #94A3B8; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; vertical-align: middle; margin-left: 4px; border: 1px solid rgba(255,255,255,0.1);">v.0.260830.0110</span>';
            }
            if (elements.header.timerBadge) {
                elements.header.timerBadge.textContent = '00:00';
                elements.header.timerBadge.classList.remove('warning', 'overtime-burning');
            }
            if (elements.header.bloodBar) {
                elements.header.bloodBar.style.width = '0%';
            }
            if (elements.header.bloodScoreText) {
                elements.header.bloodScoreText.textContent = '진행 대기 중';
            }
            if (state.tabletCanvas && state.tabletCanvas.isEnabled) {
                state.tabletCanvas.togglePen(false);
                elements.header.btnPen.classList.remove('active');
            }
        } else if (screenKey === 'result') {
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = '<i class="fa-solid fa-square-poll-vertical text-emerald-400"></i> 학습 및 채점 결과';
            }
        }
    }

    function setSubject(subj) {
        state.subject = subj;
        localStorage.setItem('hell_subject', subj);
        if (elements.body) {
            elements.body.setAttribute('data-subject', subj);
        }

        document.querySelectorAll('.subject-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subject === subj);
        });

        if (elements.header && elements.header.brandBadge) {
            elements.header.brandBadge.textContent = subj;
        }
    }

    function showToast(msg) {
        if (!elements.toast) return;
        elements.toast.textContent = msg;
        elements.toast.classList.add('show');
        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 2200);
    }

    async function startMode(modeKey, partPattern = '') {
        state.mode = modeKey;
        state.currentPartPattern = partPattern;
        state.currentIndex = 0;
        state.currentCombo = 0;
        state.maxCombo = 0;
        state.userAnswers = [];
        state.results = [];
        state.firstAttemptResults = [];
        state.isExplanationOpen = false;
        if (state.sessionStrokes) state.sessionStrokes.clear();
        state.statsMap = await IDBStore.getAllStatsMap();

        if (modeKey === 'infinite') {
            state.infiniteSetCount = 1;
            state.infiniteUsedKeys.clear();
            // 헬 모드: 과목(관계법규+관리실무 50:50) 및 전 단원 블루프린트 100% 반영 80문항 융합 세트
            state.questions = ExamEngine.generateInfiniteHellSet(state.statsMap, state.infiniteUsedKeys);
            state.questions.forEach(q => {
                applyCustomEdits(q);
                state.infiniteUsedKeys.add(q.qKey);
            });
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-skull text-rose-500"></i> 무한 헬 모드 (세트 1: 1~80번)`;
            }
        } else if (modeKey === 'review') {
            state.questions = ExamEngine.generateReviewSet(state.subject, state.statsMap, 40);
            state.questions.forEach(applyCustomEdits);
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-rotate-left text-orange-400"></i> 오답 집중 복습 (40문항)`;
            }
        } else if (modeKey === 'mock') {
            state.questions = ExamEngine.generateExamSet(state.subject, state.statsMap);
            state.questions.forEach(applyCustomEdits);
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-clock text-sky-400"></i> 실전 모의고사 (40분)`;
            }
        } else if (modeKey === 'part') {
            state.questions = ExamEngine.generatePartSet(state.subject, partPattern);
            state.questions.forEach(applyCustomEdits);
            PartProgressManager.saveProgress(state.subject, partPattern, state);
            if (elements.header.modeTitle) {
                elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-layer-group text-purple-400"></i> 파트별 전수 완독`;
            }
        }

        if (state.questions.length === 0) {
            showToast('출제 가능한 문제가 없습니다.');
            return;
        }

        startTimer(modeKey === 'mock');
        showScreen('quiz');
        renderQuestion(0);
    }

    async function resumePart(subject, chapter) {
        const prog = PartProgressManager.getProgress(subject, chapter);
        if (!prog || !prog.questionKeys || prog.questionKeys.length === 0) {
            startMode('part', chapter);
            return;
        }

        const allPool = [
            ...ExamEngine.getQuestionPool(subject, 'choice'),
            ...ExamEngine.getQuestionPool(subject, 'short')
        ];
        const poolMap = new Map(allPool.map(q => [q.qKey, q]));

        const restoredQuestions = prog.questionKeys.map(k => poolMap.get(k)).filter(Boolean);
        if (restoredQuestions.length === 0) {
            startMode('part', chapter);
            return;
        }

        state.mode = 'part';
        state.currentPartPattern = chapter;
        state.questions = restoredQuestions;
        state.questions.forEach(applyCustomEdits);

        state.currentIndex = Math.min(prog.currentIndex || 0, state.questions.length - 1);
        state.userAnswers = prog.userAnswers || [];
        state.results = prog.results || [];
        state.firstAttemptResults = prog.firstAttemptResults || [];
        state.isExplanationOpen = false;
        if (state.sessionStrokes) state.sessionStrokes.clear();
        state.statsMap = await IDBStore.getAllStatsMap();

        if (elements.header.modeTitle) {
            elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-layer-group text-purple-400"></i> 파트별 전수 완독 (이어풀기)`;
        }

        startTimer(false);
        state.elapsedSeconds = prog.elapsedSeconds || 0;
        showScreen('quiz');
        renderQuestion(state.currentIndex);
        showToast(`💾 [${chapter}] ${state.currentIndex + 1}번 문항부터 이어풀기를 시작합니다.`);
    }

    function startTimer(isCountdown = false) {
        clearInterval(state.timerInterval);
        state.elapsedSeconds = 0;
        state.mockRemainingSeconds = 40 * 60;
        if (elements.header.timerBadge) {
            elements.header.timerBadge.classList.remove('warning', 'overtime-burning');
        }

        const updateTimerDisplay = () => {
            if (isCountdown) {
                state.mockRemainingSeconds--;
                if (state.mockRemainingSeconds >= 0) {
                    const mins = Math.floor(state.mockRemainingSeconds / 60);
                    const secs = state.mockRemainingSeconds % 60;
                    elements.header.timerBadge.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                    elements.header.timerBadge.classList.remove('overtime-burning');

                    if (state.mockRemainingSeconds <= 300) {
                        elements.header.timerBadge.classList.add('warning');
                    } else {
                        elements.header.timerBadge.classList.remove('warning');
                    }
                } else {
                    // Overtime: -MM:SS with burning flame animation (no forced quit)
                    const overSecs = Math.abs(state.mockRemainingSeconds);
                    const overMins = Math.floor(overSecs / 60);
                    const overRemSecs = overSecs % 60;
                    elements.header.timerBadge.textContent = `-${String(overMins).padStart(2, '0')}:${String(overRemSecs).padStart(2, '0')}`;
                    elements.header.timerBadge.classList.remove('warning');
                    elements.header.timerBadge.classList.add('overtime-burning');
                }
            } else {
                state.elapsedSeconds++;
                const mins = Math.floor(state.elapsedSeconds / 60);
                const secs = state.elapsedSeconds % 60;
                elements.header.timerBadge.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                elements.header.timerBadge.classList.remove('warning', 'overtime-burning');
            }
        };

        updateTimerDisplay();
        state.timerInterval = setInterval(updateTimerDisplay, 1000);
    }

    function formatQuestionAndPassage(q) {
        let rawQ = (q.question || '').trim();
        let rawPassage = (q.passage || '').trim();

        let title = rawQ;
        let extraPassage = '';

        if (rawQ.includes('\n')) {
            const parts = rawQ.split('\n');
            title = parts[0].trim();
            extraPassage = parts.slice(1).join('\n').trim();
        }

        let combinedPassage = [rawPassage, extraPassage].filter(Boolean).join('\n\n');

        if (combinedPassage) {
            combinedPassage = combinedPassage
                .replace(/([.!?])([㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪①②③④⑤⑥⑦⑧⑨⑩])/g, '$1 $2')
                .replace(/\r\n/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        return {
            title: q.exam_info ? `[${q.exam_info}] ${title}` : title,
            passage: combinedPassage
        };
    }

    function formatExplanation(text) {
        if (!text) return '';
        return text
            .replace(/([.!?])([㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪①②③④⑤⑥⑦⑧⑨⑩])/g, '$1 $2')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function renderQuestion(index) {
        state.currentIndex = index;
        const q = state.questions[index];
        if (!q) return;

        applyCustomEdits(q);

        state.isExplanationOpen = false;
        elements.quiz.explanationCard.classList.remove('active');

        if (state.tabletCanvas) {
            await state.tabletCanvas.loadQuestionStrokes(q.qKey);
        }

        const stat = state.statsMap[q.qKey] || { weight: 1, wrongCount: 0 };
        const weight = stat.weight || 1;

        elements.quiz.card.className = `quiz-card card-w${weight >= 3.0 ? 10 : (weight >= 2.5 ? 6 : (weight >= 2.0 ? 4 : (weight >= 1.5 ? 2 : 1)))}`;

        if (state.mode === 'infinite') {
            const isLaw = q.subject === '관계법규';
            const numColor = isLaw ? '#38BDF8' : '#34D399';
            const badgeBg = isLaw ? 'rgba(56, 189, 248, 0.18)' : 'rgba(52, 211, 153, 0.18)';
            const badgeBorder = isLaw ? 'rgba(56, 189, 248, 0.35)' : 'rgba(52, 211, 153, 0.35)';
            const badgeText = isLaw ? '관계법규' : '관리실무';

            elements.quiz.qNum.innerHTML = `
                <span style="background: ${badgeBg}; color: ${numColor}; border: 1px solid ${badgeBorder}; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 800; margin-right: 6px; vertical-align: middle;">${badgeText}</span>
                <span style="color: ${numColor}; font-weight: 900;">문항 ${index + 1}</span>
                <span style="color: #94A3B8; font-size: 0.85rem; font-weight: 500;"> / ${state.questions.length}</span>
            `;

            if (elements.header.brandBadge) {
                elements.header.brandBadge.textContent = q.subject;
                elements.header.brandBadge.style.color = numColor;
                elements.header.brandBadge.style.borderColor = badgeBorder;
                elements.header.brandBadge.style.backgroundColor = badgeBg;
            }
        } else {
            elements.quiz.qNum.textContent = `문항 ${index + 1} / ${state.questions.length}`;
            if (elements.header.brandBadge) {
                elements.header.brandBadge.textContent = state.subject;
                elements.header.brandBadge.style.color = '';
                elements.header.brandBadge.style.borderColor = '';
                elements.header.brandBadge.style.backgroundColor = '';
            }
        }
        
        let chapText = q.chapterName.replace(/^CHAPTER\s+\d+\s*/i, '');
        if (q.isHighYield && q.primaryCoreItem) {
            const isSuper = (q.topScore >= 6);
            const badgeClass = isSuper ? 'badge-high-yield badge-tier-super' : 'badge-high-yield';
            const iconHtml = isSuper ? '<i class="fa-solid fa-fire text-rose-500"></i> 초특급 빈출' : '<i class="fa-solid fa-star text-amber-400"></i> 핵심 300선';
            elements.quiz.chapterBadge.innerHTML = `${chapText} <span class="${badgeClass}" title="${q.primaryCoreItem.note}">${iconHtml} #${String(q.primaryCoreItem.id).padStart(3, '0')} ${q.primaryCoreItem.tag}</span>`;
        } else {
            elements.quiz.chapterBadge.textContent = chapText;
        }

        if (elements.quiz.comboBadge) {
            if (state.currentCombo >= 2) {
                elements.quiz.comboBadge.textContent = `🔥 ${state.currentCombo} COMBO`;
                elements.quiz.comboBadge.style.display = 'inline-flex';
            } else {
                elements.quiz.comboBadge.style.display = 'none';
            }
        }

        let wIcon = '🌱 기본';
        if (weight >= 10) wIcon = '🔥 지옥 (Lv.4)';
        else if (weight >= 6) wIcon = '🚨 취약 (Lv.3)';
        else if (weight >= 4) wIcon = '⚠️ 주의 (Lv.2)';
        else if (weight >= 2) wIcon = '⚡ 복습 (Lv.1)';
        elements.quiz.weightBadge.textContent = wIcon;

        // Smart formatting for Title and Passage
        const formatted = formatQuestionAndPassage(q);
        elements.quiz.qTitle.textContent = formatted.title;

        if (formatted.passage && formatted.passage.trim()) {
            elements.quiz.passageBox.textContent = formatted.passage;
            elements.quiz.passageBox.style.display = 'block';
        } else {
            elements.quiz.passageBox.style.display = 'none';
        }

        if (q.type === 'choice') {
            elements.quiz.subjectiveContainer.style.display = 'none';
            elements.quiz.optionsContainer.style.display = 'flex';
            renderChoiceOptions(q, index);
        } else {
            elements.quiz.optionsContainer.style.display = 'none';
            elements.quiz.subjectiveContainer.style.display = 'block';
            renderSubjectiveBlanks(q, index);
        }

        // Render Prominent Target Answer Banner
        if (elements.quiz.expAnswerBox) {
            if (q.type === 'choice') {
                const optText = (q.options && q.options[Number(q.answer) - 1]) ? q.options[Number(q.answer) - 1] : '';
                elements.quiz.expAnswerBox.innerHTML = `
                    <span class="exp-answer-badge">정답</span>
                    <span class="exp-answer-val">${q.answer}번 <span style="font-weight: 500; font-size: 0.9rem; color: #CBD5E1;">(${optText})</span></span>
                `;
            } else {
                const pills = sortSubjectiveEntries(Object.entries(q.answers || {})).map(([k, v]) => `
                    <span class="exp-blank-pill">[${k}] <b>${v}</b></span>
                `).join('');
                elements.quiz.expAnswerBox.innerHTML = `
                    <span class="exp-answer-badge">모범 답안</span>
                    <span class="exp-answer-val">${pills || '답안 정보 없음'}</span>
                `;
            }
        }

        let expText = q.explanation && q.explanation.trim().length > 0 
            ? formatExplanation(q.explanation)
            : (q.type === 'short' ? '본 문항의 조문 및 법령 규정에 따른 정확한 기입 답안은 위와 같습니다.' : '');

        if (q.isHighYield && q.primaryCoreItem) {
            const isSuper = (q.topScore >= 6);
            const titleHtml = isSuper 
                ? `<i class="fa-solid fa-fire text-rose-500"></i> [초특급 빈출 No.${String(q.primaryCoreItem.id).padStart(3, '0')}] ${q.primaryCoreItem.topic}`
                : `<i class="fa-solid fa-star text-amber-400"></i> [초고효율 핵심 300선 No.${String(q.primaryCoreItem.id).padStart(3, '0')}] ${q.primaryCoreItem.topic}`;
            const calloutClass = isSuper ? 'core-theme-callout callout-tier-super' : 'core-theme-callout';
            const calloutHtml = `
                <div class="${calloutClass}">
                    <div class="core-theme-title">${titleHtml}</div>
                    <div class="core-theme-note"><b>💡 출제 포인트:</b> ${q.primaryCoreItem.note}</div>
                </div>
            `;
            elements.quiz.expBody.innerHTML = `<div style="white-space: pre-wrap;">${expText}</div>${calloutHtml}`;
        } else {
            elements.quiz.expBody.textContent = expText;
        }

        if (q.tip) {
            elements.quiz.tipBox.textContent = `💡 일타 팁: ${q.tip}`;
            elements.quiz.tipBox.style.display = 'block';
        } else {
            elements.quiz.tipBox.style.display = 'none';
        }

        // Update [수정필요] flag button state
        const btnFlagNeedsEdit = document.getElementById('btn-flag-needs-edit');
        if (btnFlagNeedsEdit) {
            const isFlagged = !!(state.needsEditMap && state.needsEditMap[q.qKey]);
            btnFlagNeedsEdit.classList.toggle('active', isFlagged);
            btnFlagNeedsEdit.innerHTML = isFlagged 
                ? '<i class="fa-solid fa-flag text-amber-400"></i> 수정요청됨'
                : '<i class="fa-solid fa-flag"></i> 수정필요';
        }

        // Show [다시 풀기] button ONLY when problem is graded and INCORRECT!
        if (elements.quiz.btnRetry) {
            const res = state.results[index];
            if (res !== undefined && !res.isCorrect) {
                elements.quiz.btnRetry.style.display = 'inline-flex';
            } else {
                elements.quiz.btnRetry.style.display = 'none';
            }
        }

        // Update Bottom Bar [정답 확인 / 정답·해설] button label
        if (elements.quiz.btnToggleExp) {
            if (state.results[index] === undefined) {
                const userAns = state.userAnswers[index];
                if (userAns !== undefined && userAns !== null && userAns !== '') {
                    elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> ${userAns}번 정답 확인`;
                } else {
                    elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> 정답 확인`;
                }
            } else {
                elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-lightbulb text-amber-400"></i> 정답·해설`;
            }
        }

        updateBloodGauge();
    }

    function renderChoiceOptions(q, index) {
        elements.quiz.optionsContainer.innerHTML = '';
        const userSelected = state.userAnswers[index];
        const res = state.results[index];
        const isNegativeQuestion = /옳지\s*않|틀린|아닌|잘못된|어긋난/i.test(q.question || q.title || '');

        (q.options || []).forEach((optText, optIdx) => {
            const choiceNum = optIdx + 1;
            const optBtn = document.createElement('button');
            optBtn.className = 'option-item';
            if (userSelected === choiceNum) optBtn.classList.add('selected');

            let textClass = 'opt-text';
            let extraBadge = '';

            if (res !== undefined) {
                if (choiceNum === Number(q.answer)) {
                    optBtn.classList.add('correct');
                    if (isNegativeQuestion) {
                        textClass += ' false-statement-text';
                        extraBadge = '<span class="false-text-badge">⚠️ 틀린 지문</span>';
                    }
                } else if (userSelected === choiceNum && !res.isCorrect) {
                    optBtn.classList.add('wrong');
                }
            }

            optBtn.innerHTML = `
                <span class="opt-num">${choiceNum}</span>
                <span class="${textClass}">${optText}${extraBadge}</span>
            `;

            optBtn.addEventListener('click', () => {
                selectChoice(choiceNum);
            });

            elements.quiz.optionsContainer.appendChild(optBtn);
        });
    }

    function renderSubjectiveBlanks(q, index) {
        elements.quiz.subjectiveContainer.innerHTML = '';
        const userResponse = state.userAnswers[index] || {};
        const res = state.results[index];
        const targetAnswers = q.answers || {};

        sortSubjectiveEntries(Object.entries(targetAnswers)).forEach(([k]) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'blank-row-wrapper';

            const row = document.createElement('div');
            row.className = 'blank-row';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'blank-input';
            input.placeholder = `빈칸 [${k}] 정답 입력 (터치/키보드/S펜)`;
            input.value = userResponse[k] || '';
            input.dataset.key = k;

            if (res && res.details && res.details[k]) {
                input.classList.add(res.details[k].isCorrect ? 'correct' : 'wrong');
            }

            input.addEventListener('input', (e) => {
                if (!state.userAnswers[index]) state.userAnswers[index] = {};
                state.userAnswers[index][k] = e.target.value;
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const nextWrapper = wrapper.nextElementSibling;
                    const nextInput = nextWrapper?.querySelector('input');
                    if (nextInput) {
                        nextInput.focus();
                    } else {
                        gradeCurrentQuestion();
                    }
                }
            });

            const btnToggleHW = document.createElement('button');
            btnToggleHW.type = 'button';
            btnToggleHW.className = 'btn-toggle-hw';
            btnToggleHW.innerHTML = `<i class="fa-solid fa-pen-fancy"></i> 필기인식`;

            row.innerHTML = `<span class="blank-label">[${k}]</span>`;
            row.appendChild(input);
            row.appendChild(btnToggleHW);
            wrapper.appendChild(row);

            // Handwriting Drawer
            const drawer = document.createElement('div');
            drawer.className = 'hw-drawer';
            drawer.style.display = 'none';

            drawer.innerHTML = `
                <div class="hw-canvas-box">
                    <canvas class="hw-canvas"></canvas>
                    <div class="hw-guide-line"></div>
                    <div class="hw-status-text">여기에 펜/손가락으로 글씨를 쓰면 실시간 자동 인식됩니다</div>
                </div>
                <div class="hw-bar">
                    <div class="hw-candidates">
                        <span class="hw-cand-label">인식 후보:</span>
                        <span class="hw-cand-empty" style="font-size: 0.82rem; color: var(--text-muted);">글씨를 작성하세요</span>
                    </div>
                    <div class="hw-btn-group">
                        <button type="button" class="btn-hw-action btn-hw-back" title="한 글자 지우기"><i class="fa-solid fa-delete-left"></i> 지움</button>
                        <button type="button" class="btn-hw-action btn-hw-clear" title="패드 전체 지우기"><i class="fa-solid fa-trash-can"></i> 전체삭제</button>
                        <button type="button" class="btn-hw-action btn-hw-done" title="필기 완료"><i class="fa-solid fa-check"></i> 완료</button>
                    </div>
                </div>
            `;
            wrapper.appendChild(drawer);

            // Setup Handwriting Pad inside Drawer
            const hwCanvas = drawer.querySelector('.hw-canvas');
            const candidatesBox = drawer.querySelector('.hw-candidates');
            const btnBack = drawer.querySelector('.btn-hw-back');
            const btnClear = drawer.querySelector('.btn-hw-clear');
            const btnDone = drawer.querySelector('.btn-hw-done');

            let hwCtx = null;
            let hwStrokes = [];
            let currentHwStroke = null;
            let isHwDrawing = false;
            let hwRecognizeTimer = null;

            function initHwCanvas() {
                const rect = hwCanvas.parentElement.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const w = Math.round(rect.width) || 360;
                const h = Math.round(rect.height) || 140;

                hwCanvas.width = w * dpr;
                hwCanvas.height = h * dpr;
                hwCanvas.style.width = w + 'px';
                hwCanvas.style.height = h + 'px';

                hwCtx = hwCanvas.getContext('2d');
                hwCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                redrawHwCanvas();
            }

            function redrawHwCanvas() {
                if (!hwCtx) return;
                const dpr = window.devicePixelRatio || 1;
                hwCtx.clearRect(0, 0, hwCanvas.width / dpr, hwCanvas.height / dpr);

                hwStrokes.forEach(stroke => {
                    if (!stroke || stroke.length < 2) return;
                    hwCtx.save();
                    hwCtx.strokeStyle = '#38BDF8';
                    hwCtx.lineWidth = 3.5;
                    hwCtx.lineCap = 'round';
                    hwCtx.lineJoin = 'round';
                    hwCtx.beginPath();
                    hwCtx.moveTo(stroke[0].x, stroke[0].y);
                    for (let i = 1; i < stroke.length; i++) {
                        hwCtx.lineTo(stroke[i].x, stroke[i].y);
                    }
                    hwCtx.stroke();
                    hwCtx.restore();
                });
            }

            async function triggerRecognition() {
                if (hwStrokes.length === 0) return;
                const dpr = window.devicePixelRatio || 1;
                const w = hwCanvas.width / dpr;
                const h = hwCanvas.height / dpr;

                candidatesBox.innerHTML = `<span class="hw-cand-label">인식 중...</span>`;

                const candidates = await HandwritingRecognizer.recognize(hwStrokes, w, h);
                if (candidates && candidates.length > 0) {
                    const topCand = candidates[0].trim();
                    input.value = topCand;
                    if (!state.userAnswers[index]) state.userAnswers[index] = {};
                    state.userAnswers[index][k] = topCand;

                    candidatesBox.innerHTML = `<span class="hw-cand-label">후보:</span>`;
                    candidates.slice(0, 6).forEach((cand, cIdx) => {
                        const chip = document.createElement('button');
                        chip.type = 'button';
                        chip.className = `hw-cand-chip ${cIdx === 0 ? 'selected' : ''}`;
                        chip.textContent = cand;
                        chip.addEventListener('click', () => {
                            candidatesBox.querySelectorAll('.hw-cand-chip').forEach(c => c.classList.remove('selected'));
                            chip.classList.add('selected');
                            input.value = cand.trim();
                            if (!state.userAnswers[index]) state.userAnswers[index] = {};
                            state.userAnswers[index][k] = cand.trim();
                        });
                        candidatesBox.appendChild(chip);
                    });
                } else {
                    candidatesBox.innerHTML = `<span class="hw-cand-label">후보:</span><span style="font-size: 0.82rem; color: #F87171;">인식 결과 없음 (다시 작성)</span>`;
                }
            }

            hwCanvas.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                isHwDrawing = true;
                try { hwCanvas.setPointerCapture(e.pointerId); } catch (err) {}

                const rect = hwCanvas.getBoundingClientRect();
                const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() };
                currentHwStroke = [pt];
                hwStrokes.push(currentHwStroke);

                if (hwRecognizeTimer) clearTimeout(hwRecognizeTimer);
            });

            hwCanvas.addEventListener('pointermove', (e) => {
                if (!isHwDrawing || !currentHwStroke) return;
                e.preventDefault();

                const rect = hwCanvas.getBoundingClientRect();
                const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: Date.now() };
                currentHwStroke.push(pt);
                redrawHwCanvas();
            });

            hwCanvas.addEventListener('pointerup', (e) => {
                if (!isHwDrawing) return;
                isHwDrawing = false;
                currentHwStroke = null;
                try { if (e && e.pointerId) hwCanvas.releasePointerCapture(e.pointerId); } catch (err) {}

                if (hwRecognizeTimer) clearTimeout(hwRecognizeTimer);
                hwRecognizeTimer = setTimeout(() => {
                    triggerRecognition();
                }, 450);
            });

            btnToggleHW.addEventListener('click', () => {
                const isOpen = drawer.style.display !== 'none';
                drawer.style.display = isOpen ? 'none' : 'block';
                btnToggleHW.classList.toggle('active', !isOpen);
                wrapper.classList.toggle('hw-active', !isOpen);

                if (!isOpen) {
                    setTimeout(() => initHwCanvas(), 50);
                }
            });

            btnBack.addEventListener('click', () => {
                input.value = input.value.slice(0, -1);
                if (!state.userAnswers[index]) state.userAnswers[index] = {};
                state.userAnswers[index][k] = input.value;
            });

            btnClear.addEventListener('click', () => {
                hwStrokes = [];
                redrawHwCanvas();
                input.value = '';
                if (!state.userAnswers[index]) state.userAnswers[index] = {};
                state.userAnswers[index][k] = '';
                candidatesBox.innerHTML = `<span class="hw-cand-label">후보:</span><span style="font-size: 0.82rem; color: var(--text-muted);">글씨를 작성하세요</span>`;
            });

            btnDone.addEventListener('click', () => {
                drawer.style.display = 'none';
                btnToggleHW.classList.remove('active');
                wrapper.classList.remove('hw-active');
            });

            elements.quiz.subjectiveContainer.appendChild(wrapper);
        });
    }

    function selectChoice(choiceNum) {
        const idx = state.currentIndex;
        if (state.results[idx] !== undefined) return; // Already checked

        state.userAnswers[idx] = choiceNum;

        // Visual selection update
        const optBtns = elements.quiz.optionsContainer.querySelectorAll('.option-item');
        optBtns.forEach((btn, optIdx) => {
            if (optIdx + 1 === choiceNum) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        if (elements.quiz.btnToggleExp) {
            elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> ${choiceNum}번 정답 확인`;
        }
    }

    async function gradeCurrentQuestion() {
        const idx = state.currentIndex;
        const q = state.questions[idx];
        const userAns = state.userAnswers[idx];

        if (state.results[idx] !== undefined) {
            toggleExplanation();
            return;
        }

        const gradeRes = Grader.grade(q, userAns);
        state.results[idx] = gradeRes;

        // 최초 시도인 경우에만 오답 가중치 DB 기록 및 시험 성적용 최초 결과 박제!
        if (state.firstAttemptResults[idx] === undefined) {
            state.firstAttemptResults[idx] = gradeRes;
            const updatedStat = await IDBStore.recordAnswer(q.qKey, gradeRes.isCorrect, {
                subject: q.subject,
                type: q.type,
                chapter: q.chapterName
            });
            state.statsMap[q.qKey] = updatedStat;

            // 콤보 스트릭 계산
            if (gradeRes.isCorrect) {
                state.currentCombo = (state.currentCombo || 0) + 1;
                if (state.currentCombo > (state.maxCombo || 0)) {
                    state.maxCombo = state.currentCombo;
                }
                if (state.currentCombo >= 3) {
                    showToast(`🔥 ${state.currentCombo} COMBO! 연속 정답 행진!`);
                }
            } else {
                state.currentCombo = 0;
            }
        }

        renderQuestion(idx);
        toggleExplanation(true);
        triggerVisualFeedback(gradeRes.isCorrect);

        if (state.mode === 'part') {
            PartProgressManager.saveProgress(state.subject, state.currentPartPattern, state);
        }
    }

    function triggerVisualFeedback(isCorrect) {
        if (!elements.quiz.card) return;
        const card = elements.quiz.card;

        card.classList.remove('anim-quake', 'anim-tada');
        void card.offsetWidth; // Reflow to restart animation

        if (isCorrect) {
            card.classList.add('anim-tada');
            createSparkleBurst();
        } else {
            card.classList.add('anim-quake');
        }

        setTimeout(() => {
            card.classList.remove('anim-quake', 'anim-tada');
        }, 600);
    }

    function createSparkleBurst() {
        if (!elements.quiz.card) return;
        const card = elements.quiz.card;
        const rect = card.getBoundingClientRect();
        const container = document.createElement('div');
        container.className = 'sparkle-burst-container';
        container.style.left = `${rect.left + rect.width / 2}px`;
        container.style.top = `${rect.top + rect.height / 3}px`;

        const symbols = ['✨', '⭐', '🌟', '🎉', '💚', '🔥'];
        for (let i = 0; i < 14; i++) {
            const particle = document.createElement('span');
            particle.className = 'sparkle-particle';
            particle.textContent = symbols[Math.floor(Math.random() * symbols.length)];
            const angle = (i / 14) * 2 * Math.PI + (Math.random() - 0.5) * 0.4;
            const distance = 90 + Math.random() * 80;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance - 35;
            particle.style.setProperty('--tx', `${tx}px`);
            particle.style.setProperty('--ty', `${ty}px`);
            particle.style.animationDelay = `${Math.random() * 0.06}s`;
            container.appendChild(particle);
        }
        document.body.appendChild(container);
        setTimeout(() => container.remove(), 900);
    }

    function toggleExplanation(forceOpen) {
        state.isExplanationOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.isExplanationOpen;
        elements.quiz.explanationCard.classList.toggle('active', state.isExplanationOpen);
    }

    function retryCurrentQuestion() {
        const idx = state.currentIndex;
        state.userAnswers[idx] = undefined;
        state.results[idx] = undefined;
        toggleExplanation(false);
        renderQuestion(idx);
        showToast('문제가 초기화되었습니다. 다시 풀어보세요!');

        setTimeout(() => {
            const firstInput = elements.quiz.subjectiveContainer.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 60);
    }

    function updateBloodGauge() {
        let answeredCount = 0;
        let wrongCount = 0;

        state.results.forEach(res => {
            if (res !== undefined) {
                answeredCount++;
                if (!res.isCorrect) wrongCount++;
            }
        });

        const wrongRate = answeredCount > 0 ? Math.round((wrongCount / answeredCount) * 100) : 0;
        const progressPercent = Math.round(((state.currentIndex + 1) / state.questions.length) * 100);

        elements.header.bloodBar.style.width = `${progressPercent}%`;

        if (wrongRate >= 40) {
            elements.header.bloodBar.style.backgroundColor = '#EF4444';
            elements.header.bloodScoreText.style.color = '#EF4444';
        } else if (wrongRate >= 20) {
            elements.header.bloodBar.style.backgroundColor = '#F59E0B';
            elements.header.bloodScoreText.style.color = '#F59E0B';
        } else {
            elements.header.bloodBar.style.backgroundColor = state.subject === '관리실무' ? '#34D399' : '#38BDF8';
            elements.header.bloodScoreText.style.color = 'var(--text-main)';
        }

        elements.header.bloodScoreText.textContent = `오답률: ${wrongRate}% (${wrongCount}/${answeredCount})`;
    }

    function nextQuestion() {
        if (state.currentIndex < state.questions.length - 1) {
            renderQuestion(state.currentIndex + 1);
            if (state.mode === 'part') {
                PartProgressManager.saveProgress(state.subject, state.currentPartPattern, state);
            }
        } else {
            if (state.mode === 'infinite') {
                state.infiniteSetCount++;
                const nextSet = ExamEngine.generateInfiniteHellSet(state.statsMap, state.infiniteUsedKeys);
                if (nextSet.length > 0) {
                    nextSet.forEach(q => {
                        applyCustomEdits(q);
                        state.infiniteUsedKeys.add(q.qKey);
                    });
                    state.questions.push(...nextSet);
                    showToast(`🔥 [헬 모드 ${state.infiniteSetCount}세트] 80문항 추가 소환!`);
                    if (elements.header.modeTitle) {
                        elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-skull text-rose-500"></i> 무한 헬 모드 (세트 ${state.infiniteSetCount}: ${state.questions.length - 79}~${state.questions.length}번)`;
                    }
                    renderQuestion(state.currentIndex + 1);
                    return;
                }
            }
            finishSession();
        }
    }

    function prevQuestion() {
        if (state.currentIndex > 0) {
            renderQuestion(state.currentIndex - 1);
            if (state.mode === 'part') {
                PartProgressManager.saveProgress(state.subject, state.currentPartPattern, state);
            }
        }
    }

    async function finishSession() {
        clearInterval(state.timerInterval);

        if (state.mode === 'part') {
            PartProgressManager.clearProgress(state.subject, state.currentPartPattern);
        }

        let correctCount = 0;
        let wrongCount = 0;

        state.questions.forEach((q, idx) => {
            // 시험 최종 성적은 최초 시도(firstAttemptResults) 기준으로 엄격하고 정직하게 산출!
            const res = state.firstAttemptResults[idx] !== undefined ? state.firstAttemptResults[idx] : state.results[idx];
            if (res && res.isCorrect) correctCount++;
            else wrongCount++;
        });

        const score = Math.round((correctCount / state.questions.length) * 100);

        await IDBStore.saveSession({
            mode: state.mode,
            subject: state.subject,
            total: state.questions.length,
            correct: correctCount,
            wrong: wrongCount,
            score,
            duration: state.elapsedSeconds
        });

        elements.result.scoreText.textContent = `${score}점`;
        elements.result.correctCount.textContent = `${correctCount}개`;
        elements.result.wrongCount.textContent = `${wrongCount}개`;
        if (elements.result.comboCount) {
            elements.result.comboCount.textContent = `${state.maxCombo || 0} COMBO`;
        }

        const mins = Math.floor(state.elapsedSeconds / 60);
        const secs = state.elapsedSeconds % 60;
        elements.result.timeCount.textContent = `${mins}분 ${secs}초`;

        if (score >= 60) {
            elements.result.passPill.className = 'pass-pill pass';
            elements.result.passPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> 최종 합격 (PASS)';
        } else {
            elements.result.passPill.className = 'pass-pill fail';
            elements.result.passPill.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> 불합격 / 과락 주의 (RE-STUDY)';
        }

        showScreen('result');
    }

    function openOMR() {
        const modal = elements.modals.omr || document.getElementById('modal-omr');
        const grid = elements.modals.omrGrid || document.getElementById('omr-grid-container');
        if (!modal || !grid) return;

        OMRSheet.renderGrid(
            grid,
            state.questions,
            state.userAnswers,
            state.results,
            (targetIdx) => {
                closeModal(modal);
                renderQuestion(targetIdx);
            }
        );
        modal.classList.add('active');
    }

    function openPartSelectModal() {
        if (!elements.modals.partSelect || !elements.modals.partList) return;
        elements.modals.partList.innerHTML = '';

        const chapters = ExamEngine.getChapterList(state.subject);
        const mcPool = ExamEngine.getQuestionPool(state.subject, 'choice');
        const saPool = ExamEngine.getQuestionPool(state.subject, 'short');

        chapters.forEach(c => {
            const regex = new RegExp(c.chapter);
            const totalCount = mcPool.filter(q => regex.test(q.chapterName)).length + saPool.filter(q => regex.test(q.chapterName)).length;
            const prog = PartProgressManager.getProgress(state.subject, c.chapter);

            // Check if there is valid unfinished progress to resume
            if (prog && prog.questionKeys && prog.questionKeys.length > 0 && prog.currentIndex > 0 && prog.currentIndex < prog.totalQuestions) {
                const currentNum = prog.currentIndex + 1;
                const pct = Math.round((currentNum / prog.totalQuestions) * 100);
                const card = document.createElement('div');
                card.className = 'part-progress-card';
                card.innerHTML = `
                    <div class="part-card-header">
                        <div class="part-card-title">
                            <i class="fa-solid fa-book-bookmark text-sky-400"></i> ${c.chapter}
                        </div>
                        <span class="part-progress-badge in-progress">
                            <i class="fa-solid fa-floppy-disk text-amber-400"></i> 진행중 ${currentNum}/${prog.totalQuestions}번 (${pct}%)
                        </span>
                    </div>
                    <div class="part-progress-bar-bg">
                        <div class="part-progress-bar-fill" style="width: ${pct}%;"></div>
                    </div>
                    <div class="part-card-actions">
                        <button type="button" class="btn-part-resume">
                            <i class="fa-solid fa-play"></i> 이어풀기 (${currentNum}번부터)
                        </button>
                        <button type="button" class="btn-part-restart">
                            <i class="fa-solid fa-rotate-left"></i> 처음부터
                        </button>
                    </div>
                `;

                const btnResume = card.querySelector('.btn-part-resume');
                btnResume.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeModal(elements.modals.partSelect);
                    resumePart(state.subject, c.chapter);
                });

                const btnRestart = card.querySelector('.btn-part-restart');
                btnRestart.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`[${c.chapter}]\n기존에 저장된 풀이 기록(${currentNum}번까지)을 초기화하고 1번부터 새로 시작하시겠습니까?`)) {
                        PartProgressManager.clearProgress(state.subject, c.chapter);
                        closeModal(elements.modals.partSelect);
                        startMode('part', c.chapter);
                    }
                });

                elements.modals.partList.appendChild(card);
            } else {
                const btn = document.createElement('button');
                btn.className = 'part-item-btn';
                btn.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-book-bookmark text-sky-400"></i>
                        <span>${c.chapter}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.8rem; color: #94A3B8;">전체 ${totalCount}문항</span>
                        <i class="fa-solid fa-chevron-right text-slate-500"></i>
                    </div>
                `;
                btn.addEventListener('click', () => {
                    closeModal(elements.modals.partSelect);
                    startMode('part', c.chapter);
                });
                elements.modals.partList.appendChild(btn);
            }
        });

        elements.modals.partSelect.classList.add('active');
    }

    function openDownloadMdModal() {
        if (!elements.modals.downloadMd) return;
        elements.modals.downloadMd.classList.add('active');
    }

    function generateMockExamMarkdown(subject) {
        const set = ExamEngine.generateExamSet(subject, state.statsMap);
        if (!set || set.length === 0) {
            showToast('❌ 문제를 불러올 수 없습니다.');
            return;
        }

        set.forEach(q => applyCustomEdits(q));

        const nowStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
        let md = `# 📘 [주택관리사보 2차] 제28회 대비 ${subject} 실전 모의고사 (40문항)\n\n`;
        md += `- **응시 과목**: 2차 ${subject}\n`;
        md += `- **문항 구성**: 총 40문항 (객관식 5지선다 24문항 + 주관식 단답/기입형 16문항)\n`;
        md += `- **시험 시간**: 40분 (문항당 1분 권장)\n`;
        md += `- **출제 기준**: 한국산업인력공단(Q-Net) 5개년 기출 배점 비율 100% 반영\n`;
        md += `- **생성 일자**: ${nowStr}\n\n`;
        md += `---\n\n`;

        md += `## 📄 제1부. [${subject}] 실전 문제지\n\n`;

        // 1. Multiple Choice (1 ~ 24)
        md += `### Ⅰ. 객관식 5지선다형 (제1번 ~ 제24번)\n\n`;
        for (let i = 0; i < 24; i++) {
            const q = set[i];
            if (!q) continue;
            const num = i + 1;
            const formatted = formatQuestionAndPassage(q);
            const hyBadge = (q.isHighYield && q.primaryCoreItem) ? ` ⭐ [핵심 300선 No.${q.primaryCoreItem.id} ${q.primaryCoreItem.tag}]` : '';
            md += `#### 【문 ${num}】 (단원: ${q.chapterName})${hyBadge} ${formatted.title}\n\n`;
            if (formatted.passage) {
                md += `\`\`\`text\n${formatted.passage}\n\`\`\`\n\n`;
            }
            if (q.options && q.options.length > 0) {
                q.options.forEach((opt, oIdx) => {
                    const circleNum = `①②③④⑤`[oIdx] || `${oIdx + 1})`;
                    md += `${circleNum} ${opt}\n`;
                });
                md += `\n`;
            }
        }

        // 2. Subjective (25 ~ 40)
        md += `### Ⅱ. 주관식 단답형 및 괄호 기입형 (제25번 ~ 제40번)\n\n`;
        for (let i = 24; i < 40; i++) {
            const q = set[i];
            if (!q) continue;
            const num = i + 1;
            const formatted = formatQuestionAndPassage(q);
            const hyBadge = (q.isHighYield && q.primaryCoreItem) ? ` ⭐ [핵심 300선 No.${q.primaryCoreItem.id} ${q.primaryCoreItem.tag}]` : '';
            md += `#### 【문 ${num}】 (단원: ${q.chapterName})${hyBadge} ${formatted.title}\n\n`;
            if (formatted.passage) {
                md += `\`\`\`text\n${formatted.passage}\n\`\`\`\n\n`;
            }
            const blanks = sortSubjectiveEntries(Object.entries(q.answers || {})).map(([k]) => k);
            if (blanks.length > 0) {
                md += `> **[기입할 빈칸]**: ${blanks.map(k => `[ ${k} ]`).join(', ')}\n\n`;
            }
        }

        md += `---\n\n`;

        // Part 2. Answer Table
        md += `## 🎯 제2부. 정답 일람표 (Answer Key)\n\n`;
        md += `| 문항 | 정답 | 문항 | 정답 | 문항 | 정답 | 문항 | 정답 |\n`;
        md += `| :---: | :--- | :---: | :--- | :---: | :--- | :---: | :--- |\n`;

        for (let row = 0; row < 10; row++) {
            let rowStr = '|';
            for (let col = 0; col < 4; col++) {
                const idx = col * 10 + row;
                const q = set[idx];
                if (q) {
                    let ansText = '';
                    if (q.type === 'choice') {
                        ansText = `**${q.answer}번**`;
                    } else {
                        ansText = sortSubjectiveEntries(Object.entries(q.answers || {})).map(([k, v]) => `[${k}] ${v}`).join(' ');
                    }
                    rowStr += ` **${idx + 1}** | ${ansText} |`;
                } else {
                    rowStr += ` - | - |`;
                }
            }
            md += `${rowStr}\n`;
        }
        md += `\n---\n\n`;

        // Part 3. Detailed Explanations
        md += `## 💡 제3부. 정답 및 상세 해설 (Explanations & Legal Bases)\n\n`;
        set.forEach((q, idx) => {
            const num = idx + 1;
            let ansText = '';
            if (q.type === 'choice') {
                const corrOpt = (q.options && q.options[Number(q.answer) - 1]) ? ` (${q.options[Number(q.answer) - 1]})` : '';
                ansText = `**${q.answer}번**${corrOpt}`;
            } else {
                ansText = sortSubjectiveEntries(Object.entries(q.answers || {})).map(([k, v]) => `**[${k}]** ${v}`).join(', ');
            }

            const hyBadge = (q.isHighYield && q.primaryCoreItem) ? ` ⭐ [핵심 300선 #${q.primaryCoreItem.id} ${q.primaryCoreItem.tag}]` : '';
            md += `### 【문 ${num}】 ${q.subject} > ${q.chapterName}${hyBadge}\n`;
            md += `- **모범 정답**: ${ansText}\n\n`;
            
            if (q.isHighYield && q.primaryCoreItem) {
                md += `> ⭐ **[초고효율 핵심 300선 테마 No.${q.primaryCoreItem.id} ${q.primaryCoreItem.tag}]**: ${q.primaryCoreItem.topic}\n`;
                md += `> - **출제 포인트**: ${q.primaryCoreItem.note}\n\n`;
            }

            md += `#### [상세 해설 및 근거 조문]\n`;
            md += `${q.explanation ? q.explanation.trim() : '등록된 상세 해설이 없습니다.'}\n\n`;
            if (q.tip) {
                md += `> 💡 **[일타 족집게 팁]**: ${q.tip}\n\n`;
            }
            md += `---\n\n`;
        });

        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `주택관리사2차_${subject}_실전모의고사_40제.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(`📥 [${subject}] 실전 모의고사 40제 MD 다운로드 완료!`);
    }

    function openQuestionPreview(q) {
        if (!elements.modals.questionPreview) return;
        const modal = elements.modals.questionPreview;
        applyCustomEdits(q);

        const subjBadge = document.getElementById('prev-q-subject-badge');
        if (subjBadge) {
            subjBadge.textContent = q.subject;
            subjBadge.className = `subject-badge ${q.subject === '관리실무' ? 'gwanri' : 'law'}`;
        }
        document.getElementById('prev-q-chapter-text').textContent = q.chapterName || '';

        const formatted = formatQuestionAndPassage(q);
        document.getElementById('prev-q-title').innerHTML = formatted.title;

        const passBox = document.getElementById('prev-q-passage');
        if (formatted.passage) {
            passBox.style.display = 'block';
            passBox.innerHTML = formatted.passage;
        } else {
            passBox.style.display = 'none';
        }

        const optContainer = document.getElementById('prev-q-options');
        const subjContainer = document.getElementById('prev-q-subjective');

        if (q.type === 'choice') {
            optContainer.style.display = 'flex';
            subjContainer.style.display = 'none';
            optContainer.innerHTML = '';
            (q.options || []).forEach((opt, idx) => {
                const choiceNum = idx + 1;
                const optDiv = document.createElement('div');
                optDiv.className = `option-item ${choiceNum === Number(q.answer) ? 'correct' : ''}`;
                optDiv.innerHTML = `
                    <span class="opt-num">${choiceNum}</span>
                    <span class="opt-text">${opt}</span>
                `;
                optContainer.appendChild(optDiv);
            });
        } else {
            optContainer.style.display = 'none';
            subjContainer.style.display = 'block';
            subjContainer.innerHTML = '';
            Object.entries(q.answers || {}).forEach(([k, ans]) => {
                const row = document.createElement('div');
                row.className = 'blank-row';
                row.innerHTML = `
                    <span class="blank-label">[${k}]</span>
                    <input type="text" class="blank-input correct" value="${ans}" readonly>
                `;
                subjContainer.appendChild(row);
            });
        }

        // Answer Box
        let ansHtml = '';
        if (q.type === 'choice') {
            const optText = q.options ? q.options[Number(q.answer) - 1] : '';
            ansHtml = `<span class="exp-answer-badge">정답</span> <span class="exp-answer-val">${q.answer}번 ${optText ? `(${optText})` : ''}</span>`;
        } else {
            const ansList = sortSubjectiveEntries(Object.entries(q.answers || {})).map(([k, v]) => `[${k}] <b>${v}</b>`).join(' , ');
            ansHtml = `<span class="exp-answer-badge">정답</span> <span class="exp-answer-val">${ansList}</span>`;
        }
        document.getElementById('prev-q-answer-box').innerHTML = ansHtml;
        document.getElementById('prev-q-explanation').innerHTML = q.explanation || '(등록된 상세 해설이 없습니다)';

        const tipBox = document.getElementById('prev-q-tip-box');
        if (q.tip) {
            tipBox.style.display = 'block';
            tipBox.innerHTML = `💡 <b>[일타 팁]</b> ${q.tip}`;
        } else {
            tipBox.style.display = 'none';
        }

        const btnEditFromPrev = document.getElementById('btn-edit-from-preview');
        if (btnEditFromPrev) {
            btnEditFromPrev.onclick = () => {
                closeModal(modal);
                openPINAuthModal(() => {
                    openEditModalForQuestion(q);
                    showToast('🔓 문제 수정 모달이 열렸습니다.');
                });
            };
        }

        modal.classList.add('active');
    }

    function findQuestionByQKey(qKey) {
        if (state.currentEditingQuestion && state.currentEditingQuestion.qKey === qKey) {
            return state.currentEditingQuestion;
        }
        if (state.questions && state.questions.length > 0) {
            const found = state.questions.find(item => item.qKey === qKey);
            if (found) return found;
        }
        const lawPool = [...ExamEngine.getQuestionPool('관계법규', 'choice'), ...ExamEngine.getQuestionPool('관계법규', 'short')];
        const gwanriPool = [...ExamEngine.getQuestionPool('관리실무', 'choice'), ...ExamEngine.getQuestionPool('관리실무', 'short')];
        return [...lawPool, ...gwanriPool].find(item => item.qKey === qKey) || null;
    }

    function openEditModalForQuestion(q) {
        if (!elements.modals.editQuestion || !q) return;
        state.currentEditingQuestion = q;
        applyCustomEdits(q);

        document.getElementById('edit-q-key').value = q.qKey;
        document.getElementById('edit-q-title').value = q.question || q.title || '';
        document.getElementById('edit-q-passage').value = q.passage || '';

        const optGroup = document.getElementById('edit-options-group');
        if (q.type === 'choice') {
            optGroup.style.display = 'block';
            for (let i = 1; i <= 5; i++) {
                const optInput = document.getElementById(`edit-opt-${i}`);
                if (optInput) {
                    optInput.value = (q.options && q.options[i - 1]) ? q.options[i - 1] : '';
                }
            }
            document.getElementById('edit-q-answer').value = q.answer || '1';
        } else {
            optGroup.style.display = 'none';
            if (q.answers) {
                document.getElementById('edit-q-answer').value = sortSubjectiveEntries(Object.entries(q.answers)).map(([k, v]) => `${k}=${v}`).join(', ');
            } else {
                document.getElementById('edit-q-answer').value = q.answer || '';
            }
        }

        document.getElementById('edit-q-explanation').value = q.explanation || '';
        document.getElementById('edit-q-tip').value = q.tip || '';

        elements.modals.editQuestion.classList.add('active');
    }

    function isPINVerified() {
        if (state.isPINAuthenticated) return true;
        try {
            return sessionStorage.getItem('housing_exam_pin_auth') === 'true';
        } catch (e) {
            return false;
        }
    }

    function setPINVerified() {
        state.isPINAuthenticated = true;
        try {
            sessionStorage.setItem('housing_exam_pin_auth', 'true');
        } catch (e) {}
    }

    function openPINAuthModal(onSuccessCallback = null) {
        if (isPINVerified()) {
            if (typeof onSuccessCallback === 'function') {
                onSuccessCallback();
            }
            return;
        }
        if (!elements.modals.pinAuth) return;
        state.onPINAuthSuccess = onSuccessCallback;
        elements.modals.inputPin.value = '';
        elements.modals.pinAuth.classList.add('active');
        setTimeout(() => elements.modals.inputPin.focus(), 100);
    }

    function verifyPINAuth() {
        if (!elements.modals.pinAuth || !elements.modals.pinAuth.classList.contains('active')) return;

        const pin = (elements.modals.inputPin.value || '').trim();
        if (pin === '2834') {
            setPINVerified();
            const cb = state.onPINAuthSuccess;
            state.onPINAuthSuccess = null;
            elements.modals.inputPin.value = '';
            closeModal(elements.modals.pinAuth);
            if (typeof cb === 'function') {
                cb();
            }
        } else {
            showToast('❌ 잘못된 PIN 번호입니다.');
            elements.modals.inputPin.value = '';
            elements.modals.inputPin.focus();
        }
    }

    // -------------------------------------------------------------
    // Full-Page Manager & Live Editor (Master-Detail Split View)
    // -------------------------------------------------------------
    async function openManagerScreen() {
        state.mode = 'manager';
        state.managerTab = 'wrong';
        state.managerFilter = 'all';
        state.managerSearchQuery = '';
        state.statsMap = await IDBStore.getAllStatsMap();
        state.needsEditMap = await IDBStore.getAllNeedsEditMap();
        state.customEdits = await IDBStore.getAllQuestionEditsMap();

        if (elements.manager.searchInput) {
            elements.manager.searchInput.value = '';
            if (elements.manager.btnClearSearch) elements.manager.btnClearSearch.classList.remove('show');
        }

        document.querySelectorAll('.mgr-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === 'wrong');
        });
        document.querySelectorAll('.mgr-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subject === 'all');
        });

        showScreen('manager');
        renderManagerList();
    }

    function renderManagerList(tabName = state.managerTab, filterSubj = state.managerFilter, query = state.managerSearchQuery) {
        state.managerTab = tabName;
        state.managerFilter = filterSubj;
        state.managerSearchQuery = query !== undefined ? query : (state.managerSearchQuery || '');

        if (!elements.manager.itemsList) return;
        elements.manager.itemsList.innerHTML = '';

        const lawPool = [...ExamEngine.getQuestionPool('관계법규', 'choice'), ...ExamEngine.getQuestionPool('관계법규', 'short')];
        const gwanriPool = [...ExamEngine.getQuestionPool('관리실무', 'choice'), ...ExamEngine.getQuestionPool('관리실무', 'short')];
        const allPool = [...lawPool, ...gwanriPool];

        // Total counts for tabs
        const allWrong = allPool.filter(q => {
            const stat = state.statsMap[q.qKey];
            return stat && stat.wrongCount > 0;
        });
        const allNeedsEditKeys = Object.keys(state.needsEditMap || {});
        const allCustomEditsKeys = Object.keys(state.customEdits || {});

        if (elements.manager.cntWrong) elements.manager.cntWrong.textContent = allWrong.length;
        if (elements.manager.cntNeedsEdit) elements.manager.cntNeedsEdit.textContent = allNeedsEditKeys.length;
        if (elements.manager.cntCustomEdits) elements.manager.cntCustomEdits.textContent = allCustomEditsKeys.length;

        const qLower = (state.managerSearchQuery || '').trim().toLowerCase();

        const matchesSearch = (q) => {
            if (!qLower) return true;
            applyCustomEdits(q);
            const title = (q.question || q.title || '').toLowerCase();
            const chap = (q.chapterName || '').toLowerCase();
            const pass = (q.passage || '').toLowerCase();
            const opts = Array.isArray(q.options) ? q.options.join(' ').toLowerCase() : '';
            const exp = (q.explanation || '').toLowerCase();
            const tip = (q.tip || '').toLowerCase();
            const ans = String(q.answer || '').toLowerCase();
            const ansObj = JSON.stringify(q.answers || {}).toLowerCase();
            const idStr = String(q.id || '');
            return title.includes(qLower) || chap.includes(qLower) || pass.includes(qLower) ||
                   opts.includes(qLower) || exp.includes(qLower) || tip.includes(qLower) ||
                   ans.includes(qLower) || ansObj.includes(qLower) || idStr === qLower;
        };

        let list = [];
        if (tabName === 'wrong') {
            list = allWrong;
            if (filterSubj !== 'all') list = list.filter(q => q.subject === filterSubj);
            if (qLower) list = list.filter(matchesSearch);
            list.sort((a, b) => (state.statsMap[b.qKey]?.weight || 1) - (state.statsMap[a.qKey]?.weight || 1));
        } else if (tabName === 'needs_edit') {
            list = allNeedsEditKeys.map(k => {
                const info = state.needsEditMap[k];
                const pool = info.subject === '관리실무' ? gwanriPool : lawPool;
                const found = pool.find(item => item.qKey === k);
                return found || {
                    qKey: k,
                    subject: info.subject,
                    chapterName: info.chapterName,
                    type: info.type,
                    question: info.question,
                    id: '?'
                };
            });
            if (filterSubj !== 'all') list = list.filter(q => q.subject === filterSubj);
            if (qLower) list = list.filter(matchesSearch);
            list.sort((a, b) => {
                const timeA = new Date(state.needsEditMap[a.qKey]?.flaggedAt || 0).getTime();
                const timeB = new Date(state.needsEditMap[b.qKey]?.flaggedAt || 0).getTime();
                return timeB - timeA;
            });
        } else if (tabName === 'custom_edits') {
            list = allCustomEditsKeys.map(k => {
                const isGwanri = k.startsWith('관리실무');
                const pool = isGwanri ? gwanriPool : lawPool;
                const found = pool.find(item => item.qKey === k);
                const edited = state.customEdits[k] || {};
                return found || {
                    qKey: k,
                    subject: isGwanri ? '관리실무' : '관계법규',
                    chapterName: edited.chapterName || '수정된 문항',
                    type: edited.type || 'choice',
                    question: edited.title || edited.question || '수정된 문항',
                    id: '?'
                };
            });
            if (filterSubj !== 'all') list = list.filter(q => q.subject === filterSubj);
            if (qLower) list = list.filter(matchesSearch);
            list.sort((a, b) => {
                const timeA = new Date(state.customEdits[a.qKey]?.editedAt || 0).getTime();
                const timeB = new Date(state.customEdits[b.qKey]?.editedAt || 0).getTime();
                return timeB - timeA;
            });
        } else if (tabName === 'search_all') {
            if (!qLower) {
                list = [];
            } else {
                list = allPool;
                if (filterSubj !== 'all') list = list.filter(q => q.subject === filterSubj);
                list = list.filter(matchesSearch);
            }
        }

        if (elements.manager.listCount) {
            elements.manager.listCount.textContent = (tabName === 'search_all' && !qLower) ? '0' : list.length;
        }

        if (list.length === 0) {
            let emptyHtml = '';
            if (tabName === 'search_all' && !qLower) {
                emptyHtml = `
                    <div style="text-align: center; padding: 50px 16px; color: #94A3B8;">
                        <i class="fa-solid fa-magnifying-glass" style="font-size: 2.4rem; color: #38BDF8; margin-bottom: 14px; display: block; opacity: 0.9;"></i>
                        <div style="font-size: 1.05rem; font-weight: 800; color: #F1F5F9; margin-bottom: 8px;">필요한 문제를 검색하세요</div>
                        <div style="font-size: 0.82rem; color: #64748B; line-height: 1.6;">지문, 단원명, 법률 조문, 정답 키워드를<br>검색창에 입력하고 <kbd style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); color: #E2E8F0;">Enter</kbd> 또는 <strong>검색</strong>을 누르세요.</div>
                    </div>
                `;
            } else {
                emptyHtml = `
                    <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
                        <i class="fa-solid fa-circle-question" style="font-size: 2.2rem; color: #64748B; margin-bottom: 10px; display: block;"></i>
                        ${qLower ? `"${qLower}" 검색 결과가 없습니다.` : '목록에 표시할 문제가 없습니다.'}
                    </div>
                `;
            }
            elements.manager.itemsList.innerHTML = emptyHtml;
            if (elements.manager.editorEmpty) elements.manager.editorEmpty.style.display = 'flex';
            if (elements.manager.editorForm) elements.manager.editorForm.style.display = 'none';
            return;
        }

        let selectedFound = false;

        list.forEach((q) => {
            applyCustomEdits(q);
            const isSelected = state.currentEditingQuestion && state.currentEditingQuestion.qKey === q.qKey;
            if (isSelected) selectedFound = true;

            const isFlagged = !!(state.needsEditMap && state.needsEditMap[q.qKey]);
            const stat = state.statsMap[q.qKey] || { weight: 1, wrongCount: 0 };
            const cleanChap = (q.chapterName || '').replace(/^CHAPTER\s+\d+\s*/i, '');

            const card = document.createElement('div');
            card.className = `mgr-item-card ${isSelected ? 'active' : ''}`;
            card.dataset.qkey = q.qKey;

            let badgeHtml = '';
            const coreMatch = q.topCoreMatch && q.topCoreMatch.score >= 5 ? q.topCoreMatch.item : null;
            if (coreMatch) {
                const isSuper = (q.topScore >= 6 || (q.topCoreMatch && q.topCoreMatch.score >= 6));
                const badgeClass = isSuper ? 'badge-high-yield mgr-badge badge-tier-super' : 'badge-high-yield mgr-badge';
                const badgeIcon = isSuper ? '🔥 초특급' : '⭐ 핵심';
                badgeHtml += `<span class="${badgeClass}" title="${coreMatch.topic}">${badgeIcon} #${coreMatch.id}</span>`;
            }
            if (isFlagged) {
                badgeHtml += `<span class="mgr-status-flag">🚩 수정요청</span>`;
            }
            if (q.isCustomEdited) {
                badgeHtml += `<span class="mgr-status-edited">✏️ 수정됨</span>`;
            }
            if (stat.wrongCount > 0) {
                let wColor = '#38BDF8';
                if (stat.weight >= 10) wColor = '#EF4444';
                else if (stat.weight >= 6) wColor = '#F97316';
                else if (stat.weight >= 4) wColor = '#F59E0B';
                badgeHtml += `<span style="font-size: 0.72rem; font-weight: 800; color: ${wColor}; background: rgba(255,255,255,0.04); padding: 2px 6px; border-radius: 4px; border: 1px solid ${wColor};">오답 ${stat.wrongCount}회</span>`;
            }

            let quickDelBtnHtml = '';
            if (stat.wrongCount > 0 || tabName === 'wrong') {
                quickDelBtnHtml = `<button type="button" class="mgr-card-quick-del" title="오답 기록 삭제 (가중치 초기화)"><i class="fa-solid fa-trash-can"></i> 삭제</button>`;
            }

            card.innerHTML = `
                <div class="mgr-item-header">
                    <span class="subject-badge ${q.subject === '관리실무' ? 'gwanri' : 'law'}">${q.subject}</span>
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">${cleanChap} [${q.id}번]</span>
                    <span style="font-size: 0.75rem; color: #64748B;">(${q.type === 'choice' ? '객관식' : '주관식'})</span>
                    ${badgeHtml}
                    ${quickDelBtnHtml}
                </div>
                <div class="mgr-item-snippet">${q.question || q.title}</div>
            `;

            const btnQuickDel = card.querySelector('.mgr-card-quick-del');
            if (btnQuickDel) {
                btnQuickDel.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await IDBStore.resetQuestionWeight(q.qKey);
                    state.statsMap[q.qKey] = { weight: 1, wrongCount: 0, tryCount: 0 };
                    
                    if (state.managerTab === 'wrong') {
                        card.classList.add('reset-done');
                        setTimeout(() => {
                            card.remove();
                            const currentCount = parseInt(elements.manager.listCount.textContent || '0', 10);
                            if (currentCount > 0) elements.manager.listCount.textContent = currentCount - 1;
                        }, 300);
                    } else {
                        btnQuickDel.remove();
                        const wBadge = card.querySelector('.mgr-item-header span[style*="border"]');
                        if (wBadge) wBadge.remove();
                    }

                    if (elements.manager.cntWrong) {
                        const cnt = parseInt(elements.manager.cntWrong.textContent || '0', 10);
                        if (cnt > 0) elements.manager.cntWrong.textContent = cnt - 1;
                    }
                    if (state.currentEditingQuestion && state.currentEditingQuestion.qKey === q.qKey) {
                        if (elements.manager.btnDeleteWrong) elements.manager.btnDeleteWrong.style.display = 'none';
                    }
                    showToast(`🗑️ [${cleanChap} ${q.id}번] 오답 기록이 삭제되었습니다.`);
                });
            }

            card.addEventListener('click', () => {
                loadQuestionIntoEditor(q);
            });

            elements.manager.itemsList.appendChild(card);
        });

        // Auto-select first item if no matching active item
        if (!selectedFound && list.length > 0) {
            loadQuestionIntoEditor(list[0]);
        }
    }

    function loadQuestionIntoEditor(q) {
        if (!q) return;
        state.currentEditingQuestion = q;
        applyCustomEdits(q);

        // Highlight active card in left list
        document.querySelectorAll('.mgr-item-card').forEach(card => {
            card.classList.toggle('active', card.dataset.qkey === q.qKey);
        });

        if (elements.manager.editorEmpty) elements.manager.editorEmpty.style.display = 'none';
        if (elements.manager.editorForm) elements.manager.editorForm.style.display = 'flex';

        // Auto-reset editor body scroll so new question starts at top
        if (elements.manager.editorBody) {
            elements.manager.editorBody.scrollTop = 0;
        }

        // Set Meta Header
        if (elements.manager.editQKey) elements.manager.editQKey.value = q.qKey;
        if (elements.manager.metaSubject) {
            elements.manager.metaSubject.textContent = q.subject;
            elements.manager.metaSubject.className = `subject-badge ${q.subject === '관리실무' ? 'gwanri' : 'law'}`;
        }
        if (elements.manager.metaChapter) {
            elements.manager.metaChapter.textContent = (q.chapterName || '').replace(/^CHAPTER\s+\d+\s*/i, '');
        }
        if (elements.manager.metaType) {
            elements.manager.metaType.textContent = q.type === 'choice' ? '객관식 5지선다' : '주관식 단답/기입형';
        }
        if (elements.manager.metaId) {
            let topMatch = q.topCoreMatch;
            let topScore = q.topScore;
            if (topScore === undefined) {
                const matches = ExamEngine.matchQuestionKeywords(q, q.subject);
                topMatch = matches.length > 0 ? matches[0] : null;
                topScore = topMatch ? topMatch.score : 0;
            }

            let scoreHtml = '';
            if (topScore >= 6 && topMatch && topMatch.item) {
                const matchKeywords = (topMatch.matched && topMatch.matched.length > 0) ? `매칭: ${topMatch.matched.join(', ')}` : '';
                const matchTip = [topMatch.item.topic, matchKeywords, topMatch.item.note].filter(Boolean).join(' | ').replace(/"/g, '&quot;');
                scoreHtml = ` <span class="badge-high-yield mgr-badge badge-tier-super" title="${matchTip}">[Score: ${topScore}/7 🔥초특급 #${topMatch.item.id}]</span>`;
            } else if (topScore === 5 && topMatch && topMatch.item) {
                const matchKeywords = (topMatch.matched && topMatch.matched.length > 0) ? `매칭: ${topMatch.matched.join(', ')}` : '';
                const matchTip = [topMatch.item.topic, matchKeywords, topMatch.item.note].filter(Boolean).join(' | ').replace(/"/g, '&quot;');
                scoreHtml = ` <span class="badge-high-yield mgr-badge" title="${matchTip}">[Score: 5/7 ⭐핵심 #${topMatch.item.id}]</span>`;
            } else if (topScore >= 2 && topMatch && topMatch.item) {
                const matchKeywords = (topMatch.matched && topMatch.matched.length > 0) ? `매칭: ${topMatch.matched.join(', ')}` : '';
                const matchTip = [topMatch.item.topic, matchKeywords].filter(Boolean).join(' | ').replace(/"/g, '&quot;');
                scoreHtml = ` <span class="mgr-badge-score-mid" title="${matchTip}">[Score: ${topScore}/7 #${topMatch.item.id}]</span>`;
            } else {
                scoreHtml = ` <span class="mgr-badge-score-low" title="핵심 300선 매칭 키워드 없음">[Score: ${topScore || 0}/7]</span>`;
            }

            // 30시간 망각 주기 임시 감점 쿨다운 표시
            const qStat = state.statsMap[q.qKey];
            const effScore = ExamEngine.getEffectiveScore(q, qStat);
            let cooldownBadge = '';
            if (qStat && qStat.scoreDeductions && qStat.lastCorrectAt) {
                const elapsedHours = (Date.now() - new Date(qStat.lastCorrectAt).getTime()) / (1000 * 60 * 60);
                if (elapsedHours < 30 && effScore < topScore) {
                    const remainHours = Math.ceil(30 - elapsedHours);
                    cooldownBadge = ` <span class="mgr-badge-score-mid" style="background: rgba(245, 158, 11, 0.15); color: #FBBF24; border-color: rgba(245, 158, 11, 0.4);" title="최근 정답으로 인해 30시간 동안 임시 ${effScore}점으로 완화 (약 ${remainHours}시간 후 원래 ${topScore}점으로 복원)">⏳임시 ${effScore}점 (${remainHours}h)</span>`;
                }
            }

            elements.manager.metaId.innerHTML = `[문항 ID: ${q.id}]${scoreHtml}${cooldownBadge}`;
        }

        // Wrong record delete button visibility
        const stat = state.statsMap[q.qKey] || { weight: 1, wrongCount: 0 };
        if (elements.manager.btnDeleteWrong) {
            if (stat.wrongCount > 0) {
                elements.manager.btnDeleteWrong.style.display = 'inline-flex';
                if (elements.manager.wrongBtnText) {
                    elements.manager.wrongBtnText.textContent = `오답 삭제 (${stat.wrongCount}회)`;
                }
            } else {
                elements.manager.btnDeleteWrong.style.display = 'none';
            }
        }

        const isFlagged = !!(state.needsEditMap && state.needsEditMap[q.qKey]);
        if (elements.manager.flagBadge) elements.manager.flagBadge.style.display = isFlagged ? 'inline-block' : 'none';
        if (elements.manager.btnFlagToggle) {
            elements.manager.btnFlagToggle.classList.toggle('active', isFlagged);
            if (elements.manager.flagText) elements.manager.flagText.textContent = isFlagged ? '수정요청됨' : '수정필요';
        }
        if (elements.manager.editedBadge) {
            elements.manager.editedBadge.style.display = q.isCustomEdited ? 'inline-block' : 'none';
        }

        // Fill Form Fields
        if (elements.manager.editTitle) elements.manager.editTitle.value = q.question || q.title || '';
        if (elements.manager.editPassage) elements.manager.editPassage.value = q.passage || '';

        if (q.type === 'choice') {
            if (elements.manager.choiceGroup) elements.manager.choiceGroup.style.display = 'block';
            if (elements.manager.shortGroup) elements.manager.shortGroup.style.display = 'none';

            for (let i = 1; i <= 5; i++) {
                const optInput = document.getElementById(`mgr-opt-${i}`);
                if (optInput) {
                    optInput.value = (q.options && q.options[i - 1]) || '';
                }
            }

            const ansVal = String(q.answer || '1');
            const targetRadio = document.querySelector(`input[name="mgr-choice-ans-radio"][value="${ansVal}"]`);
            if (targetRadio) targetRadio.checked = true;
        } else {
            if (elements.manager.choiceGroup) elements.manager.choiceGroup.style.display = 'none';
            if (elements.manager.shortGroup) elements.manager.shortGroup.style.display = 'block';

            if (elements.manager.editShortAns) {
                if (q.answers) {
                    elements.manager.editShortAns.value = sortSubjectiveEntries(Object.entries(q.answers)).map(([k, v]) => `${k}=${v}`).join(', ');
                } else {
                    elements.manager.editShortAns.value = q.answer || '';
                }
            }
        }

        if (elements.manager.editExp) elements.manager.editExp.value = q.explanation || '';
        if (elements.manager.editTip) elements.manager.editTip.value = q.tip || '';
    }

    function closeModal(modalEl) {
        if (modalEl) {
            modalEl.classList.remove('active');
            if (elements.modals && modalEl === elements.modals.pinAuth) {
                state.onPINAuthSuccess = null;
            }
        }
    }

    function initEventListeners() {
        document.querySelectorAll('.subject-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => setSubject(btn.dataset.subject));
        });

        document.querySelectorAll('.mode-card').forEach(card => {
            card.addEventListener('click', () => {
                const mode = card.dataset.mode;
                if (mode === 'coming_soon') {
                    showToast('✨ 수험생 맞춤형 고급 기능이 곧 추가될 예정입니다!');
                } else if (mode === 'manage_wrong') {
                    openPINAuthModal(() => {
                        openManagerScreen();
                        showToast('🔓 오답 관리 및 전체 문제 에디터가 열렸습니다.');
                    });
                } else if (mode === 'download_md') {
                    openDownloadMdModal();
                } else if (mode === 'part') {
                    openPartSelectModal();
                } else {
                    startMode(mode);
                }
            });
        });

        // 📥 MD 모의고사 다운로드 버튼
        const btnDlLaw = document.getElementById('btn-dl-md-law');
        if (btnDlLaw) btnDlLaw.addEventListener('click', () => generateMockExamMarkdown('관계법규'));

        const btnDlGwanri = document.getElementById('btn-dl-md-gwanri');
        if (btnDlGwanri) btnDlGwanri.addEventListener('click', () => generateMockExamMarkdown('관리실무'));

        // 📋 탭 전환 (오답 리스트 / 수정 필요 문제함 / 전체 검색)
        if (elements.modals.tabWrongList) {
            elements.modals.tabWrongList.addEventListener('click', () => {
                document.querySelectorAll('.btn-main-tab').forEach(b => b.classList.remove('active'));
                elements.modals.tabWrongList.classList.add('active');
                renderWrongManagerList(state.wrongManagerFilter, 'wrong');
            });
        }
        if (elements.modals.tabNeedsEdit) {
            elements.modals.tabNeedsEdit.addEventListener('click', () => {
                document.querySelectorAll('.btn-main-tab').forEach(b => b.classList.remove('active'));
                elements.modals.tabNeedsEdit.classList.add('active');
                renderWrongManagerList(state.wrongManagerFilter, 'needs_edit');
            });
        }
        // -------------------------------------------------------------
        // Full-Page Manager & Live Editor Event Listeners
        // -------------------------------------------------------------
        // 1. Manager Mode Switcher Tabs
        document.querySelectorAll('.mgr-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mgr-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderManagerList(btn.dataset.tab, state.managerFilter);
                if (btn.dataset.tab === 'search_all' && elements.manager.searchInput) {
                    setTimeout(() => elements.manager.searchInput.focus(), 50);
                }
            });
        });

        // 2. Manager Subject Filter Pills
        document.querySelectorAll('.mgr-pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mgr-pill-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderManagerList(state.managerTab, btn.dataset.subject);
            });
        });

        // 3. Manager Search: Enter key, Search button, and Clear button
        if (elements.manager.searchInput) {
            elements.manager.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    state.managerSearchQuery = e.target.value.trim();
                    renderManagerList();
                }
            });

            elements.manager.searchInput.addEventListener('input', (e) => {
                if (elements.manager.btnClearSearch) {
                    elements.manager.btnClearSearch.classList.toggle('show', !!e.target.value);
                }
            });
        }

        if (elements.manager.btnSearch) {
            elements.manager.btnSearch.addEventListener('click', () => {
                if (elements.manager.searchInput) {
                    state.managerSearchQuery = elements.manager.searchInput.value.trim();
                }
                renderManagerList();
            });
        }

        if (elements.manager.btnClearSearch) {
            elements.manager.btnClearSearch.addEventListener('click', () => {
                if (elements.manager.searchInput) {
                    elements.manager.searchInput.value = '';
                }
                state.managerSearchQuery = '';
                elements.manager.btnClearSearch.classList.remove('show');
                renderManagerList();
            });
        }

        // 4. Manager Live Editor Save Functionality
        async function saveManagerEditor() {
            const qKey = elements.manager.editQKey ? elements.manager.editQKey.value : '';
            if (!qKey) return;
            const q = findQuestionByQKey(qKey);
            if (!q) {
                showToast('❌ 대상 문제를 찾을 수 없습니다.');
                return;
            }

            const title = (elements.manager.editTitle.value || '').trim();
            const passage = (elements.manager.editPassage.value || '').trim();
            const exp = (elements.manager.editExp.value || '').trim();
            const tip = (elements.manager.editTip.value || '').trim();

            const editData = {
                question: title,
                passage: passage,
                explanation: exp,
                tip: tip
            };

            if (q.type === 'choice') {
                const opts = [];
                for (let i = 1; i <= 5; i++) {
                    const optInput = document.getElementById(`mgr-opt-${i}`);
                    opts.push(optInput ? optInput.value.trim() : '');
                }
                editData.options = opts;

                const selectedRadio = document.querySelector('input[name="mgr-choice-ans-radio"]:checked');
                editData.answer = selectedRadio ? selectedRadio.value : (q.answer || '1');
            } else {
                const rawShort = (elements.manager.editShortAns.value || '').trim();
                if (rawShort.includes('=')) {
                    const pairs = rawShort.split(',').map(s => s.trim()).filter(Boolean);
                    const answersObj = {};
                    pairs.forEach(p => {
                        const [k, ...vParts] = p.split('=');
                        if (k) answersObj[k.trim()] = vParts.join('=').trim();
                    });
                    const sortedAnswers = getSortedAnswersObject(answersObj);
                    editData.answers = sortedAnswers;
                    editData.answer = Object.values(sortedAnswers).join(', ');
                } else {
                    editData.answer = rawShort;
                }
            }

            const savedItem = await IDBStore.saveQuestionEdit(qKey, editData);
            if (!state.customEdits) state.customEdits = {};
            state.customEdits[qKey] = savedItem || editData;
            applyCustomEdits(q);

            // Update badges and left list card
            if (elements.manager.editedBadge) elements.manager.editedBadge.style.display = 'inline-block';
            const activeCard = document.querySelector(`.mgr-item-card[data-qkey="${qKey}"]`);
            if (activeCard) {
                const snippet = activeCard.querySelector('.mgr-item-snippet');
                if (snippet) snippet.textContent = q.question || q.title;
                const header = activeCard.querySelector('.mgr-item-header');
                if (header && !header.querySelector('.mgr-status-edited')) {
                    const badge = document.createElement('span');
                    badge.className = 'mgr-status-edited';
                    badge.textContent = '✏️ 수정됨';
                    header.appendChild(badge);
                }
            }

            showToast(`💾 [${q.id}번 문항] 수정사항이 성공적으로 저장되었습니다!`);
        }

        if (elements.manager.editorForm) {
            elements.manager.editorForm.addEventListener('submit', (e) => {
                e.preventDefault();
                saveManagerEditor();
            });
        }
        if (elements.manager.btnSaveTop) {
            elements.manager.btnSaveTop.addEventListener('click', (e) => {
                e.preventDefault();
                saveManagerEditor();
            });
        }
        if (elements.manager.btnSaveBottom) {
            elements.manager.btnSaveBottom.addEventListener('click', (e) => {
                e.preventDefault();
                saveManagerEditor();
            });
        }

        // 5. Manager Flag Toggle
        if (elements.manager.btnFlagToggle) {
            elements.manager.btnFlagToggle.addEventListener('click', async () => {
                const qKey = elements.manager.editQKey ? elements.manager.editQKey.value : '';
                if (!qKey) return;
                const q = findQuestionByQKey(qKey);
                if (!q) return;

                const isFlagged = !!(state.needsEditMap && state.needsEditMap[qKey]);
                if (isFlagged) {
                    await IDBStore.deleteNeedsEdit(qKey);
                    delete state.needsEditMap[qKey];
                    elements.manager.btnFlagToggle.classList.remove('active');
                    if (elements.manager.flagText) elements.manager.flagText.textContent = '수정필요';
                    if (elements.manager.flagBadge) elements.manager.flagBadge.style.display = 'none';
                    showToast('🚩 [수정 필요] 목록에서 제외되었습니다.');
                } else {
                    await IDBStore.saveNeedsEdit(qKey, q);
                    state.needsEditMap[qKey] = {
                        qKey: qKey,
                        subject: q.subject,
                        chapterName: q.chapterName,
                        type: q.type,
                        question: q.question || q.title
                    };
                    elements.manager.btnFlagToggle.classList.add('active');
                    if (elements.manager.flagText) elements.manager.flagText.textContent = '수정요청됨';
                    if (elements.manager.flagBadge) elements.manager.flagBadge.style.display = 'inline-block';
                    showToast('🚩 [수정 필요] 목록에 등록되었습니다.');
                }

                // Update left list card & counts
                const allNeedsEditKeys = Object.keys(state.needsEditMap || {});
                if (elements.manager.cntNeedsEdit) elements.manager.cntNeedsEdit.textContent = allNeedsEditKeys.length;
                const activeCard = document.querySelector(`.mgr-item-card[data-qkey="${qKey}"]`);
                if (activeCard) {
                    const flagTag = activeCard.querySelector('.mgr-status-flag');
                    if (!isFlagged && !flagTag) {
                        const header = activeCard.querySelector('.mgr-item-header');
                        if (header) {
                            const tag = document.createElement('span');
                            tag.className = 'mgr-status-flag';
                            tag.textContent = '🚩 수정요청';
                            header.appendChild(tag);
                        }
                    } else if (isFlagged && flagTag) {
                        flagTag.remove();
                    }
                }
            });
        }

        // 5-B. Manager Delete Wrong Record
        if (elements.manager.btnDeleteWrong) {
            elements.manager.btnDeleteWrong.addEventListener('click', async () => {
                const qKey = elements.manager.editQKey ? elements.manager.editQKey.value : '';
                if (!qKey) return;
                const q = findQuestionByQKey(qKey);
                if (!q) return;

                if (!confirm(`[문항 ${q.id}] 오답 기록과 가중치를 초기화하시겠습니까?`)) return;

                await IDBStore.resetQuestionWeight(qKey);
                state.statsMap[qKey] = { weight: 1, wrongCount: 0, tryCount: 0 };

                elements.manager.btnDeleteWrong.style.display = 'none';

                if (elements.manager.cntWrong) {
                    const cnt = parseInt(elements.manager.cntWrong.textContent || '0', 10);
                    if (cnt > 0) elements.manager.cntWrong.textContent = cnt - 1;
                }

                const activeCard = document.querySelector(`.mgr-item-card[data-qkey="${qKey}"]`);
                if (activeCard) {
                    if (state.managerTab === 'wrong') {
                        activeCard.classList.add('reset-done');
                        setTimeout(() => {
                            activeCard.remove();
                            const currentCount = parseInt(elements.manager.listCount.textContent || '0', 10);
                            if (currentCount > 0) elements.manager.listCount.textContent = currentCount - 1;
                        }, 300);
                    } else {
                        const quickDel = activeCard.querySelector('.mgr-card-quick-del');
                        if (quickDel) quickDel.remove();
                        const wBadge = activeCard.querySelector('.mgr-item-header span[style*="border"]');
                        if (wBadge) wBadge.remove();
                    }
                }

                showToast(`🗑️ [${q.id}번 문항] 오답 기록이 삭제되었습니다.`);
            });
        }

        // 6. Manager Reset to Original
        if (elements.manager.btnResetOrig) {
            elements.manager.btnResetOrig.addEventListener('click', async () => {
                const qKey = elements.manager.editQKey ? elements.manager.editQKey.value : '';
                if (!qKey) return;
                const q = findQuestionByQKey(qKey);
                if (!q) return;

                if (!confirm(`[문항 ${q.id}] 수정 내역을 삭제하고 원본 기출 데이터로 복구하시겠습니까?`)) return;

                await IDBStore.deleteQuestionEdit(qKey);
                if (state.customEdits) delete state.customEdits[qKey];

                const pool = ExamEngine.getQuestionPool(q.subject, q.type);
                const raw = pool.find(item => item.qKey === qKey);
                if (raw) {
                    q.question = raw.question || raw.title;
                    q.title = raw.title;
                    q.passage = raw.passage || '';
                    if (raw.options) q.options = [...raw.options];
                    q.answer = raw.answer;
                    if (raw.answers) q.answers = { ...raw.answers };
                    q.explanation = raw.explanation;
                    q.tip = raw.tip;
                    delete q.isCustomEdited;
                }

                loadQuestionIntoEditor(q);

                const activeCard = document.querySelector(`.mgr-item-card[data-qkey="${qKey}"]`);
                if (activeCard) {
                    const editedBadge = activeCard.querySelector('.mgr-status-edited');
                    if (editedBadge) editedBadge.remove();
                    const snippet = activeCard.querySelector('.mgr-item-snippet');
                    if (snippet) snippet.textContent = q.question || q.title;
                }

                showToast(`🔄 [${q.id}번 문항] 원본 기출 문제로 복구되었습니다.`);
            });
        }

        // 7-1. Manager Delete / Exclude Question from All Exams
        if (elements.manager.btnDeleteQ) {
            elements.manager.btnDeleteQ.addEventListener('click', async () => {
                const qKey = elements.manager.editQKey ? elements.manager.editQKey.value : '';
                const q = findQuestionByQKey(qKey);
                if (!q) return;

                if (confirm(`[${q.subject} - 문항 ID: ${q.id}]\n정말로 이 문제를 모든 모의고사 및 문제풀이에서 제외(삭제)하시겠습니까?\n\n* 삭제 후에도 언제든 백업 복원 등으로 다시 되살릴 수 있습니다.`)) {
                    await IDBStore.saveDeletedKey(qKey);
                    state.deletedKeysSet = await IDBStore.getDeletedKeysSet();
                    ExamEngine._poolCache = {};

                    showToast(`🗑️ [${q.id}번 문항] 모든 모의고사 출제에서 제외되었습니다.`);
                    
                    if (state.currentScreen === 'manager') {
                        renderManagerList();
                    }
                }
            });
        }

        // 7. Manager AI Verification Prompt Copy
        if (elements.manager.btnCopyAI) {
            elements.manager.btnCopyAI.addEventListener('click', () => {
                const qKey = elements.manager.editQKey ? elements.manager.editQKey.value : '';
                const q = findQuestionByQKey(qKey);
                if (!q) return;

                let prompt = `[주택관리사 2차 ${q.subject} 문제 검증 요청]\n`;
                prompt += `- 단원: ${q.chapterName} (문항 ID: ${q.id})\n`;
                prompt += `- 유형: ${q.type === 'choice' ? '객관식 5지선다' : '주관식 단답/기입형'}\n\n`;
                prompt += `[문제]\n${elements.manager.editTitle.value}\n\n`;
                if (elements.manager.editPassage.value) {
                    prompt += `[지문/보기 박스]\n${elements.manager.editPassage.value}\n\n`;
                }
                if (q.type === 'choice') {
                    prompt += `[선택 보기]\n`;
                    for (let i = 1; i <= 5; i++) {
                        const optVal = (document.getElementById(`mgr-opt-${i}`) || {}).value || '';
                        prompt += `${['①','②','③','④','⑤'][i-1]} ${optVal}\n`;
                    }
                    const selectedRadio = document.querySelector('input[name="mgr-choice-ans-radio"]:checked');
                    prompt += `\n[정답] ${selectedRadio ? selectedRadio.value : q.answer}번\n`;
                } else {
                    prompt += `[정답] ${elements.manager.editShortAns.value}\n`;
                }
                prompt += `\n[상세 해설]\n${elements.manager.editExp.value}\n`;
                if (elements.manager.editTip.value) {
                    prompt += `\n[핵심 암기 팁]\n${elements.manager.editTip.value}\n`;
                }
                prompt += `\n---\n🤖 요청사항: 위 문제의 정답과 해설, 최신 개정 법령 반영 여부, 정확한 명칭, 수치 등을 반드시 웹검색을 통해 면밀히 검증하고 보완 사항을 알려주세요.`;

                navigator.clipboard.writeText(prompt).then(() => {
                    showToast('📋 AI 검증용 문제·정답·해설 프롬프트가 복사되었습니다!');
                }).catch(() => {
                    showToast('❌ 클립보드 복사 실패');
                });
            });
        }

        // 8. Manager Backup & Restore Handlers
        if (elements.manager.btnExportBackup) {
            elements.manager.btnExportBackup.addEventListener('click', async () => {
                try {
                    const backup = await IDBStore.exportBackupJSON();
                    const jsonStr = JSON.stringify(backup, null, 2);
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const dateStr = new Date().toISOString().slice(0, 10);
                    a.href = url;
                    a.download = `주관사2차_문제지옥_학습데이터백업_${dateStr}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast('📥 학습 데이터 백업 파일(.json)이 저장되었습니다.');
                } catch (e) {
                    alert('백업 생성 중 오류가 발생했습니다: ' + e.message);
                }
            });
        }

        if (elements.manager.btnImportBackup && elements.manager.fileImportBackup) {
            elements.manager.btnImportBackup.addEventListener('click', () => {
                elements.manager.fileImportBackup.value = '';
                elements.manager.fileImportBackup.click();
            });

            elements.manager.fileImportBackup.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                if (!confirm(`[${file.name}] 백업 파일의 수정된 문제와 학습 기록을 복원하시겠습니까?`)) {
                    return;
                }

                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    await IDBStore.importBackupJSON(data);
                    
                    // Reload state
                    state.customEdits = await IDBStore.getAllQuestionEditsMap();
                    state.needsEditMap = await IDBStore.getAllNeedsEditMap();
                    state.statsMap = await IDBStore.getAllStatsMap();

                    showToast('✅ 백업 데이터가 성공적으로 복원되었습니다.');
                    if (state.currentScreen === 'manager') {
                        renderManagerList();
                    }
                } catch (err) {
                    alert('백업 파일 복원 실패: ' + err.message);
                }
            });
        }

        // PIN Auth Form Listeners
        if (elements.modals.formPin) {
            elements.modals.formPin.addEventListener('submit', (e) => {
                e.preventDefault();
                verifyPINAuth();
            });
        }

        const btnSubmitPin = document.getElementById('btn-submit-pin');
        if (btnSubmitPin) {
            btnSubmitPin.addEventListener('click', (e) => {
                e.preventDefault();
                verifyPINAuth();
            });
        }

        if (elements.modals.inputPin) {
            elements.modals.inputPin.addEventListener('input', (e) => {
                if (e.target.value.length === 4) {
                    verifyPINAuth();
                }
            });
        }

        elements.quiz.btnNext.addEventListener('click', nextQuestion);
        elements.quiz.btnPrev.addEventListener('click', prevQuestion);
        elements.quiz.btnToggleExp.addEventListener('click', async () => {
            const idx = state.currentIndex;
            if (state.results[idx] === undefined) {
                await gradeCurrentQuestion();
            } else {
                toggleExplanation();
            }
        });
        if (elements.quiz.btnRetry) {
            elements.quiz.btnRetry.addEventListener('click', retryCurrentQuestion);
        }

        elements.header.btnHome.addEventListener('click', () => {
            if (state.mode === 'home') return;
            if (state.mode === 'manager' || (elements.screens.manager && elements.screens.manager.classList.contains('active'))) {
                showScreen('home');
                return;
            }
            if (state.mode === 'part') {
                PartProgressManager.saveProgress(state.subject, state.currentPartPattern, state);
                if (confirm(`💾 [${state.currentPartPattern}]\n현재 ${state.currentIndex + 1}번 문항까지의 풀이 진행 상황이 자동 저장되었습니다.\n\n메인 화면으로 나가시겠습니까? (언제든 이어서 풀 수 있습니다)`)) {
                    clearInterval(state.timerInterval);
                    showScreen('home');
                    showToast(`💾 [${state.currentPartPattern}] 진행 상황이 안전하게 저장되었습니다.`);
                }
                return;
            }
            if (confirm('학습을 종료하고 메인 화면으로 이동하시겠습니까?')) {
                clearInterval(state.timerInterval);
                showScreen('home');
            }
        });

        elements.header.btnOMR.addEventListener('click', openOMR);
        if (elements.header.btnManager) {
            elements.header.btnManager.addEventListener('click', () => {
                openPINAuthModal(() => {
                    openManagerScreen();
                    showToast('🔓 오답 관리 및 전체 문제 에디터가 열렸습니다.');
                });
            });
        }
        if (elements.quiz.qNum) {
            elements.quiz.qNum.addEventListener('click', openOMR);
            elements.quiz.qNum.title = '클릭하여 다른 문항 번호로 즉시 이동 (OMR)';
        }
        elements.header.btnPen.addEventListener('click', () => {
            const isQuizScreen = elements.screens.quiz && elements.screens.quiz.classList.contains('active');
            if (!isQuizScreen) {
                showToast('✍️ 문제 풀이 화면에서 필기 모드를 사용할 수 있습니다.');
                return;
            }
            if (state.tabletCanvas) {
                const active = state.tabletCanvas.togglePen();
                elements.header.btnPen.classList.toggle('active', active);
                if (active) {
                    showToast('✍️ 필기 모드 ON (문제 위에 필기 가능)');
                } else {
                    showToast('필기 모드 OFF');
                }
            }
        });

        elements.header.btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });

        // 🚩 수정 필요 플래그 토글 버튼 핸들러
        const btnFlagNeedsEdit = document.getElementById('btn-flag-needs-edit');
        if (btnFlagNeedsEdit) {
            btnFlagNeedsEdit.addEventListener('click', async () => {
                const q = state.questions[state.currentIndex];
                if (!q) return;

                const isFlagged = !!(state.needsEditMap && state.needsEditMap[q.qKey]);
                if (isFlagged) {
                    await IDBStore.deleteNeedsEdit(q.qKey);
                    delete state.needsEditMap[q.qKey];
                    btnFlagNeedsEdit.classList.remove('active');
                    btnFlagNeedsEdit.innerHTML = '<i class="fa-solid fa-flag"></i> 수정필요';
                    showToast(`🏳️ [${q.id}번 문항] 수정 필요 플래그가 해제되었습니다.`);
                } else {
                    await IDBStore.saveNeedsEdit(q.qKey, q);
                    state.needsEditMap[q.qKey] = {
                        qKey: q.qKey,
                        subject: q.subject,
                        chapterName: q.chapterName,
                        type: q.type,
                        question: q.question || q.title,
                        flaggedAt: new Date().toISOString()
                    };
                    btnFlagNeedsEdit.classList.add('active');
                    btnFlagNeedsEdit.innerHTML = '<i class="fa-solid fa-flag text-amber-400"></i> 수정요청됨';
                    showToast(`🚩 [${q.id}번 문항] 수정 필요 목록에 등록되었습니다. (에디터 2834에서 확인 가능)`);
                }
            });
        }

        // 📋 AI 검증용 문제·정답·해설 복사 버튼
        const btnCopyQAI = document.getElementById('btn-copy-question-ai');
        if (btnCopyQAI) {
            btnCopyQAI.addEventListener('click', () => {
                const q = state.questions[state.currentIndex];
                if (!q) return;
                const formatted = formatQuestionAndPassage(q);

                let optText = '';
                if (q.type === 'choice' && Array.isArray(q.options)) {
                    optText = q.options.map((opt, i) => `  ${i + 1}번: ${opt}`).join('\n');
                }

                let ansText = '';
                if (q.type === 'choice') {
                    const corrOpt = (q.options && q.options[Number(q.answer) - 1]) ? ` (${q.options[Number(q.answer) - 1]})` : '';
                    ansText = `${q.answer}번${corrOpt}`;
                } else {
                    ansText = sortSubjectiveEntries(Object.entries(q.answers || {})).map(([k, v]) => `[${k}] ${v}`).join(', ');
                }

                const fullPrompt = `[주택관리사보 2차 기출·모의 문제 검증 요청]
- 과목: ${q.subject}
- 단원: ${q.chapterName}
- 문제 유형: ${q.type === 'choice' ? '객관식 5지선다' : '주관식 단답/빈칸형'}

[문제]
${formatted.title}
${formatted.passage ? `\n[지문/보기 박스]\n${formatted.passage}\n` : ''}
${optText ? `[선택 보기]\n${optText}\n` : ''}
[정답]
${ansText}

[해설]
${q.explanation || '(등록된 해설 없음)'}
${q.tip ? `\n[일타 팁]\n${q.tip}` : ''}

---
🤖 요청사항: 위 문제의 정답과 해설, 최신 개정 법령 반영 여부, 정확한 명칭, 수치 등을 반드시 웹검색을 통해 면밀히 검증하고 보완 사항을 알려주세요.`;

                navigator.clipboard.writeText(fullPrompt).then(() => {
                    showToast('📋 문제·정답·해설이 복사되었습니다! (Gemini/AI 검증용)');
                }).catch(() => {
                    alert('클립보드 권한을 확인해주세요.');
                });
            });
        }

        // ✏️ 문제·정답·해설 직접 수정 모달 핸들러
        const btnEditQ = document.getElementById('btn-edit-question');
        const modalEditQ = document.getElementById('modal-edit-question');
        const formEditQ = document.getElementById('form-edit-question');
        const btnResetOriginalQ = document.getElementById('btn-reset-original-q');

        if (btnEditQ) {
            btnEditQ.addEventListener('click', () => {
                const q = state.questions[state.currentIndex];
                if (!q) return;
                openPINAuthModal(() => {
                    openEditModalForQuestion(q);
                    showToast('🔓 문제 수정 모달이 열렸습니다.');
                });
            });
        }

        if (formEditQ) {
            formEditQ.addEventListener('submit', async (e) => {
                e.preventDefault();
                const qKey = document.getElementById('edit-q-key').value;
                const q = findQuestionByQKey(qKey);
                if (!q) {
                    showToast('❌ 대상 문제를 찾을 수 없습니다.');
                    return;
                }

                const newTitle = document.getElementById('edit-q-title').value.trim();
                const newPassage = document.getElementById('edit-q-passage').value.trim();
                const newAns = document.getElementById('edit-q-answer').value.trim();
                const newExp = document.getElementById('edit-q-explanation').value.trim();
                const newTip = document.getElementById('edit-q-tip').value.trim();

                const editData = {
                    question: newTitle,
                    passage: newPassage,
                    explanation: newExp,
                    tip: newTip
                };

                if (q.type === 'choice') {
                    const newOptions = [];
                    for (let i = 1; i <= 5; i++) {
                        const optVal = document.getElementById(`edit-opt-${i}`).value.trim();
                        newOptions.push(optVal);
                    }
                    editData.options = newOptions;
                    editData.answer = newAns;
                } else {
                    const newAnswers = {};
                    newAns.split(',').forEach(pair => {
                        const [k, ...vParts] = pair.split('=').map(s => s.trim());
                        if (k && vParts.length) newAnswers[k] = vParts.join('=').trim();
                    });
                    const sortedAnswers = getSortedAnswersObject(newAnswers);
                    editData.answers = sortedAnswers;
                    editData.answer = Object.values(sortedAnswers).join(', ');
                }

                const savedItem = await IDBStore.saveQuestionEdit(qKey, editData);
                if (!state.customEdits) state.customEdits = {};
                state.customEdits[qKey] = savedItem || editData;
                applyCustomEdits(q);

                // If currently taking a quiz on this question, update current view
                if (elements.screens.quiz && elements.screens.quiz.classList.contains('active')) {
                    if (state.questions[state.currentIndex] && state.questions[state.currentIndex].qKey === qKey) {
                        renderQuestion(state.currentIndex);
                    }
                }

                // If wrong & needs-edit manager is open, re-render list so changes appear immediately
                if (elements.modals.wrongManager && elements.modals.wrongManager.classList.contains('active')) {
                    renderWrongManagerList(state.wrongManagerFilter, state.wrongManagerTab);
                }

                closeModal(modalEditQ);
                showToast('💾 문제 수정사항이 저장되었습니다!');
            });
        }

        if (btnResetOriginalQ) {
            btnResetOriginalQ.addEventListener('click', async () => {
                const qKey = document.getElementById('edit-q-key').value;
                const q = findQuestionByQKey(qKey);
                if (!q) return;

                if (confirm('이 문제의 수정 내역을 삭제하고 원본 기출 데이터로 복구하시겠습니까?')) {
                    await IDBStore.deleteQuestionEdit(qKey);
                    delete state.customEdits[qKey];

                    // Find original from dataset
                    const rawPool = ExamEngine.getQuestionPool(q.subject, q.type);
                    const original = rawPool.find(item => item.qKey === qKey);
                    if (original) {
                        q.question = original.question;
                        q.passage = original.passage;
                        q.options = original.options ? [...original.options] : undefined;
                        q.answer = original.answer;
                        q.answers = original.answers ? { ...original.answers } : undefined;
                        q.explanation = original.explanation;
                        q.tip = original.tip;
                        q.isCustomEdited = false;
                    }

                    if (elements.screens.quiz && elements.screens.quiz.classList.contains('active')) {
                        if (state.questions[state.currentIndex] && state.questions[state.currentIndex].qKey === qKey) {
                            renderQuestion(state.currentIndex);
                        }
                    }

                    if (elements.modals.wrongManager && elements.modals.wrongManager.classList.contains('active')) {
                        renderWrongManagerList(state.wrongManagerFilter, state.wrongManagerTab);
                    }

                    closeModal(modalEditQ);
                    showToast('🔄 원본 기출 문제로 복구되었습니다.');
                }
            });
        }

        elements.result.btnHomeFromRes.addEventListener('click', () => showScreen('home'));
        elements.result.btnRetry.addEventListener('click', () => startMode(state.mode, state.currentPartPattern));
        elements.result.btnCopyAI.addEventListener('click', () => {
            const mdText = OMRSheet.buildAIPrompt({
                subject: state.subject,
                score: (elements.result.scoreText.textContent || '0').replace('점', ''),
                correctCount: elements.result.correctCount.textContent,
                wrongCount: elements.result.wrongCount.textContent,
                questions: state.questions,
                userAnswers: state.userAnswers,
                results: state.firstAttemptResults.length > 0 ? state.firstAttemptResults : state.results
            });

            navigator.clipboard.writeText(mdText).then(() => {
                showToast('📋 AI 일타 과외 요청서가 복사되었습니다!');
            }).catch(() => {
                alert('클립보드 복사 권한을 확인해주세요.');
            });
        });

        // Cloud Sync Header Button Trigger
        if (elements.header.btnCloudSync) {
            elements.header.btnCloudSync.addEventListener('click', async () => {
                if (!window.CloudSync || !window.CloudSync.isInitialized) {
                    showToast('⚡ 오프라인 로컬 저장 모드');
                    return;
                }
                showToast('🔄 클라우드 데이터 실시간 동기화 중...');
                const ok = await window.CloudSync.pullFromCloud();
                if (ok) {
                    await window.CloudSync.pushToCloud();
                    state.statsMap = await IDBStore.getAllStatsMap();
                    state.customEdits = await IDBStore.getAllQuestionEditsMap();
                    state.needsEditMap = await IDBStore.getAllNeedsEditMap();
                    state.deletedKeysSet = await IDBStore.getDeletedKeysSet();
                    ExamEngine._poolCache = {};
                    if (state.questions && state.questions.length > 0) {
                        state.questions.forEach(applyCustomEdits);
                    }
                    if (state.currentScreen === 'quiz') {
                        renderQuestion(state.currentIndex);
                    }
                    if (state.currentScreen === 'manager') {
                        renderManagerList();
                    }
                    showToast(`☁️ 클라우드 동기화 완료! (수정 문제: ${Object.keys(state.customEdits || {}).length}개)`);
                } else {
                    showToast('⚡ 오프라인 상태 (로컬 저장 유지)');
                }
            });
        }

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                closeModal(modal);
            });
        });

        window.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            if (elements.screens.quiz && elements.screens.quiz.classList.contains('active')) {
                if (e.key >= '1' && e.key <= '5') {
                    const q = state.questions[state.currentIndex];
                    if (q && q.type === 'choice') {
                        selectChoice(parseInt(e.key, 10));
                    }
                } else if (e.key === 'ArrowRight') {
                    nextQuestion();
                } else if (e.key === 'ArrowLeft') {
                    prevQuestion();
                }
            }
        });

        // Handle Mobile/Tablet Virtual Keyboard & S-Pen IME Avoidance (prevents home button overlap)
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                const controls = document.getElementById('quiz-bottom-controls');
                if (!controls) return;
                const isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.78;
                if (isKeyboardOpen) {
                    controls.style.opacity = '0';
                    controls.style.pointerEvents = 'none';
                    controls.style.transform = 'translateY(100%)';
                } else {
                    controls.style.opacity = '1';
                    controls.style.pointerEvents = 'auto';
                    controls.style.transform = 'translateY(0)';
                }
            });
        }

        // Auto-save part progress on window unload / refresh
        window.addEventListener('beforeunload', () => {
            if (state.mode === 'part' && state.currentPartPattern) {
                PartProgressManager.saveProgress(state.subject, state.currentPartPattern, state);
            }
        });
    }

    // App Initialization on DOM Load
    window.addEventListener('DOMContentLoaded', async () => {
        initDOMElements();
        await IDBStore.init();
        
        // Purge old persistent drawing strokes from IndexedDB to ensure 0 MB storage overhead
        try {
            const db = await IDBStore.openDB();
            if (db && db.objectStoreNames.contains('drawing_strokes')) {
                const tx = db.transaction('drawing_strokes', 'readwrite');
                tx.objectStore('drawing_strokes').clear();
            }
        } catch (e) {}

        state.statsMap = await IDBStore.getAllStatsMap();
        state.customEdits = await IDBStore.getAllQuestionEditsMap();
        state.needsEditMap = await IDBStore.getAllNeedsEditMap();
        state.deletedKeysSet = await IDBStore.getDeletedKeysSet();

        const canvasEl = document.getElementById('drawing-canvas');
        const toolbarEl = document.getElementById('stylus-toolbar');
        if (canvasEl) {
            state.tabletCanvas = new TabletCanvas(canvasEl, toolbarEl);
        }

        initEventListeners();
        setSubject(state.subject);
        showScreen('home');

        // Initialize Firebase Realtime Cloud Sync
        if (window.CloudSync) {
            window.CloudSync.init();
            window.CloudSync.onStatusChange(async (status, lastTime) => {
                if (status === 'synced') {
                    state.statsMap = await IDBStore.getAllStatsMap();
                    state.customEdits = await IDBStore.getAllQuestionEditsMap();
                    state.needsEditMap = await IDBStore.getAllNeedsEditMap();
                    state.deletedKeysSet = await IDBStore.getDeletedKeysSet();
                    ExamEngine._poolCache = {};
                    if (state.questions && state.questions.length > 0) {
                        state.questions.forEach(applyCustomEdits);
                    }
                    if (state.currentScreen === 'quiz') {
                        renderQuestion(state.currentIndex);
                    }
                    if (state.currentScreen === 'manager') {
                        renderManagerList();
                    }
                }
                if (elements.header && elements.header.btnCloudSync) {
                    const icon = elements.header.btnCloudSync.querySelector('i');
                    if (icon) {
                        if (status === 'synced') {
                            icon.className = 'fa-solid fa-cloud text-emerald-400';
                            elements.header.btnCloudSync.title = `클라우드 실시간 동기화 완료 (${lastTime ? lastTime.toLocaleTimeString() : '최신'}) - 클릭 시 즉시 동기화`;
                        } else if (status === 'syncing') {
                            icon.className = 'fa-solid fa-arrows-rotate fa-spin text-amber-400';
                            elements.header.btnCloudSync.title = '클라우드 데이터 동기화 중...';
                        } else if (status === 'error') {
                            icon.className = 'fa-solid fa-cloud-bolt text-rose-400';
                            elements.header.btnCloudSync.title = '클라우드 연결 대기 (로컬 저장 모드)';
                        } else {
                            icon.className = 'fa-solid fa-cloud text-slate-400';
                            elements.header.btnCloudSync.title = '오프라인 로컬 저장 모드';
                        }
                    }
                }
            });
        }
    });

})();
