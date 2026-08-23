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
            } else {
                existing.correctCount = (existing.correctCount || 0) + 1;
                if (existing.weight === 10) existing.weight = 6;
                else if (existing.weight === 6) existing.weight = 4;
                else if (existing.weight === 4) existing.weight = 2;
                else existing.weight = 1;
            }

            if (db) {
                try {
                    const tx = db.transaction('question_stats', 'readwrite');
                    tx.objectStore('question_stats').put(existing);
                } catch (e) {}
            }
            return existing;
        },

        async overrideToCorrect(qKey) {
            const stat = await this.getQuestionStat(qKey);
            if (!stat) return null;
            stat.wrongCount = Math.max(0, (stat.wrongCount || 1) - 1);
            if (stat.weight === 10) stat.weight = 6;
            else if (stat.weight === 6) stat.weight = 4;
            else if (stat.weight === 4) stat.weight = 2;
            else stat.weight = 1;
            stat.lastResult = true;

            const db = await openDB();
            if (db) {
                try {
                    const tx = db.transaction('question_stats', 'readwrite');
                    tx.objectStore('question_stats').put(stat);
                } catch (e) {}
            }
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
        }
    };

    // -------------------------------------------------------------
    // 2. Grader & Text Normalizer
    // -------------------------------------------------------------
    const Grader = {
        normalizeText(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/[\s\t\r\n]+/g, '')
                .replace(/[.,·•ㆍ'"`~!?@#$%^&*()_+=\-\[\]{}|\\:;<>/\\]/g, '')
                .replace(/^[은는이가을를의에로으로]+|[은는이가을를의에로으로]+$/g, '')
                .toLowerCase()
                .trim();
        },

        isMatch(userAnswer, targetAnswer) {
            const normUser = this.normalizeText(userAnswer);
            if (!normUser) return false;

            const variants = String(targetAnswer).split(/[\/,|]/).map(v => this.normalizeText(v)).filter(Boolean);
            if (variants.length === 0) {
                variants.push(this.normalizeText(targetAnswer));
            }
            return variants.some(v => v === normUser || normUser.includes(v) || v.includes(normUser));
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
                const keys = Object.keys(targetAnswers);

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
    // 3. Exam Engine (5-Year Blueprint & Weights)
    // -------------------------------------------------------------
    const ExamEngine = {
        getBank() {
            return window.HOUSING_EXAM_BANK || null;
        },

        getQuestionPool(subject, type) {
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
                    pool.push({
                        ...q,
                        qKey: `${subject}_${type}_${chap.chapter}_${q.id}`,
                        subject,
                        type,
                        chapterName: chap.chapter,
                        sourceFile: chap.source_file || ''
                    });
                });
            });

            return pool;
        },

        weightedPick(items, statsMap, count, excludeKeysSet = new Set()) {
            const available = items.filter(it => !excludeKeysSet.has(it.qKey));
            if (available.length <= count) return available;

            const weights = available.map(it => {
                const stat = statsMap[it.qKey];
                return stat && stat.weight ? stat.weight : 1;
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
                    { pattern: /07.*입주자관리/, mc: 1, sa: 1 },
                    { pattern: /08.*사무.*인사/, mc: 3, sa: 3 },
                    { pattern: /09.*대외업무.*리모델링/, mc: 1, sa: 0 },
                    { pattern: /11.*회계관리/, mc: 1, sa: 0 },
                    { pattern: /12.*시설관리/, mc: 9, sa: 6 },
                    { pattern: /13.*안전관리|14.*환경관리/, mc: 2, sa: 3 }
                ];
            } else {
                return [
                    { pattern: /01.*주택법/, mc: 5, sa: 3 },
                    { pattern: /02.*공동주택관리법|2-1|2-2/, mc: 5, sa: 3 },
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

        generateExamSet(subject, statsMap = {}, excludeKeysSet = new Set()) {
            const mcPool = this.getQuestionPool(subject, 'choice');
            const saPool = this.getQuestionPool(subject, 'short');
            const blueprint = this.getBlueprint(subject);

            const selectedMC = [];
            const selectedSA = [];

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

                if (targetMc > 0) {
                    const picked = this.weightedPick(chapterMcList, statsMap, targetMc, excludeKeysSet);
                    selectedMC.push(...picked);
                }
                if (targetSa > 0) {
                    const picked = this.weightedPick(chapterSaList, statsMap, targetSa, excludeKeysSet);
                    selectedSA.push(...picked);
                }
            });

            if (selectedMC.length < 24) {
                const remainder = this.weightedPick(mcPool, statsMap, 24 - selectedMC.length, new Set([...excludeKeysSet, ...selectedMC.map(q => q.qKey)]));
                selectedMC.push(...remainder);
            }
            if (selectedSA.length < 16) {
                const remainder = this.weightedPick(saPool, statsMap, 16 - selectedSA.length, new Set([...excludeKeysSet, ...selectedSA.map(q => q.qKey)]));
                selectedSA.push(...remainder);
            }

            // 실전 시험지 순서와 100% 동일하게 정렬:
            // 1~24번: 객관식 (주택법/행정관리 -> 공주법 -> 건축법/시설관리 -> 기타법/안전환경)
            // 25~40번: 주관식 (주택법/행정관리 -> 공주법 -> 건축법/시설관리 -> 기타법/안전환경)
            return [...selectedMC.slice(0, 24), ...selectedSA.slice(0, 16)];
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
            if (weakItems.length >= count) {
                return this.weightedPick(weakItems, statsMap, count);
            }

            const weakSet = new Set(weakItems.map(q => q.qKey));
            const remaining = this.weightedPick(all, statsMap, count - weakItems.length, weakSet);
            return this.shuffleWithAntiClumping([...weakItems, ...remaining]);
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
            e.preventDefault();

            if (this.palmRejection && e.pointerType === 'touch' && e.isPrimary === false) return;

            this.isDrawing = true;
            try {
                this.canvas.setPointerCapture(e.pointerId);
            } catch (err) {}

            const pos = this.getPos(e);
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
            e.preventDefault();

            const pos = this.getPos(e);
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
            this.currentStroke = null;
            try {
                if (e && e.pointerId) this.canvas.releasePointerCapture(e.pointerId);
            } catch (err) {}

            if (this.currentQuestionKey) {
                await IDBStore.saveDrawingStrokes(this.currentQuestionKey, this.strokes);
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

        async loadQuestionStrokes(qKey) {
            this.currentQuestionKey = qKey;
            this.strokes = (await IDBStore.getDrawingStrokes(qKey)) || [];
            this.handleResize();
        }

        async clearCurrentStrokes() {
            this.strokes = [];
            this.redraw();
            if (this.currentQuestionKey) {
                await IDBStore.clearDrawingStrokes(this.currentQuestionKey);
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
    // 5. OMR Sheet & AI Prompt Generator
    // -------------------------------------------------------------
    const OMRSheet = {
        renderGrid(container, questions, userAnswers, results, onSelectQuestion) {
            if (!container) return;
            container.innerHTML = '';

            questions.forEach((q, idx) => {
                const btn = document.createElement('button');
                btn.className = 'omr-cell';

                const isAnswered = userAnswers[idx] !== undefined && userAnswers[idx] !== null && userAnswers[idx] !== '';
                const res = results[idx];

                if (res !== undefined) {
                    btn.classList.add(res.isCorrect ? 'correct' : 'wrong');
                } else if (isAnswered) {
                    btn.classList.add('answered');
                }

                btn.innerHTML = `
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

        infiniteSetCount: 1,
        infiniteUsedKeys: new Set(),

        timerInterval: null,
        elapsedSeconds: 0,
        mockRemainingSeconds: 40 * 60,

        isExplanationOpen: false,
        tabletCanvas: null
    };

    let elements = {};

    function initDOMElements() {
        elements = {
            body: document.body,
            screens: {
                home: document.getElementById('screen-home'),
                quiz: document.getElementById('screen-quiz'),
                result: document.getElementById('screen-result')
            },
            header: {
                modeTitle: document.getElementById('header-mode-title'),
                brandBadge: document.getElementById('header-brand-badge'),
                timerBadge: document.getElementById('header-timer'),
                bloodBar: document.getElementById('blood-progress-fill'),
                bloodScoreText: document.getElementById('blood-score-text'),
                btnPen: document.getElementById('btn-toggle-pen'),
                btnFullscreen: document.getElementById('btn-fullscreen'),
                btnOMR: document.getElementById('btn-open-omr'),
                btnHome: document.getElementById('btn-go-home')
            },
            quiz: {
                card: document.getElementById('quiz-card'),
                qNum: document.getElementById('q-num-text'),
                chapterBadge: document.getElementById('q-chapter-badge'),
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
                btnRetry: document.getElementById('btn-retry-q')
            },
            modals: {
                omr: document.getElementById('modal-omr'),
                partSelect: document.getElementById('modal-part-select'),
                pinAuth: document.getElementById('modal-pin-auth'),
                wrongManager: document.getElementById('modal-wrong-manager'),
                omrGrid: document.getElementById('omr-grid-container'),
                partList: document.getElementById('part-list-container'),
                wrongList: document.getElementById('wrong-items-container'),
                cntTotalWrong: document.getElementById('cnt-total-wrong'),
                inputPin: document.getElementById('input-pin-code'),
                formPin: document.getElementById('form-pin-auth')
            },
            result: {
                scoreText: document.getElementById('res-score-text'),
                passPill: document.getElementById('res-pass-pill'),
                correctCount: document.getElementById('res-correct-count'),
                wrongCount: document.getElementById('res-wrong-count'),
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
                elements.header.modeTitle.innerHTML = '<i class="fa-solid fa-fire text-amber-500"></i> 주관사 2차 문제지옥';
            }
            if (elements.header.timerBadge) {
                elements.header.timerBadge.textContent = '00:00';
                elements.header.timerBadge.classList.remove('warning');
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
        state.userAnswers = [];
        state.results = [];
        state.firstAttemptResults = [];
        state.isExplanationOpen = false;
        state.statsMap = await IDBStore.getAllStatsMap();

        if (modeKey === 'infinite') {
            state.infiniteSetCount = 1;
            state.infiniteUsedKeys.clear();
            state.questions = ExamEngine.generateExamSet(state.subject, state.statsMap, state.infiniteUsedKeys);
            state.questions.forEach(q => state.infiniteUsedKeys.add(q.qKey));
            elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-skull"></i> 헬 모드 (무한 풀이)`;
        } else if (modeKey === 'review') {
            state.questions = ExamEngine.generateReviewSet(state.subject, state.statsMap, 40);
            elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-rotate-left"></i> 오답 집중 복습`;
        } else if (modeKey === 'mock') {
            state.questions = ExamEngine.generateExamSet(state.subject, state.statsMap);
            elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-clock"></i> 실전 모의고사 (40분)`;
        } else if (modeKey === 'part') {
            state.questions = ExamEngine.generatePartSet(state.subject, partPattern);
            elements.header.modeTitle.innerHTML = `<i class="fa-solid fa-layer-group"></i> 파트별 전수 완독`;
        }

        if (state.questions.length === 0) {
            showToast('출제 가능한 문제가 없습니다.');
            return;
        }

        startTimer(modeKey === 'mock');
        showScreen('quiz');
        renderQuestion(0);
    }

    function startTimer(isCountdown = false) {
        clearInterval(state.timerInterval);
        state.elapsedSeconds = 0;
        state.mockRemainingSeconds = 40 * 60;

        const updateTimerDisplay = () => {
            if (isCountdown) {
                state.mockRemainingSeconds--;
                const mins = Math.floor(state.mockRemainingSeconds / 60);
                const secs = state.mockRemainingSeconds % 60;
                elements.header.timerBadge.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

                if (state.mockRemainingSeconds <= 300) {
                    elements.header.timerBadge.classList.add('warning');
                } else {
                    elements.header.timerBadge.classList.remove('warning');
                }

                if (state.mockRemainingSeconds <= 0) {
                    clearInterval(state.timerInterval);
                    finishSession();
                }
            } else {
                state.elapsedSeconds++;
                const mins = Math.floor(state.elapsedSeconds / 60);
                const secs = state.elapsedSeconds % 60;
                elements.header.timerBadge.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                elements.header.timerBadge.classList.remove('warning');
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
                .replace(/([^\n])\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, '$1\n$2')
                .replace(/([^\n(（\s])\s*([㉠㉡㉢㉣㉤㉥])(?!\s*[\)）])/g, '$1\n$2')
                .replace(/([^\n])\s*(\b\d+\.\s+)/g, '$1\n$2')
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
            .replace(/([^\n])\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, '$1\n$2')
            .replace(/([^\n(（\s])\s*([㉠㉡㉢㉣㉤㉥])(?!\s*[\)）])/g, '$1\n$2')
            .replace(/([^\n])\s*(\b\d+\.\s+)/g, '$1\n$2')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function renderQuestion(index) {
        state.currentIndex = index;
        const q = state.questions[index];
        if (!q) return;

        state.isExplanationOpen = false;
        elements.quiz.explanationCard.classList.remove('active');

        if (state.tabletCanvas) {
            await state.tabletCanvas.loadQuestionStrokes(q.qKey);
        }

        const stat = state.statsMap[q.qKey] || { weight: 1, wrongCount: 0 };
        const weight = stat.weight || 1;

        elements.quiz.card.className = `quiz-card card-w${weight >= 10 ? 10 : (weight >= 6 ? 6 : (weight >= 4 ? 4 : (weight >= 2 ? 2 : 1)))}`;

        elements.quiz.qNum.textContent = `문항 ${index + 1} / ${state.questions.length}`;
        elements.quiz.chapterBadge.textContent = q.chapterName.replace(/^CHAPTER\s+\d+\s*/i, '');

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
                const pills = Object.entries(q.answers || {}).map(([k, v]) => `
                    <span class="exp-blank-pill">[${k}] <b>${v}</b></span>
                `).join('');
                elements.quiz.expAnswerBox.innerHTML = `
                    <span class="exp-answer-badge">모범 답안</span>
                    <span class="exp-answer-val">${pills || '답안 정보 없음'}</span>
                `;
            }
        }

        const expText = q.explanation && q.explanation.trim().length > 0 
            ? formatExplanation(q.explanation)
            : (q.type === 'short' ? '본 문항의 조문 및 법령 규정에 따른 정확한 기입 답안은 위와 같습니다.' : '');
        elements.quiz.expBody.textContent = expText;

        if (q.tip) {
            elements.quiz.tipBox.textContent = `💡 일타 팁: ${q.tip}`;
            elements.quiz.tipBox.style.display = 'block';
        } else {
            elements.quiz.tipBox.style.display = 'none';
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
                    elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> ${userAns}번 정답 확인 (Space)`;
                } else {
                    elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> 정답 확인 (Space)`;
                }
            } else {
                elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-lightbulb text-amber-400"></i> 정답·해설 (Space)`;
            }
        }

        updateBloodGauge();
    }

    function renderChoiceOptions(q, index) {
        elements.quiz.optionsContainer.innerHTML = '';
        const userSelected = state.userAnswers[index];
        const res = state.results[index];

        (q.options || []).forEach((optText, optIdx) => {
            const choiceNum = optIdx + 1;
            const optBtn = document.createElement('button');
            optBtn.className = 'option-item';
            if (userSelected === choiceNum) optBtn.classList.add('selected');

            if (res !== undefined) {
                if (choiceNum === Number(q.answer)) {
                    optBtn.classList.add('correct');
                } else if (userSelected === choiceNum && !res.isCorrect) {
                    optBtn.classList.add('wrong');
                }
            }

            optBtn.innerHTML = `
                <span class="opt-num">${choiceNum}</span>
                <span class="opt-text">${optText}</span>
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

        Object.keys(targetAnswers).forEach((k) => {
            const row = document.createElement('div');
            row.className = 'blank-row';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'blank-input';
            input.placeholder = `빈칸 [${k}] 정답 입력`;
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
                    const nextInput = row.nextElementSibling?.querySelector('input');
                    if (nextInput) {
                        nextInput.focus();
                    } else {
                        gradeCurrentQuestion();
                    }
                }
            });

            row.innerHTML = `<span class="blank-label">${k}</span>`;
            row.appendChild(input);
            elements.quiz.subjectiveContainer.appendChild(row);
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
            elements.quiz.btnToggleExp.innerHTML = `<i class="fa-solid fa-circle-check text-sky-400"></i> ${choiceNum}번 정답 확인 (Space)`;
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
        }

        renderQuestion(idx);
        toggleExplanation(true);
        triggerVisualFeedback(gradeRes.isCorrect);
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
        } else {
            if (state.mode === 'infinite') {
                state.infiniteSetCount++;
                const nextSet = ExamEngine.generateExamSet(state.subject, state.statsMap, state.infiniteUsedKeys);
                if (nextSet.length > 0) {
                    nextSet.forEach(q => state.infiniteUsedKeys.add(q.qKey));
                    state.questions.push(...nextSet);
                    showToast(`🔥 [헬 모드 ${state.infiniteSetCount}세트] 40문항 추가!`);
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
        }
    }

    async function finishSession() {
        clearInterval(state.timerInterval);

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
        OMRSheet.renderGrid(
            elements.modals.omrGrid,
            state.questions,
            state.userAnswers,
            state.results,
            (selectedIdx) => {
                closeModal(elements.modals.omr);
                renderQuestion(selectedIdx);
            }
        );
        elements.modals.omr.classList.add('active');
    }

    function openPartSelectModal() {
        const chapters = ExamEngine.getChapterList(state.subject);
        elements.modals.partList.innerHTML = '';

        chapters.forEach(chap => {
            const btn = document.createElement('button');
            btn.className = 'option-item';
            btn.innerHTML = `
                <i class="fa-solid fa-folder-open text-sky-400"></i>
                <span>${chap.chapter}</span>
            `;
            btn.addEventListener('click', () => {
                closeModal(elements.modals.partSelect);
                startMode('part', chap.chapter);
            });
            elements.modals.partList.appendChild(btn);
        });

        elements.modals.partSelect.classList.add('active');
    }

    function openPINAuthModal() {
        if (!elements.modals.pinAuth) return;
        elements.modals.inputPin.value = '';
        elements.modals.pinAuth.classList.add('active');
        setTimeout(() => {
            if (elements.modals.inputPin) elements.modals.inputPin.focus();
        }, 120);
    }

    async function verifyPINAuth() {
        const pin = (elements.modals.inputPin.value || '').trim();
        if (pin === '2834') {
            closeModal(elements.modals.pinAuth);
            showToast('🔓 보안 인증 성공: 오답 리스트 관리로 이동합니다.');
            await openWrongManagerModal('all');
        } else {
            showToast('❌ 비밀번호가 일치하지 않습니다. (4자리)');
            elements.modals.inputPin.value = '';
            elements.modals.inputPin.focus();
        }
    }

    async function openWrongManagerModal(subjectFilter = 'all') {
        if (!elements.modals.wrongManager) return;
        elements.modals.wrongManager.classList.add('active');
        await renderWrongManagerList(subjectFilter);
    }

    async function renderWrongManagerList(subjectFilter = 'all') {
        const statsMap = await IDBStore.getAllStatsMap();
        state.statsMap = statsMap;

        // ExamEngine의 풀에서 3,470개 정규 문항 객체(qKey 완벽 일치) 추출
        const allQuestions = [
            ...ExamEngine.getQuestionPool('관계법규', 'choice'),
            ...ExamEngine.getQuestionPool('관계법규', 'short'),
            ...ExamEngine.getQuestionPool('관리실무', 'choice'),
            ...ExamEngine.getQuestionPool('관리실무', 'short')
        ];

        // 가중치 2 이상 또는 오답 기록이 있는 문항 필터링
        const wrongItems = allQuestions.filter(q => {
            const st = statsMap[q.qKey];
            if (!st) return false;
            const isWrong = (st.weight || 1) >= 2 || (st.wrongCount || 0) > 0;
            if (!isWrong) return false;
            if (subjectFilter !== 'all' && q.subject !== subjectFilter) return false;
            return true;
        });

        // 가중치 내림차순, 오답 횟수 내림차순 정렬
        wrongItems.sort((a, b) => {
            const stA = statsMap[a.qKey] || { weight: 1, wrongCount: 0 };
            const stB = statsMap[b.qKey] || { weight: 1, wrongCount: 0 };
            if ((stB.weight || 1) !== (stA.weight || 1)) {
                return (stB.weight || 1) - (stA.weight || 1);
            }
            return (stB.wrongCount || 0) - (stA.wrongCount || 0);
        });

        if (elements.modals.cntTotalWrong) {
            elements.modals.cntTotalWrong.textContent = wrongItems.length;
        }

        elements.modals.wrongList.innerHTML = '';

        if (wrongItems.length === 0) {
            elements.modals.wrongList.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-check text-emerald-400" style="font-size: 2.5rem; margin-bottom: 12px; display: block;"></i>
                    <p style="font-weight: 700; font-size: 1rem; color: #F1F5F9;">등록된 오답 문항이 없습니다.</p>
                    <p style="font-size: 0.85rem; margin-top: 4px;">가중치가 누적된 취약 문제가 없거나 모두 삭제 처리되었습니다.</p>
                </div>
            `;
            return;
        }

        wrongItems.forEach(q => {
            const st = statsMap[q.qKey] || { weight: 1, wrongCount: 0 };
            const weight = st.weight || 1;
            const wrongCount = st.wrongCount || 0;

            let wText = `⚡ Lv.1 (W=2 / 오답 ${wrongCount}회)`;
            let wColor = '#38BDF8';
            if (weight >= 10) {
                wText = `🔥 Lv.4 지옥 (W=10 / 오답 ${wrongCount}회)`;
                wColor = '#EF4444';
            } else if (weight >= 6) {
                wText = `🚨 Lv.3 취약 (W=6 / 오답 ${wrongCount}회)`;
                wColor = '#F97316';
            } else if (weight >= 4) {
                wText = `⚠️ Lv.2 주의 (W=4 / 오답 ${wrongCount}회)`;
                wColor = '#F59E0B';
            }

            const cleanChap = q.chapterName.replace(/^CHAPTER\s+\d+\s*/i, '');
            const card = document.createElement('div');
            card.className = 'wrong-item-card';

            card.innerHTML = `
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                        <span style="background: rgba(255,255,255,0.06); color: var(--theme-primary); font-size: 0.75rem; font-weight: 800; padding: 2px 8px; border-radius: 4px;">
                            ${q.subject}
                        </span>
                        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">
                            ${cleanChap} [문항 ${q.id}] (${q.type === 'choice' ? '객관식' : '주관식'})
                        </span>
                        <span style="font-size: 0.75rem; font-weight: 800; color: ${wColor}; background: rgba(255,255,255,0.04); padding: 2px 8px; border-radius: 4px; border: 1px solid ${wColor};">
                            ${wText}
                        </span>
                    </div>
                    <p style="font-size: 0.9rem; color: #F1F5F9; font-weight: 600; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">
                        ${q.question || q.title}
                    </p>
                </div>
                <button class="btn-reset-single-w" data-qkey="${q.qKey}" title="오답 리스트에서 삭제">
                    <i class="fa-solid fa-trash-can"></i> 삭제
                </button>
            `;

            const btnReset = card.querySelector('.btn-reset-single-w');
            btnReset.addEventListener('click', async () => {
                await IDBStore.resetQuestionWeight(q.qKey);
                state.statsMap[q.qKey] = { weight: 1, wrongCount: 0, tryCount: 0 };
                card.classList.add('reset-done');
                btnReset.innerHTML = '<i class="fa-solid fa-check"></i> 삭제 완료';
                btnReset.disabled = true;
                showToast(`[${cleanChap} ${q.id}번] 오답 리스트에서 삭제되었습니다.`);

                const currentCount = parseInt(elements.modals.cntTotalWrong.textContent || '0', 10);
                if (currentCount > 0) {
                    elements.modals.cntTotalWrong.textContent = currentCount - 1;
                }
            });

            elements.modals.wrongList.appendChild(card);
        });
    }

    function closeModal(modalEl) {
        if (modalEl) modalEl.classList.remove('active');
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
                    openPINAuthModal();
                } else if (mode === 'part') {
                    openPartSelectModal();
                } else {
                    startMode(mode);
                }
            });
        });

        if (elements.modals.formPin) {
            elements.modals.formPin.addEventListener('submit', (e) => {
                e.preventDefault();
                verifyPINAuth();
            });
        }

        document.querySelectorAll('.wrong-filter-bar .btn-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.wrong-filter-bar .btn-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderWrongManagerList(btn.dataset.subject);
            });
        });

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
            if (confirm('학습을 종료하고 메인 화면으로 이동하시겠습니까?')) {
                clearInterval(state.timerInterval);
                showScreen('home');
            }
        });

        elements.header.btnOMR.addEventListener('click', openOMR);
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

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal-overlay');
                closeModal(modal);
            });
        });

        window.addEventListener('keydown', async (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            if (elements.screens.quiz && elements.screens.quiz.classList.contains('active')) {
                if (e.key >= '1' && e.key <= '5') {
                    const q = state.questions[state.currentIndex];
                    if (q && q.type === 'choice') {
                        selectChoice(parseInt(e.key, 10));
                    }
                } else if (e.key === ' ' || e.code === 'Space') {
                    e.preventDefault();
                    const idx = state.currentIndex;
                    if (state.results[idx] === undefined) {
                        await gradeCurrentQuestion();
                    } else {
                        toggleExplanation();
                    }
                } else if (e.key === 'ArrowRight') {
                    nextQuestion();
                } else if (e.key === 'ArrowLeft') {
                    prevQuestion();
                }
            }
        });
    }

    // App Initialization on DOM Load
    window.addEventListener('DOMContentLoaded', async () => {
        initDOMElements();
        await IDBStore.init();
        state.statsMap = await IDBStore.getAllStatsMap();

        const canvasEl = document.getElementById('drawing-canvas');
        const toolbarEl = document.getElementById('stylus-toolbar');
        if (canvasEl) {
            state.tabletCanvas = new TabletCanvas(canvasEl, toolbarEl);
        }

        initEventListeners();
        setSubject(state.subject);
        showScreen('home');
    });

})();
