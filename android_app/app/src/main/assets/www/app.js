// Housing Manager Exam Smart Learning Platform JS App

let studyData = {
    lectures: [],
    quizzes: []
};

let currentView = 'viewer';
let currentSubjectFilter = '관계법규';
let currentLecture = null;
let clozeMaskEnabled = false;
let currentNoteTheme = localStorage.getItem('housing_exam_note_theme') || 'paper';

// Quiz Mode State
let currentQuizMode = 'all'; // 'all' (전범위) or 'unit' (단원별)
let currentQuizUnitTitle = '';

// Quiz State
let quizQuestions = [];
let quizCurrentIndex = 0;
let userAnswers = [];
let quizStats = {}; // LocalStorage synced: { quizId: { wrongCount, tryCount, weight } }

// Zen Mode & Tablet Stylus Pen State
let isZenMode = localStorage.getItem('housing_exam_zen_mode') === 'true';
let quizInputMode = localStorage.getItem('housing_exam_quiz_input_mode') || 'pen';
let quizDrawingData = {}; // { [quizIndex]: { [blankSymbol]: [ strokes ] } }
let currentBlankSymbol = 'default';
let activePenTool = 'pen'; // 'pen' | 'eraser'
let palmRejectionEnabled = true;
let isDrawing = false;
let currentStroke = null;
let canvasListenersAttached = false;

document.addEventListener('DOMContentLoaded', async () => {
    loadLocalStats();
    initSidebarState();
    initZenMode();
    initStylusCanvasEvents();
    setNoteTheme(currentNoteTheme);
    await fetchStudyData();
    renderLectureList();
    
    // Auto load first lecture if available
    if (studyData.lectures.length > 0) {
        selectLecture(studyData.lectures[0].fileName);
    }
});

function initSidebarState() {
    if (window.innerWidth > 768) {
        const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        if (isCollapsed) {
            document.querySelector('.sidebar')?.classList.add('collapsed');
        }
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    if (window.innerWidth <= 768) {
        const isOpen = sidebar.classList.contains('open');
        if (isOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    } else {
        sidebar.classList.toggle('collapsed');
        const collapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebar_collapsed', collapsed);
    }
}

function openSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    if (window.innerWidth <= 768) {
        sidebar.classList.add('open');
        overlay?.classList.add('active');
    } else {
        sidebar.classList.remove('collapsed');
        localStorage.setItem('sidebar_collapsed', 'false');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        overlay?.classList.remove('active');
    } else {
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebar_collapsed', 'true');
    }
}

// -------------------------------------------------------------
// Zen Mode (전체화면 몰입 모드)
// -------------------------------------------------------------
function initZenMode() {
    if (isZenMode) {
        document.body.classList.add('zen-mode');
    }
    
    // ESC key exits Zen mode
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) {
            toggleZenMode();
        }
    });

    window.addEventListener('resize', () => {
        if (currentView === 'quiz' && quizInputMode === 'pen') {
            resizeQuizPenCanvas();
        }
    });
}

function toggleZenMode() {
    const isZen = document.body.classList.toggle('zen-mode');
    localStorage.setItem('housing_exam_zen_mode', isZen ? 'true' : 'false');
    isZenMode = isZen;
    
    // Smooth resize trigger for pen canvas
    if (currentView === 'quiz' && quizInputMode === 'pen') {
        setTimeout(resizeQuizPenCanvas, 150);
    }
}

function focusSearch() {
    const input = document.getElementById('global-search-input');
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function loadLocalStats() {
    try {
        const saved = localStorage.getItem('housing_exam_quiz_stats');
        if (saved) {
            quizStats = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Error loading stats', e);
    }
}

function saveLocalStats() {
    try {
        localStorage.setItem('housing_exam_quiz_stats', JSON.stringify(quizStats));
    } catch (e) {
        console.error('Error saving stats', e);
    }
}

async function fetchStudyData() {
    try {
        const resp = await fetch('data/study_data.json?v=' + Date.now());
        studyData = await resp.json();
        console.log('Loaded study data via fetch:', studyData);
    } catch (err) {
        console.warn('fetch study_data.json failed, checking window.STUDY_DATA fallback:', err);
        if (window.STUDY_DATA) {
            studyData = window.STUDY_DATA;
        }
    }
    updateFilterChipCounts();
    populateQuizUnitDropdown();
}

function updateFilterChipCounts() {
    if (!studyData || !studyData.lectures) return;
    const relCount = studyData.lectures.filter(l => l.subject === '관계법규').length;
    const pracCount = studyData.lectures.filter(l => l.subject === '관리실무').length;
    const relTestCount = studyData.lectures.filter(l => l.subject === '관계법규(문제)').length;
    const pracTestCount = studyData.lectures.filter(l => l.subject === '관리실무(문제)').length;

    const chipRel = document.getElementById('chip-rel');
    if (chipRel) chipRel.innerText = `관계법규 (${relCount})`;

    const chipPrac = document.getElementById('chip-prac');
    if (chipPrac) chipPrac.innerText = `관리실무 (${pracCount})`;

    const chipRelTest = document.getElementById('chip-rel-test');
    if (chipRelTest) chipRelTest.innerText = `법규문제 (${relTestCount})`;

    const chipPracTest = document.getElementById('chip-prac-test');
    if (chipPracTest) chipPracTest.innerText = `실무문제 (${pracTestCount})`;
}

function populateQuizUnitDropdown() {
    const selectEl = document.getElementById('quiz-unit-select');
    if (!selectEl) return;

    selectEl.innerHTML = `<option value="all">🎯 전 범위 오답가중치 20제 (실전 모드)</option>`;

    const subjects = ['관계법규', '관리실무', '관계법규(문제)', '관리실무(문제)'];
    subjects.forEach(subj => {
        const subLectures = studyData.lectures.filter(l => l.subject === subj);
        if (subLectures.length === 0) return;

        const groupEl = document.createElement('optgroup');
        groupEl.label = `📘 ${subj}`;

        subLectures.forEach(lec => {
            const opt = document.createElement('option');
            opt.value = lec.fileName;
            const qCountStr = lec.quizCount > 0 ? `${lec.quizCount}문제` : '모의고사';
            opt.innerText = `[${lec.subject}] ${lec.title} (${qCountStr})`;
            groupEl.appendChild(opt);
        });

        selectEl.appendChild(groupEl);
    });
}

// -------------------------------------------------------------
// Sidebar & Lecture List
// -------------------------------------------------------------
function filterSubject(subject) {
    currentSubjectFilter = subject;
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
    
    if (subject === '관계법규') document.getElementById('chip-rel')?.classList.add('active');
    else if (subject === '관리실무') document.getElementById('chip-prac')?.classList.add('active');
    else if (subject === '관계법규(문제)') document.getElementById('chip-rel-test')?.classList.add('active');
    else if (subject === '관리실무(문제)') document.getElementById('chip-prac-test')?.classList.add('active');

    renderLectureList();
}

function renderLectureList() {
    const container = document.getElementById('lecture-list-container');
    container.innerHTML = '';

    const filtered = studyData.lectures.filter(l => {
        if (currentSubjectFilter === 'all') return true;
        return l.subject === currentSubjectFilter;
    });

    filtered.sort((a, b) => a.lectureNum - b.lectureNum);

    if (filtered.length === 0) {
        container.innerHTML = `<div style="padding: 20px; color: var(--text-muted); font-size: 13px;">해당하는 강의 노트가 없습니다.</div>`;
        return;
    }

    filtered.forEach(lec => {
        const isCurrent = currentLecture && currentLecture.fileName === lec.fileName;
        const itemEl = document.createElement('div');
        itemEl.className = `lecture-item ${isCurrent ? 'active' : ''}`;
        itemEl.onclick = () => selectLecture(lec.fileName);

        const isMock = lec.title.includes('모의고사') || lec.title.includes('모의');
        const badgeClass = isMock ? 'mock' : (lec.subject.includes('관계법규') ? 'rel' : (lec.subject.includes('관리실무') ? 'prac' : 'etc'));

        let subHeadingsHtml = '';
        if (lec.subHeadings && lec.subHeadings.length > 0) {
            subHeadingsHtml = `<div class="subheadings-list">` + 
                lec.subHeadings.slice(0, 3).map(sh => `<div>• ${escapeHtml(sh)}</div>`).join('') +
                `</div>`;
        }

        const quizBtnHtml = isMock 
            ? `<button class="btn-unit-quiz-mini" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.4);" title="${escapeHtml(lec.title)} 실전 모의고사 풀기" onclick="event.stopPropagation(); startUnitQuizForLecture('${escapeHtml(lec.fileName)}')">📝 40제 모의</button>`
            : (lec.quizCount > 0 
                ? `<button class="btn-unit-quiz-mini" title="${escapeHtml(lec.title)} 전체 퀴즈 풀기" onclick="event.stopPropagation(); startUnitQuizForLecture('${escapeHtml(lec.fileName)}')">🎯 ${lec.quizCount}문제</button>`
                : `<span class="quiz-cnt-badge zero">0문제</span>`);

        itemEl.innerHTML = `
            <div class="lecture-meta">
                <span class="subject-badge ${badgeClass}">${escapeHtml(lec.subject)}</span>
                ${quizBtnHtml}
            </div>
            <div class="lecture-title">${escapeHtml(lec.title)}</div>
            ${subHeadingsHtml}
        `;
        container.appendChild(itemEl);
    });
}

function selectLecture(fileNameOrPath, anchorId = null) {
    if (!fileNameOrPath) return;
    const targetNorm = fileNameOrPath.normalize('NFC');
    const lec = studyData.lectures.find(l => 
        (l.fileName && l.fileName.normalize('NFC') === targetNorm) || 
        (l.relativePath && l.relativePath.normalize('NFC') === targetNorm)
    );
    if (!lec) return;

    currentLecture = lec;
    renderLectureList();

    // Update Note Header Info & Unit Quiz Button
    document.getElementById('current-note-title').innerText = lec.title;
    const badgeEl = document.getElementById('current-note-badge');
    badgeEl.innerText = lec.subject;
    badgeEl.className = `subject-badge ${lec.subject === '관계법규' ? 'rel' : (lec.subject === '관리실무' ? 'prac' : 'etc')}`;

    const unitQuizBtn = document.getElementById('btn-start-unit-quiz');
    if (unitQuizBtn) {
        unitQuizBtn.style.display = 'inline-flex';
        if (lec.quizCount > 0) {
            unitQuizBtn.innerHTML = `🎯 이 단원 퀴즈 풀기 (${lec.quizCount}문제)`;
            unitQuizBtn.title = "현재 단원의 모든 문제를 집중하여 풀어봅니다.";
            unitQuizBtn.className = 'btn-lecture-quiz';
        } else if (lec.subject.includes('(문제)')) {
            unitQuizBtn.innerHTML = `📝 모의고사 응시 (뷰어)`;
            unitQuizBtn.title = "본 단원은 통합 실전 모의고사로 뷰어 화면에서 응시합니다.";
            unitQuizBtn.className = 'btn-lecture-quiz mode-test';
        } else {
            unitQuizBtn.innerHTML = `🎯 이 단원 퀴즈 (${lec.quizCount}문제)`;
            unitQuizBtn.title = "이 단원에는 추출된 퀴즈 문항이 없습니다.";
            unitQuizBtn.className = 'btn-lecture-quiz empty';
        }
    }

    // Load iframe with relativePath
    const iframe = document.getElementById('note-frame');
    let targetUrl = `notes/${lec.relativePath || lec.fileName}`;
    if (anchorId) {
        targetUrl += `#${anchorId}`;
    }
    iframe.src = targetUrl;

    iframe.onload = () => {
        applyThemeToIframe();
        if (clozeMaskEnabled) {
            applyClozeMaskToIframe();
        }
    };

    if (window.innerWidth <= 768) {
        closeSidebar();
    }

    switchView('viewer');
}

// -------------------------------------------------------------
// Note Theme Switcher (기본 / 웜 페이퍼 / 소프트 다크)
// -------------------------------------------------------------
function setNoteTheme(theme) {
    currentNoteTheme = theme;
    try {
        localStorage.setItem('housing_exam_note_theme', theme);
    } catch (e) {}

    // Update UI chips
    document.querySelectorAll('.theme-chip').forEach(el => el.classList.remove('active'));
    const activeChip = document.getElementById(`btn-theme-${theme}`);
    if (activeChip) activeChip.classList.add('active');

    applyThemeToIframe();
    if (clozeMaskEnabled) {
        applyClozeMaskToIframe();
    }
}

function applyThemeToIframe() {
    const iframe = document.getElementById('note-frame');
    if (!iframe) return;

    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || !doc.head) return;

        let styleEl = doc.getElementById('note-theme-style');
        if (currentNoteTheme === 'light') {
            if (styleEl) styleEl.remove();
            return;
        }

        if (!styleEl) {
            styleEl = doc.createElement('style');
            styleEl.id = 'note-theme-style';
            doc.head.appendChild(styleEl);
        }

        if (currentNoteTheme === 'paper') {
            styleEl.innerHTML = `
                html, body {
                    background-color: #f7f4ea !important;
                    color: #2c2825 !important;
                }
                h1, h2, h3, .explanation-title {
                    color: #1c1917 !important;
                    border-color: #44403c !important;
                }
                table {
                    background-color: #fdfbf7 !important;
                    color: #2c2825 !important;
                }
                th {
                    background-color: #ece5d3 !important;
                    color: #1c1917 !important;
                    border-color: #78716c !important;
                }
                td {
                    border-color: #a8a29e !important;
                }
                .explanation, .quiz-box, .callout, div[style*="background"] {
                    background-color: #faf7ee !important;
                    border-color: #a8a29e !important;
                    color: #2c2825 !important;
                }
                .highlight-blue {
                    color: #1d4ed8 !important;
                    font-weight: bold !important;
                }
                .highlight-red {
                    color: #b91c1c !important;
                    font-weight: bold !important;
                }
                .highlight-green {
                    color: #15803d !important;
                    font-weight: bold !important;
                }
                .highlight-purple {
                    color: #7e22ce !important;
                    font-weight: bold !important;
                }
                .blank-answer {
                    color: #d6d3c8 !important;
                }
            `;
        } else if (currentNoteTheme === 'dark') {
            styleEl.innerHTML = `
                html, body {
                    background-color: #0f172a !important;
                    color: #e2e8f0 !important;
                }
                h1, h2, h3, .explanation-title {
                    color: #f8fafc !important;
                    border-color: #475569 !important;
                }
                table {
                    background-color: #1e293b !important;
                    color: #e2e8f0 !important;
                }
                th {
                    background-color: #334155 !important;
                    color: #f8fafc !important;
                    border-color: #475569 !important;
                }
                td {
                    border-color: #334155 !important;
                }
                .explanation, .quiz-box, .callout, div[style*="background"] {
                    background-color: #1e293b !important;
                    border-color: #475569 !important;
                    color: #e2e8f0 !important;
                }
                .highlight-blue {
                    color: #60a5fa !important;
                    font-weight: bold !important;
                }
                .highlight-red {
                    color: #f87171 !important;
                    font-weight: bold !important;
                }
                .highlight-green {
                    color: #4ade80 !important;
                    font-weight: bold !important;
                }
                .highlight-purple {
                    color: #c084fc !important;
                    font-weight: bold !important;
                }
                .blank-answer {
                    color: #334155 !important;
                }
            `;
        }
    } catch (e) {
        console.warn('Iframe theme style error', e);
    }
}

// -------------------------------------------------------------
// Cloze Mask (암기장 모드)
// -------------------------------------------------------------
function toggleClozeMask() {
    clozeMaskEnabled = !clozeMaskEnabled;
    const btn = document.getElementById('btn-mask-toggle');
    btn.classList.toggle('active', clozeMaskEnabled);
    btn.innerText = clozeMaskEnabled ? '🔓 숨김 해제 (원문 보기)' : '🔒 숫자/조문 가리기';

    applyClozeMaskToIframe();
}

function applyClozeMaskToIframe() {
    const iframe = document.getElementById('note-frame');
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || !doc.head) return;

        let styleEl = doc.getElementById('cloze-mask-style');
        if (clozeMaskEnabled) {
            if (!styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = 'cloze-mask-style';
                doc.head.appendChild(styleEl);
            }

            let maskBg = '#111827';
            let maskColor = '#111827';
            let maskBorder = 'none';

            if (currentNoteTheme === 'paper') {
                maskBg = '#443c33';
                maskColor = '#443c33';
            } else if (currentNoteTheme === 'dark') {
                maskBg = '#020617';
                maskColor = '#020617';
                maskBorder = '1px solid #3b82f6';
            }

            styleEl.innerHTML = `
                .highlight-red, .highlight-blue, .highlight-purple, .highlight-green {
                    background-color: ${maskBg} !important;
                    color: ${maskColor} !important;
                    user-select: none !important;
                    border-radius: 4px !important;
                    padding: 0 4px !important;
                    cursor: pointer !important;
                    border: ${maskBorder} !important;
                    transition: all 0.2s !important;
                }
                .highlight-red:hover, .highlight-blue:hover, .highlight-purple:hover, .highlight-green:hover {
                    background-color: #fef08a !important;
                    color: #000000 !important;
                    border: none !important;
                }
            `;
        } else {
            if (styleEl) styleEl.remove();
        }
    } catch (e) {
        console.warn('Iframe cloak style error', e);
    }
}

function resetQuizStats() {
    if (confirm('모든 퀴즈의 누적 오답 가중치 기록을 초기화하시겠습니까?\n(모든 문제가 동일한 기본 확률 1/N 로 출제됩니다)')) {
        quizStats = {};
        try {
            localStorage.removeItem('housing_exam_quiz_stats');
        } catch (e) {
            console.error('Error resetting stats', e);
        }
        alert('오답 가중치 기록이 깔끔하게 초기화되었습니다!');
    }
}

function resumeQuizMode() {
    if (!quizQuestions || quizQuestions.length === 0) {
        startQuizMode();
        return;
    }

    renderQuizQuestion();
    switchView('quiz');
}

// -------------------------------------------------------------
// Weighted Random & Unit Quiz Engine
// -------------------------------------------------------------
function startQuizMode() {
    if (!studyData.quizzes || studyData.quizzes.length === 0) {
        alert('등록된 퀴즈 문항이 없습니다.');
        return;
    }

    currentQuizMode = 'all';
    currentQuizUnitTitle = '';

    const selectEl = document.getElementById('quiz-unit-select');
    if (selectEl) selectEl.value = 'all';

    // Filter out unit mock exams (단원별문제 / 모의고사) for the standard lecture random quiz pool
    const regularQuizzes = studyData.quizzes.filter(q => {
        const isMock = q.isMockExam || 
                       (q.noteFileName && q.noteFileName.includes('단원별문제')) || 
                       (q.subject && q.subject.includes('(문제)')) ||
                       (q.lectureTitle && (q.lectureTitle.includes('단원') || q.lectureTitle.includes('모의고사')));
        return !isMock;
    });

    const poolSource = regularQuizzes.length > 0 ? regularQuizzes : studyData.quizzes;

    // 1. Calculate Weights for each quiz (Cap at 5.0x max)
    const quizPool = poolSource.map(q => {
        const stat = quizStats[q.id] || { wrongCount: 0, tryCount: 0 };
        const rawWeight = 1.0 + (stat.wrongCount * 1.0);
        const cappedWeight = Math.min(5.0, rawWeight);
        return { quiz: q, weight: cappedWeight };
    });

    // 2. Weighted Random Sampling without replacement (up to 20 items)
    const countToPick = Math.min(20, quizPool.length);
    quizQuestions = weightedSampleWithoutReplacement(quizPool, countToPick);
    quizCurrentIndex = 0;
    userAnswers = new Array(quizQuestions.length).fill('');
    quizDrawingData = {};

    renderQuizQuestion();
    switchView('quiz');
}

function startUnitQuizForLecture(fileNameOrPath) {
    if (!studyData || !studyData.lectures || !fileNameOrPath) return;

    const targetNorm = fileNameOrPath.normalize('NFC');
    const lec = studyData.lectures.find(l => 
        (l.fileName && l.fileName.normalize('NFC') === targetNorm) || 
        (l.relativePath && l.relativePath.normalize('NFC') === targetNorm)
    );

    if (!lec) {
        alert('선택한 단원(강의 노트)을 찾을 수 없습니다.');
        return;
    }

    // Filter quizzes matching this lecture with NFC normalization
    const relNorm = (lec.relativePath || '').normalize('NFC');
    const fileNorm = (lec.fileName || '').normalize('NFC');
    const titleNorm = (lec.title || '').normalize('NFC');

    const quizzes = studyData.quizzes.filter(q => {
        const qFileNorm = (q.noteFileName || '').normalize('NFC');
        const qTitleNorm = (q.lectureTitle || '').normalize('NFC');
        return qFileNorm === relNorm || qFileNorm === fileNorm || qTitleNorm === titleNorm;
    });

    if (!quizzes || quizzes.length === 0) {
        if (lec.subject.includes('(문제)')) {
            alert(`[${lec.title}]\n\n본 단원은 웹 기반 통합 실전 모의고사 모듈입니다.\n[강의 노트 뷰어] 화면에서 바로 풀어보실 수 있습니다.`);
            selectLecture(lec.fileName);
        } else {
            alert(`[${lec.title}]\n\n해당 단원에는 추출된 퀴즈 문항이 없습니다.`);
        }
        return;
    }

    currentQuizMode = 'unit';
    currentQuizUnitTitle = lec.title;
    quizQuestions = [...quizzes];
    quizCurrentIndex = 0;
    userAnswers = new Array(quizQuestions.length).fill('');
    quizDrawingData = {};

    const selectEl = document.getElementById('quiz-unit-select');
    if (selectEl) selectEl.value = lec.fileName;

    renderQuizQuestion();
    switchView('quiz');
}

function startUnitQuizForCurrentLecture() {
    if (!currentLecture) {
        alert('먼저 단원(강의 노트)을 선택해 주세요.');
        return;
    }
    if (currentLecture.quizCount === 0 && currentLecture.subject.includes('(문제)')) {
        selectLecture(currentLecture.fileName);
        return;
    }
    startUnitQuizForLecture(currentLecture.fileName);
}

function onQuizUnitSelectChange(val) {
    if (val === 'all') {
        startQuizMode();
    } else {
        startUnitQuizForLecture(val);
    }
}

function weightedSampleWithoutReplacement(pool, k) {
    const list = [...pool];
    const sampled = [];

    for (let i = 0; i < k; i++) {
        const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
        let randomVal = Math.random() * totalWeight;

        for (let j = 0; j < list.length; j++) {
            randomVal -= list[j].weight;
            if (randomVal <= 0) {
                sampled.push(list[j].quiz);
                list.splice(j, 1);
                break;
            }
        }
    }
    return sampled;
}

function parseQuestionAndOptions(qText) {
    if (!qText) return { prompt: '', options: [] };
    const firstOptIndex = qText.search(/[①②③④⑤]/);
    if (firstOptIndex !== -1) {
        const prompt = qText.slice(0, firstOptIndex).trim();
        const optionsPart = qText.slice(firstOptIndex);
        const options = [];
        const symbols = ['①', '②', '③', '④', '⑤'];
        for (let i = 0; i < symbols.length; i++) {
            const sym = symbols[i];
            const nextSyms = symbols.slice(i + 1).join('');
            const r = new RegExp(`${sym}\\s*([\\s\\S]*?)(?=[${nextSyms}]|$)`);
            const m = optionsPart.match(r);
            if (m) {
                options.push(`${sym} ${m[1].trim()}`);
            }
        }
        if (options.length >= 2) {
            return { prompt, options };
        }
    }
    return { prompt: qText, options: [] };
}

function selectMultipleChoiceOption(optNum) {
    const cards = document.querySelectorAll('.mc-option-card');
    cards.forEach((card, idx) => {
        if (idx + 1 === optNum) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    const quickBtns = document.querySelectorAll('.mc-quick-btn');
    quickBtns.forEach((btn, idx) => {
        if (idx + 1 === optNum) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    const ansInput = document.getElementById('quiz-answer-input');
    if (ansInput) {
        ansInput.value = optNum;
    }

    if (!penRecognizedMap[quizCurrentIndex]) {
        penRecognizedMap[quizCurrentIndex] = {};
    }
    penRecognizedMap[quizCurrentIndex]['default'] = String(optNum);
    userAnswers[quizCurrentIndex] = String(optNum);
}

function renderQuizQuestion() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return;

    // Update Quiz Mode Badge & Header
    const modeBadge = document.getElementById('quiz-mode-badge');
    if (modeBadge) {
        if (currentQuizMode === 'unit') {
            modeBadge.innerHTML = `📘 <strong style="color: #fbbf24;">[단원 집중 복습]</strong> ${escapeHtml(currentQuizUnitTitle)} (총 ${quizQuestions.length}문제)`;
            modeBadge.className = 'quiz-mode-badge unit';
        } else {
            modeBadge.innerHTML = `🎯 <strong style="color: #60a5fa;">[오답 가중치 실전 퀴즈]</strong> (20문제 출제)`;
            modeBadge.className = 'quiz-mode-badge';
        }
    }

    // Reset instant answer box
    const instantBox = document.getElementById('quiz-instant-answer-box');
    if (instantBox) {
        instantBox.style.display = 'none';
        instantBox.className = 'quiz-instant-box';
    }

    // Progress bar
    const progress = ((quizCurrentIndex + 1) / quizQuestions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${progress}%`;

    document.getElementById('quiz-step-indicator').innerText = `문제 ${quizCurrentIndex + 1} / ${quizQuestions.length}`;
    const isRelLaw = currentQ.subject.includes('관계법규');
    const titleColor = isRelLaw ? '#34d399' : '#60a5fa';

    const subjTag = document.getElementById('quiz-subject-tag');
    if (subjTag) {
        subjTag.innerText = `${currentQ.subject} (${currentQ.lectureTitle.split('.')[0] || ''})`;
        subjTag.style.color = titleColor;
    }

    const savedAns = userAnswers[quizCurrentIndex] || '';

    // Check Multiple Choice Options
    const parsedMC = parseQuestionAndOptions(currentQ.question);
    const isMultipleChoice = parsedMC.options.length > 0;

    if (isMultipleChoice) {
        let optionsHtml = '<div class="quiz-mc-options-list">';
        parsedMC.options.forEach((optStr, idx) => {
            const optNum = idx + 1;
            const sym = ['①', '②', '③', '④', '⑤'][idx] || String(optNum);
            const cleanOptText = optStr.replace(/^[①②③④⑤1-5]\s*[\.\)]?\s*/, '');
            const isSelected = savedAns === String(optNum) || savedAns === sym;

            optionsHtml += `
                <div class="mc-option-card ${isSelected ? 'selected' : ''}" onclick="selectMultipleChoiceOption(${optNum})">
                    <span class="mc-opt-num">${sym}</span>
                    <span class="mc-opt-text">${escapeHtml(cleanOptText)}</span>
                </div>
            `;
        });
        optionsHtml += '</div>';

        document.getElementById('quiz-question-text').innerHTML = `
            <div class="quiz-prompt-header ${isRelLaw ? 'rel' : 'prac'}" style="color: ${titleColor};">[${escapeHtml(currentQ.lectureTitle)}] <span style="color: #34d399; font-size: 11px; margin-left: 6px; font-weight: normal;">• 객관식 (보기 클릭 선택)</span></div>
            <div class="quiz-prompt-title">${escapeHtml(parsedMC.prompt)}</div>
            ${optionsHtml}
        `;
    } else {
        document.getElementById('quiz-question-text').innerHTML = `
            <div class="quiz-prompt-header ${isRelLaw ? 'rel' : 'prac'}" style="color: ${titleColor};">[${escapeHtml(currentQ.lectureTitle)}]</div>
            <div class="quiz-prompt-title">${escapeHtml(currentQ.question)}</div>
        `;
    }

    // Detect symbols in question & answer
    const symbols = detectQuizSymbols(currentQ);
    const container = document.getElementById('quiz-inputs-container');
    container.innerHTML = '';

    if (isMultipleChoice) {
        // Multiple-choice mode
        document.getElementById('quiz-input-label').innerText = '✍️ 정답 보기 선택 (보기 카드 클릭 또는 번호 탭)';
        
        let quickBtnsHtml = '<div class="mc-quick-bar">';
        [1, 2, 3, 4, 5].forEach(n => {
            const sym = ['①', '②', '③', '④', '⑤'][n - 1];
            const isSel = savedAns === String(n) || savedAns === sym;
            quickBtnsHtml += `<button type="button" class="mc-quick-btn ${isSel ? 'selected' : ''}" onclick="selectMultipleChoiceOption(${n})">${sym} ${n}번</button>`;
        });
        quickBtnsHtml += '</div>';

        container.innerHTML = `
            ${quickBtnsHtml}
            <input type="text" id="quiz-answer-input" class="quiz-text-input" placeholder="정답 번호 (1~5)" value="${escapeHtml(typeof savedAns === 'string' ? savedAns : '')}" autocomplete="off" onkeydown="handleQuizEnter(event)">
        `;

        setupPenCanvases(['default']);

        const singleInp = document.getElementById('quiz-answer-input');
        if (quizInputMode === 'text') {
            singleInp?.focus();
        }
    } else if (symbols.length > 1) {
        // Multi-blank mode: Create separate input fields for ㉠, ㉡, ㉢
        document.getElementById('quiz-input-label').innerText = `✍️ 빈칸별 정답 입력 (총 ${symbols.length}개 빈칸)`;
        setupPenCanvases(symbols);
        
        const gridEl = document.createElement('div');
        gridEl.className = 'multi-blank-grid';

        const parsedSavedMap = parseUserAnswersToMap(savedAns);

        symbols.forEach((sym, sIdx) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'blank-input-row';
            rowEl.innerHTML = `
                <span class="blank-symbol-badge">${sym}</span>
                <input type="text" class="blank-text-input" data-symbol="${sym}" placeholder="${sym} 빈칸 정답 입력" value="${escapeHtml(parsedSavedMap[sym] || '')}" autocomplete="off" oninput="onQuizInputChanged()">
            `;
            gridEl.appendChild(rowEl);
        });

        container.appendChild(gridEl);

        const inputs = gridEl.querySelectorAll('.blank-text-input');
        inputs.forEach((inp, idx) => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // If subsequent empty inputs exist, move focus to the next empty input
                    const nextEmpty = Array.from(inputs).find((otherInp, oIdx) => oIdx > idx && !otherInp.value.trim());
                    if (nextEmpty) {
                        nextEmpty.focus();
                    } else {
                        checkCurrentQuestionAnswer();
                    }
                }
            });
        });

        if (inputs.length > 0 && quizInputMode === 'text') {
            inputs[0].focus();
        }

    } else {
        // Single-blank mode
        document.getElementById('quiz-input-label').innerText = '✍️ 정답 입력';
        setupPenCanvases(symbols);
        container.innerHTML = `
            <input type="text" id="quiz-answer-input" class="quiz-text-input" placeholder="정답을 입력하고 Enter를 누르세요" value="${escapeHtml(typeof savedAns === 'string' ? savedAns : '')}" autocomplete="off" onkeydown="handleQuizEnter(event)" oninput="onQuizInputChanged()">
        `;
        const singleInp = document.getElementById('quiz-answer-input');
        if (quizInputMode === 'text') {
            singleInp?.focus();
        }
    }

    // Apply Input Mode (Pen vs Keyboard)
    applyQuizInputMode();

    // Buttons
    document.getElementById('btn-prev-quiz').style.visibility = quizCurrentIndex === 0 ? 'hidden' : 'visible';
    const nextBtn = document.getElementById('btn-next-quiz');
    if (quizCurrentIndex === quizQuestions.length - 1) {
        nextBtn.innerText = '🎯 최종 제출 및 채점하기';
        nextBtn.style.background = 'linear-gradient(135deg, var(--accent-emerald), #059669)';
    } else {
        nextBtn.innerText = '다음 문제';
        nextBtn.style.background = 'var(--accent-blue)';
    }
}

// -------------------------------------------------------------
// Tablet & Lenovo/S-Pen Handwriting Canvas Engine (Multi-Blank, AI OCR & Auto-Grading)
// -------------------------------------------------------------
let activeDrawingCanvas = null;
let penRecognizedMap = {}; // { [questionIdx]: { [sym]: string } }
let recognitionTimers = {};

function setupPenCanvases(symbols) {
    const container = document.getElementById('quiz-pen-canvases-container');
    if (!container) return;
    container.innerHTML = '';

    if (!penRecognizedMap[quizCurrentIndex]) {
        penRecognizedMap[quizCurrentIndex] = {};
    }

    if (symbols.length > 1) {
        // Multi-blank mode: Create distinct simultaneous canvas pads for ㉠, ㉡, ㉢
        const gridEl = document.createElement('div');
        gridEl.className = 'multi-canvas-grid';

        symbols.forEach(sym => {
            const savedText = penRecognizedMap[quizCurrentIndex][sym] || '';
            const cardEl = document.createElement('div');
            cardEl.className = 'blank-canvas-card';
            cardEl.innerHTML = `
                <div class="blank-canvas-card-header">
                    <span class="blank-canvas-label">
                        <span class="blank-symbol-badge">${sym}</span>
                        <span>[${sym}] 빈칸 필기 패드</span>
                    </span>
                    <button type="button" class="btn-clear-sub" onclick="clearSpecificBlankCanvas('${sym}')">지우기</button>
                </div>
                <div class="canvas-wrapper sub-canvas-wrapper" id="canvas-wrapper-${sym}">
                    <canvas class="quiz-pen-canvas" data-symbol="${sym}"></canvas>
                    <div class="canvas-guide-hint" id="hint-${sym}">✍️ [${sym}] 정답을 적어보세요</div>
                </div>
                <div class="recognized-result-row" id="rec-row-${sym}">
                    <span class="recognized-badge">${sym} 인식</span>
                    <input type="text" class="recognized-text-input" id="rec-text-${sym}" data-symbol="${sym}" placeholder="손글씨 쓰면 단어 자동 변환..." value="${escapeHtml(savedText)}" oninput="onRecognizedManualEdit('${sym}', this.value)" autocomplete="off">
                    <div class="recognized-candidates" id="rec-cands-${sym}"></div>
                </div>
            `;
            gridEl.appendChild(cardEl);
        });

        container.appendChild(gridEl);
    } else {
        // Single-blank mode
        const savedText = penRecognizedMap[quizCurrentIndex]['default'] || '';
        const wrapperEl = document.createElement('div');
        wrapperEl.className = 'canvas-wrapper';
        wrapperEl.id = 'canvas-wrapper-default';
        wrapperEl.innerHTML = `
            <canvas class="quiz-pen-canvas" data-symbol="default"></canvas>
            <div class="canvas-guide-hint" id="hint-default">✍️ 여기에 레노버 펜으로 정답을 적어보세요</div>
        `;

        const recRow = document.createElement('div');
        recRow.className = 'recognized-result-row';
        recRow.id = 'rec-row-default';
        recRow.style.marginTop = '8px';
        recRow.innerHTML = `
            <span class="recognized-badge">✍️ 변환</span>
            <input type="text" class="recognized-text-input" id="rec-text-default" data-symbol="default" placeholder="손글씨 쓰면 단어 자동 변환..." value="${escapeHtml(savedText)}" oninput="onRecognizedManualEdit('default', this.value)" autocomplete="off">
            <div class="recognized-candidates" id="rec-cands-default"></div>
        `;

        container.appendChild(wrapperEl);
        container.appendChild(recRow);
    }

    attachCanvasPointerEvents();
    setTimeout(resizeQuizPenCanvas, 40);
}

function setQuizInputMode(mode) {
    quizInputMode = mode;
    localStorage.setItem('housing_exam_quiz_input_mode', mode);
    applyQuizInputMode();
}

function applyQuizInputMode() {
    const btnPen = document.getElementById('btn-mode-pen');
    const btnText = document.getElementById('btn-mode-text');
    const textContainer = document.getElementById('quiz-inputs-container');
    const penContainer = document.getElementById('quiz-pen-container');

    if (btnPen && btnText && textContainer && penContainer) {
        if (quizInputMode === 'pen') {
            btnPen.classList.add('active');
            btnText.classList.remove('active');
            textContainer.style.display = 'none';
            penContainer.style.display = 'flex';
            setTimeout(resizeQuizPenCanvas, 50);
        } else {
            btnPen.classList.remove('active');
            btnText.classList.add('active');
            textContainer.style.display = 'block';
            penContainer.style.display = 'none';
            const firstInp = textContainer.querySelector('input');
            firstInp?.focus();
        }
    }
}

function setPenTool(tool) {
    activePenTool = tool;
    const toolPen = document.getElementById('tool-pen');
    const toolEraser = document.getElementById('tool-eraser');
    if (tool === 'pen') {
        toolPen?.classList.add('active');
        toolEraser?.classList.remove('active');
    } else {
        toolPen?.classList.remove('active');
        toolEraser?.classList.add('active');
    }
}

function togglePalmRejection() {
    palmRejectionEnabled = !palmRejectionEnabled;
    const btn = document.getElementById('tool-palm');
    const icon = document.getElementById('palm-status-icon');
    const text = document.getElementById('palm-status-text');
    if (palmRejectionEnabled) {
        btn?.classList.add('active');
        if (icon) icon.innerText = '🛡️';
        if (text) text.innerText = '팜리젝션 ON';
    } else {
        btn?.classList.remove('active');
        if (icon) icon.innerText = '👆';
        if (text) text.innerText = '터치 허용';
    }
}

function clearSpecificBlankCanvas(sym) {
    if (!quizDrawingData[quizCurrentIndex]) return;
    quizDrawingData[quizCurrentIndex][sym] = [];
    if (penRecognizedMap[quizCurrentIndex]) {
        penRecognizedMap[quizCurrentIndex][sym] = '';
    }
    const txtInp = document.getElementById(`rec-text-${sym}`);
    if (txtInp) txtInp.value = '';
    const candsEl = document.getElementById(`rec-cands-${sym}`);
    if (candsEl) candsEl.innerHTML = '';

    const canvas = document.querySelector(`.quiz-pen-canvas[data-symbol="${sym}"]`);
    if (canvas) redrawCanvasStrokesForElement(canvas);
}

function clearPenCanvas() {
    if (!quizDrawingData[quizCurrentIndex]) return;
    quizDrawingData[quizCurrentIndex] = {};
    if (penRecognizedMap[quizCurrentIndex]) {
        penRecognizedMap[quizCurrentIndex] = {};
    }
    const txtInputs = document.querySelectorAll('.recognized-text-input');
    txtInputs.forEach(inp => inp.value = '');
    const candContainers = document.querySelectorAll('.recognized-candidates');
    candContainers.forEach(c => c.innerHTML = '');

    const canvases = document.querySelectorAll('.quiz-pen-canvas');
    canvases.forEach(c => redrawCanvasStrokesForElement(c));
}

function undoPenStroke() {
    if (!quizDrawingData[quizCurrentIndex]) return;
    const sym = currentBlankSymbol || 'default';
    const strokes = quizDrawingData[quizCurrentIndex][sym];
    if (strokes && strokes.length > 0) {
        strokes.pop();
        const canvas = document.querySelector(`.quiz-pen-canvas[data-symbol="${sym}"]`);
        if (canvas) redrawCanvasStrokesForElement(canvas);
        scheduleHandwritingRecognition(sym);
    }
}

let lastStylusEventTime = 0;

// Global Stylus Proximity Tracking (Detects Lenovo/Active Pen hover and touch)
window.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen') {
        lastStylusEventTime = Date.now();
    }
}, { passive: true, capture: true });

window.addEventListener('pointermove', e => {
    if (e.pointerType === 'pen') {
        lastStylusEventTime = Date.now();
    }
}, { passive: true, capture: true });

window.addEventListener('pointerover', e => {
    if (e.pointerType === 'pen') {
        lastStylusEventTime = Date.now();
    }
}, { passive: true, capture: true });

window.addEventListener('pointerenter', e => {
    if (e.pointerType === 'pen') {
        lastStylusEventTime = Date.now();
    }
}, { passive: true, capture: true });

function isStylusNearbyOrActive() {
    return (Date.now() - lastStylusEventTime) < 1500;
}

function initStylusCanvasEvents() {
    attachCanvasPointerEvents();
}

function attachCanvasPointerEvents() {
    const canvases = document.querySelectorAll('.quiz-pen-canvas');
    canvases.forEach(canvas => {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
        canvas.removeEventListener('pointercancel', handlePointerUp);

        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointermove', handlePointerMove);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointercancel', handlePointerUp);

        // Strict Touch Drop (Palm Rejection)
        const blockTouchOnCanvas = (e) => {
            if (palmRejectionEnabled || isStylusNearbyOrActive() || quizInputMode === 'pen') {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        };

        canvas.addEventListener('touchstart', blockTouchOnCanvas, { passive: false });
        canvas.addEventListener('touchmove', blockTouchOnCanvas, { passive: false });
        canvas.addEventListener('touchend', blockTouchOnCanvas, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    });

    // Also guard the entire pen container and cards against palm touch
    const cards = document.querySelectorAll('.blank-canvas-card, #quiz-pen-container');
    cards.forEach(card => {
        const blockCardPalmTouch = (e) => {
            if (e.target.closest('button, input, select, a')) return; // Allow UI buttons
            if (palmRejectionEnabled || isStylusNearbyOrActive() || quizInputMode === 'pen') {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        };
        card.addEventListener('touchstart', blockCardPalmTouch, { passive: false });
        card.addEventListener('touchmove', blockCardPalmTouch, { passive: false });
    });
}

function handlePointerDown(e) {
    // 1. Palm Rejection: If finger touch event while palm rejection is active, drop it!
    if (e.pointerType === 'touch') {
        if (palmRejectionEnabled || isStylusNearbyOrActive() || quizInputMode === 'pen') {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    if (e.pointerType === 'pen') {
        lastStylusEventTime = Date.now();
    }

    const canvas = e.currentTarget;
    if (!canvas) return;

    activeDrawingCanvas = canvas;
    const sym = canvas.getAttribute('data-symbol') || 'default';
    currentBlankSymbol = sym;
    isDrawing = true;

    try {
        canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    const isBarrelEraser = (e.buttons === 32 || e.buttons === 2 || e.button === 5);
    const strokeTool = isBarrelEraser ? 'eraser' : activePenTool;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = (e.pressure && e.pressure > 0) ? e.pressure : 0.5;

    currentStroke = {
        tool: strokeTool,
        color: '#60a5fa',
        size: strokeTool === 'eraser' ? 24 : 3.5,
        points: [{ x, y, p, t: Date.now() }]
    };

    if (!quizDrawingData[quizCurrentIndex]) {
        quizDrawingData[quizCurrentIndex] = {};
    }
    if (!quizDrawingData[quizCurrentIndex][sym]) {
        quizDrawingData[quizCurrentIndex][sym] = [];
    }
    quizDrawingData[quizCurrentIndex][sym].push(currentStroke);

    redrawCanvasStrokesForElement(canvas);
}

function handlePointerMove(e) {
    if (!isDrawing || !currentStroke || !activeDrawingCanvas) return;

    if (e.pointerType === 'touch') {
        if (palmRejectionEnabled || isStylusNearbyOrActive() || quizInputMode === 'pen') {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    if (e.pointerType === 'pen') {
        lastStylusEventTime = Date.now();
    }

    const canvas = activeDrawingCanvas;
    const rect = canvas.getBoundingClientRect();
    const events = (e.getCoalescedEvents && typeof e.getCoalescedEvents === 'function') 
        ? e.getCoalescedEvents() 
        : [e];

    const now = Date.now();
    for (const evt of events) {
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;
        const p = (evt.pressure && evt.pressure > 0) ? evt.pressure : 0.5;
        currentStroke.points.push({ x, y, p, t: now });
    }

    redrawCanvasStrokesForElement(canvas);
}

function handlePointerUp(e) {
    if (e.pointerType === 'touch') {
        if (palmRejectionEnabled || isStylusNearbyOrActive() || quizInputMode === 'pen') {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    if (isDrawing) {
        isDrawing = false;
        currentStroke = null;
    }
    if (activeDrawingCanvas) {
        const sym = activeDrawingCanvas.getAttribute('data-symbol') || 'default';
        try {
            activeDrawingCanvas.releasePointerCapture(e.pointerId);
        } catch (err) {}
        redrawCanvasStrokesForElement(activeDrawingCanvas);
        activeDrawingCanvas = null;

        // Auto recognize handwriting in background
        scheduleHandwritingRecognition(sym);
    }
}

function resizeQuizPenCanvas() {
    if (isDrawing) return; // Never interrupt active drawing!

    const canvases = document.querySelectorAll('.quiz-pen-canvas');
    if (!canvases || canvases.length === 0) return;
    const dpr = window.devicePixelRatio || 1;

    canvases.forEach(canvas => {
        const wrapper = canvas.parentElement;
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0) return;

        const isSub = wrapper.classList.contains('sub-canvas-wrapper');
        const targetHeight = isSub ? 150 : 180;
        const currentTargetWidth = Math.round(rect.width);

        // Only resize if width or height actually changed by >= 2px
        if (canvas._lastWidth && Math.abs(canvas._lastWidth - currentTargetWidth) < 2 && canvas._lastHeight === targetHeight) {
            return;
        }
        canvas._lastWidth = currentTargetWidth;
        canvas._lastHeight = targetHeight;

        canvas.width = currentTargetWidth * dpr;
        canvas.height = targetHeight * dpr;
        canvas.style.width = `${currentTargetWidth}px`;
        canvas.style.height = `${targetHeight}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        redrawCanvasStrokesForElement(canvas);
    });
}

function redrawCanvasStrokesForElement(canvas) {
    if (!canvas) return;
    const sym = canvas.getAttribute('data-symbol') || 'default';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    // Draw notebook baseline guide
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(12, height * 0.5);
    ctx.lineTo(width - 12, height * 0.5);
    ctx.moveTo(12, height * 0.82);
    ctx.lineTo(width - 12, height * 0.82);
    ctx.stroke();
    ctx.setLineDash([]);

    const strokes = (quizDrawingData[quizCurrentIndex] && quizDrawingData[quizCurrentIndex][sym]) || [];
    const hintEl = canvas.parentElement?.querySelector('.canvas-guide-hint');
    if (hintEl) {
        if (strokes.length > 0) {
            hintEl.classList.add('hidden');
        } else {
            hintEl.classList.remove('hidden');
            const symText = sym !== 'default' ? `[${sym}] 정답을 ` : '정답을 ';
            hintEl.innerText = `✍️ 여기에 레노버 펜으로 ${symText}적어보세요`;
        }
    }

    // Render strokes
    strokes.forEach(strk => {
        if (!strk.points || strk.points.length === 0) return;

        if (strk.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = strk.size || 24;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = strk.color || '#60a5fa';
            ctx.fillStyle = strk.color || '#60a5fa';
        }

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (strk.points.length === 1) {
            const pt = strk.points[0];
            const radius = (strk.size || 3.5) * (pt.p * 0.8 + 0.5);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            ctx.fill();
        } else {
            for (let i = 1; i < strk.points.length; i++) {
                const prev = strk.points[i - 1];
                const curr = strk.points[i];
                const pMid = (prev.p + curr.p) / 2;
                const dynamicWidth = (strk.tool === 'eraser') ? (strk.size || 24) : ((strk.size || 3.5) * (pMid * 1.2 + 0.4));

                ctx.lineWidth = dynamicWidth;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(curr.x, curr.y);
                ctx.stroke();
            }
        }
    });

    ctx.restore();
}

// -------------------------------------------------------------
// Real-time Handwriting-to-Text Recognition Engine (Google Digital Ink)
// -------------------------------------------------------------
function scheduleHandwritingRecognition(sym) {
    if (recognitionTimers[sym]) {
        clearTimeout(recognitionTimers[sym]);
    }

    const candsEl = document.getElementById(`rec-cands-${sym}`);
    if (candsEl) {
        candsEl.innerHTML = '<span class="recognizing-spinner">🔄</span>';
    }

    recognitionTimers[sym] = setTimeout(async () => {
        const strokes = (quizDrawingData[quizCurrentIndex] && quizDrawingData[quizCurrentIndex][sym]) || [];
        if (strokes.length === 0) {
            if (candsEl) candsEl.innerHTML = '';
            return;
        }

        const candidates = await recognizeHandwritingFromStrokes(strokes);
        if (candidates && candidates.length > 0) {
            const topCand = candidates[0];
            if (!penRecognizedMap[quizCurrentIndex]) {
                penRecognizedMap[quizCurrentIndex] = {};
            }
            penRecognizedMap[quizCurrentIndex][sym] = topCand;

            const txtInp = document.getElementById(`rec-text-${sym}`);
            if (txtInp) {
                txtInp.value = topCand;
            }

            if (candsEl) {
                candsEl.innerHTML = '';
                // Limit candidate chips to max 2 items to prevent any overflow
                candidates.slice(1, 3).forEach(cand => {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'candidate-chip';
                    chip.innerText = cand;
                    chip.onclick = () => selectCandidateChip(sym, cand);
                    candsEl.appendChild(chip);
                });
            }
        } else {
            if (candsEl) candsEl.innerHTML = '';
        }
    }, 450);
}

function selectCandidateChip(sym, cand) {
    if (!penRecognizedMap[quizCurrentIndex]) {
        penRecognizedMap[quizCurrentIndex] = {};
    }
    penRecognizedMap[quizCurrentIndex][sym] = cand;
    const txtInp = document.getElementById(`rec-text-${sym}`);
    if (txtInp) txtInp.value = cand;
}

function onRecognizedManualEdit(sym, val) {
    if (!penRecognizedMap[quizCurrentIndex]) {
        penRecognizedMap[quizCurrentIndex] = {};
    }
    penRecognizedMap[quizCurrentIndex][sym] = val.trim();
}

async function recognizeHandwritingFromStrokes(strokes, width = 400, height = 200) {
    if (!strokes || strokes.length === 0) return [];

    const ink = [];
    const baseTime = strokes[0]?.points[0]?.t || Date.now();

    strokes.forEach(strk => {
        if (strk.tool === 'eraser' || !strk.points || strk.points.length === 0) return;
        const xs = [];
        const ys = [];
        const ts = [];
        strk.points.forEach((pt, idx) => {
            xs.push(Math.round(pt.x));
            ys.push(Math.round(pt.y));
            ts.push(pt.t ? Math.max(0, pt.t - baseTime) : idx * 20);
        });
        if (xs.length > 0) {
            ink.push([xs, ys, ts]);
        }
    });

    if (ink.length === 0) return [];

    const payload = {
        app_version: 0.4,
        api_level: '537.36',
        device: '537.36',
        input_type: '0',
        options: 'enable_pre_space',
        requests: [{
            writing_guide: {
                writing_area_width: width,
                writing_area_height: height
            },
            pre_context: '',
            max_num_results: 5,
            max_completions: 0,
            language: 'ko',
            ink: ink
        }]
    };

    try {
        const response = await fetch('https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            if (data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
                return data[1][0][1];
            }
        }
    } catch (e) {
        console.warn('Handwriting API fetch error', e);
    }
    return [];
}

// -------------------------------------------------------------
// Pen Mode Self-Grading (자가 채점 핸들러)
// -------------------------------------------------------------
function setPenQuestionGrading(isCorrect) {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return;

    userAnswers[quizCurrentIndex] = isCorrect ? '(펜필기: 정답)' : '(펜필기: 오답)';

    if (!quizStats[currentQ.id]) {
        quizStats[currentQ.id] = { wrongCount: 0, tryCount: 0 };
    }
    quizStats[currentQ.id].tryCount += 1;

    if (!isCorrect) {
        quizStats[currentQ.id].wrongCount += 1;
    } else if (quizStats[currentQ.id].wrongCount > 0) {
        quizStats[currentQ.id].wrongCount = Math.max(0, quizStats[currentQ.id].wrongCount - 1);
    }
    saveLocalStats();

    const box = document.getElementById('quiz-instant-answer-box');
    const headerEl = document.getElementById('quiz-instant-header');
    const btnCorrect = document.getElementById('btn-self-correct');
    const btnWrong = document.getElementById('btn-self-wrong');

    if (isCorrect) {
        box.className = 'quiz-instant-box correct';
        headerEl.innerHTML = '⭕ [자가 채점] 정답으로 기록되었습니다 (+1점) 🎉';
        btnCorrect?.classList.add('selected');
        btnWrong?.classList.remove('selected');
    } else {
        box.className = 'quiz-instant-box';
        headerEl.innerHTML = '❌ [자가 채점] 오답으로 기록되었습니다 (오답 가중치 반영)';
        btnCorrect?.classList.remove('selected');
        btnWrong?.classList.add('selected');
    }
}

function detectQuizSymbols(q) {
    const questionText = q.question || '';
    const found = [...questionText.matchAll(/[㉠㉡㉢㉣㉤]/g)].map(m => m[0]);
    return [...new Set(found)];
}

function parseUserAnswersToMap(ansVal) {
    if (typeof ansVal === 'object' && ansVal !== null) return ansVal;
    const map = {};
    if (typeof ansVal === 'string') {
        const matches = [...ansVal.matchAll(/([㉠㉡㉢㉣㉤])\s*([^㉠㉡㉢㉣㉤,;]+)/g)];
        matches.forEach(m => {
            map[m[1]] = m[2].trim();
        });
    }
    return map;
}

function getUserInputAnswer() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return '';

    const symbols = detectQuizSymbols(currentQ);

    // If Pen Mode: Prefer recognized text from handwriting
    if (quizInputMode === 'pen') {
        const recMap = (penRecognizedMap && penRecognizedMap[quizCurrentIndex]) || {};
        if (symbols.length > 1) {
            const combinedParts = [];
            symbols.forEach(sym => {
                const val = (recMap[sym] || '').trim();
                if (val) {
                    combinedParts.push(`${sym} ${val}`);
                }
            });
            if (combinedParts.length > 0) {
                return combinedParts.join(', ');
            }
        } else {
            const val = (recMap['default'] || '').trim();
            if (val) return val;
        }
    }

    // Keyboard / Standard Text Mode
    if (symbols.length > 1) {
        const inputs = document.querySelectorAll('.blank-text-input');
        let combinedParts = [];
        inputs.forEach(inp => {
            const sym = inp.getAttribute('data-symbol');
            const val = inp.value.trim();
            if (sym && val) {
                combinedParts.push(`${sym} ${val}`);
            }
        });
        return combinedParts.join(', ');
    } else {
        const inp = document.getElementById('quiz-answer-input');
        return inp ? inp.value.trim() : '';
    }
}

function getUserInputAnswerMap() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return {};

    const symbols = detectQuizSymbols(currentQ);
    const map = {};
    if (symbols.length > 1) {
        const inputs = document.querySelectorAll('.blank-text-input');
        inputs.forEach(inp => {
            const sym = inp.getAttribute('data-symbol');
            const val = inp.value.trim();
            if (sym) map[sym] = val;
        });
    } else {
        const inp = document.getElementById('quiz-answer-input');
        map['default'] = inp ? inp.value.trim() : '';
    }
    return map;
}

function showInstantAnswer() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return;

    userAnswers[quizCurrentIndex] = '(모름/정답확인)';

    if (!quizStats[currentQ.id]) {
        quizStats[currentQ.id] = { wrongCount: 0, tryCount: 0 };
    }
    quizStats[currentQ.id].wrongCount += 1;
    quizStats[currentQ.id].tryCount += 1;
    saveLocalStats();

    const box = document.getElementById('quiz-instant-answer-box');
    const headerEl = document.getElementById('quiz-instant-header');
    const ansTextEl = document.getElementById('quiz-instant-ans-text');
    const linkBtn = document.getElementById('quiz-instant-link-btn');
    const selfGradeBox = document.getElementById('pen-self-grade-container');

    if (selfGradeBox) selfGradeBox.style.display = 'none';

    box.className = 'quiz-instant-box';
    if (headerEl) {
        headerEl.innerHTML = '💡 정답 확인 (오답/모름 처리됨)';
    }
    ansTextEl.innerHTML = `법정 정답: <span style="color: #34d399; font-size: 16px;">${escapeHtml(currentQ.answerRaw)}</span>`;

    const lecContextEl = document.getElementById('quiz-instant-lecture-title');
    if (lecContextEl) {
        let cleanLecTitle = (currentQ.lectureTitle || '').replace(/^\[+|\]+$/g, '').trim();
        lecContextEl.innerText = `[${currentQ.subject}] ${cleanLecTitle}`;
        lecContextEl.title = `[${currentQ.subject}] ${cleanLecTitle}`;
    }

    linkBtn.onclick = () => selectLecture(currentQ.noteFileName, currentQ.anchorId);
    box.style.display = 'block';
}

function checkCurrentQuestionAnswer() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return;

    const inputVal = getUserInputAnswer();
    const box = document.getElementById('quiz-instant-answer-box');
    const headerEl = document.getElementById('quiz-instant-header');
    const ansTextEl = document.getElementById('quiz-instant-ans-text');
    const linkBtn = document.getElementById('quiz-instant-link-btn');
    const selfGradeBox = document.getElementById('pen-self-grade-container');
    const btnCorrect = document.getElementById('btn-self-correct');
    const btnWrong = document.getElementById('btn-self-wrong');
    const lecContextEl = document.getElementById('quiz-instant-lecture-title');

    btnCorrect?.classList.remove('selected');
    btnWrong?.classList.remove('selected');

    if (lecContextEl) {
        let cleanLecTitle = (currentQ.lectureTitle || '').replace(/^\[+|\]+$/g, '').trim();
        lecContextEl.innerText = `[${currentQ.subject}] ${cleanLecTitle}`;
        lecContextEl.title = `[${currentQ.subject}] ${cleanLecTitle}`;
    }

    // In Pen Mode with no text typed: Display answer and allow Self-Grading
    if (quizInputMode === 'pen' && !inputVal) {
        box.className = 'quiz-instant-box';
        headerEl.innerHTML = '💡 법정 정답 확인 및 자가 채점';
        ansTextEl.innerHTML = `법정 정답: <span style="color: #34d399; font-size: 16px;">${escapeHtml(currentQ.answerRaw)}</span>`;
        if (selfGradeBox) selfGradeBox.style.display = 'flex';
        linkBtn.onclick = () => selectLecture(currentQ.noteFileName, currentQ.anchorId);
        box.style.display = 'block';
        return;
    }

    if (!inputVal) {
        alert('답안을 입력한 후 정답 확인을 눌러주세요. (모를 때는 [💡 모르겠어요] 클릭)');
        return;
    }

    if (selfGradeBox) selfGradeBox.style.display = 'none';
    userAnswers[quizCurrentIndex] = inputVal;

    const isCorrect = checkAnswerCorrectness(inputVal, currentQ.answerRaw);

    if (!quizStats[currentQ.id]) {
        quizStats[currentQ.id] = { wrongCount: 0, tryCount: 0 };
    }
    quizStats[currentQ.id].tryCount += 1;

    if (!isCorrect) {
        quizStats[currentQ.id].wrongCount += 1;
    } else if (quizStats[currentQ.id].wrongCount > 0) {
        quizStats[currentQ.id].wrongCount = Math.max(0, quizStats[currentQ.id].wrongCount - 1);
    }
    saveLocalStats();

    if (isCorrect) {
        box.className = 'quiz-instant-box correct';
        headerEl.innerHTML = '⭕ 축하합니다! 정답입니다 🎉';
        ansTextEl.innerHTML = `법정 정답: <span style="color: #34d399; font-size: 16px;">${escapeHtml(currentQ.answerRaw)}</span>`;
    } else {
        box.className = 'quiz-instant-box';
        headerEl.innerHTML = '❌ 오답입니다 (정답 및 법정 해설)';
        ansTextEl.innerHTML = `내 제출답: <span style="color: #f87171;">${escapeHtml(inputVal)}</span> | 법정 정답: <span style="color: #34d399; font-size: 16px;">${escapeHtml(currentQ.answerRaw)}</span>`;
    }

    linkBtn.onclick = () => selectLecture(currentQ.noteFileName, currentQ.anchorId);
    box.style.display = 'block';
}

function onQuizInputChanged() {
    const box = document.getElementById('quiz-instant-answer-box');
    if (box && box.style.display !== 'none') {
        box.style.display = 'none';
    }
}

function handleQuizEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        checkCurrentQuestionAnswer();
    }
}

function saveCurrentQuizAnswer() {
    const inputVal = getUserInputAnswer();
    const currentAns = userAnswers[quizCurrentIndex] || '';
    if (!inputVal && (currentAns === '(모름/정답확인)' || currentAns.startsWith('(펜필기:'))) {
        return;
    }
    userAnswers[quizCurrentIndex] = inputVal;
}

function prevQuizQuestion() {
    saveCurrentQuizAnswer();
    if (quizCurrentIndex > 0) {
        quizCurrentIndex--;
        renderQuizQuestion();
    }
}

function nextQuizQuestion() {
    saveCurrentQuizAnswer();
    if (quizCurrentIndex < quizQuestions.length - 1) {
        quizCurrentIndex++;
        renderQuizQuestion();
    } else {
        finishAndGradeQuiz();
    }
}

// -------------------------------------------------------------
// Grading & Result Evaluation (Smart Fuzzy Matcher)
// -------------------------------------------------------------
function finishAndGradeQuiz() {
    let correctCount = 0;
    const results = [];

    quizQuestions.forEach((q, idx) => {
        const uAns = userAnswers[idx] || '';
        let isCorrect = false;

        if (uAns === '(펜필기: 정답)') {
            isCorrect = true;
        } else if (uAns === '(펜필기: 오답)' || uAns === '(모름/정답확인)') {
            isCorrect = false;
        } else {
            isCorrect = checkAnswerCorrectness(uAns, q.answerRaw);
        }

        if (isCorrect) correctCount++;

        if (!quizStats[q.id]) {
            quizStats[q.id] = { wrongCount: 0, tryCount: 0 };
        }
        quizStats[q.id].tryCount += 1;
        if (!isCorrect) {
            quizStats[q.id].wrongCount += 1;
        } else if (quizStats[q.id].wrongCount > 0) {
            quizStats[q.id].wrongCount = Math.max(0, quizStats[q.id].wrongCount - 1);
        }

        results.push({
            question: q,
            userAns: uAns || (quizInputMode === 'pen' ? '(펜 필기 답안)' : '(미입력)'),
            isCorrect: isCorrect
        });
    });

    saveLocalStats();
    renderQuizResult(correctCount, quizQuestions.length, results);
}

function normalizeFractionAndUnits(text) {
    if (!text) return '';
    let s = text.trim();
    // Normalize Korean fractions: '150분의 1', '150분의1', '150 분의 1' -> '1/150'
    s = s.replace(/(\d+)\s*분\s*의\s*(\d+)/g, '$2/$1');
    // Normalize spaces around slash in fractions
    s = s.replace(/(\d+)\s*\/\s*(\d+)/g, '$1/$2');
    return s;
}

function normalizeAnswerText(text) {
    if (!text) return '';
    return text
        .replace(/[㉠㉡㉢㉣㉤]/g, ' ')
        .replace(/[,;:|\\()\[\]·•]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function stripUnits(token) {
    if (!token) return '';
    return token
        .replace(/(\d+)(일|명|년|개월|월|주|개|원|만원|억원|세대|호|%|퍼센트|m|미터|km|cm|mm|m2|㎡|평|층|회|배|시간|분|초|kg|톤|l|리터|도|lux|룩스|v|볼트|w|와트|kw|a|암페어|db|데시벨)$/i, '$1')
        .replace(/(\d+)천만원?/i, '$1000만')
        .replace(/(\d+)천만/i, '$1000만')
        .replace(/(\d+)천/i, '$1000')
        .replace(/,/g, '');
}

function isNumericOrFraction(val) {
    return /^[\d\/\.\%]+$/.test(val.replace(/\s+/g, ''));
}

function extractSymbolAnswers(text) {
    if (!text) return null;
    const map = {};
    const symbols = ['㉠', '㉡', '㉢', '㉣', '㉤', '㉥', '㉦', '㉧'];
    const hasSymbols = symbols.some(s => text.includes(s));
    if (!hasSymbols) return null;

    const allSymsStr = symbols.join('');
    for (let i = 0; i < symbols.length; i++) {
        const sym = symbols[i];
        if (!text.includes(sym)) continue;
        const regex = new RegExp(`${sym}\\s*([^${allSymsStr}]+)`, 'i');
        const match = text.match(regex);
        if (match) {
            let val = match[1].trim();
            val = val.replace(/^[|,;/\s]+|[|,;/\s]+$/g, '').trim();
            map[sym] = val;
        }
    }
    return map;
}

function checkAnswerCorrectness(userAns, realAnsRaw) {
    if (!userAns || !realAnsRaw) return false;

    // 1. Symbol-based multi-blank matching
    const realMap = extractSymbolAnswers(realAnsRaw);
    const userMap = extractSymbolAnswers(userAns);

    if (realMap && Object.keys(realMap).length > 0) {
        const realKeys = Object.keys(realMap);
        
        let uAnswers = userMap;
        if (!uAnswers || Object.keys(uAnswers).length === 0) {
            uAnswers = {};
            const userTokens = userAns.split(/[,|\n;/]+/).map(t => t.trim()).filter(Boolean);
            realKeys.forEach((sym, idx) => {
                if (userTokens[idx]) {
                    uAnswers[sym] = userTokens[idx];
                }
            });
        }

        // Every blank symbol in realAnsRaw MUST be correctly answered
        for (const sym of realKeys) {
            const realVal = realMap[sym];
            const userVal = uAnswers[sym] || '';

            if (!userVal) return false; // Missing answer for this symbol
            const matched = checkSingleBlankValue(userVal, realVal);
            if (!matched) return false; // Wrong answer for this symbol
        }

        return true; // All symbols correctly answered!
    }

    // 2. Single-blank matching
    return checkSingleBlankValue(userAns, realAnsRaw);
}

function normalizeMcAnswer(val) {
    if (!val) return '';
    let str = String(val).trim();
    str = str.replace(/\[정답:\s*(\d+)번?\]/i, '$1');
    str = str.replace(/(\d+)번/, '$1');
    str = str.replace(/①/g, '1').replace(/②/g, '2').replace(/③/g, '3').replace(/④/g, '4').replace(/⑤/g, '5');
    return str.trim();
}

function checkSingleBlankValue(userVal, realValRaw) {
    if (!userVal || !realValRaw) return false;

    // Check multiple-choice numeric equality (1~5, ①~⑤, [정답: X번])
    const normUserMc = normalizeMcAnswer(userVal);
    const normRealMc = normalizeMcAnswer(realValRaw);
    if (normUserMc && normRealMc && /^[1-5]$/.test(normUserMc) && /^[1-5]$/.test(normRealMc)) {
        return normUserMc === normRealMc;
    }

    // 1. Normalize fractions in both userVal and realValRaw first
    const normUserVal = normalizeFractionAndUnits(userVal);
    let normRealValRaw = normalizeFractionAndUnits(realValRaw);

    // 2. Protect fractions (e.g. '1/150' -> '__FRAC_1_150__')
    normRealValRaw = normRealValRaw.replace(/(\d+)\/(\d+)/g, '__FRAC_$1_$2__');

    const optionsSet = new Set();
    const primarySplits = normRealValRaw.split(/\(또는\s*|또는\s*|\/|\|/).filter(Boolean);
    
    primarySplits.forEach(str => {
        let cleanStr = str.replace(/__FRAC_(\d+)_(\d+)__/g, '$1/$2').trim();
        if (cleanStr) optionsSet.add(cleanStr);
        const parenMatch = cleanStr.match(/^([^(]+)\(([^)]+)\)/);
        if (parenMatch) {
            const outside = parenMatch[1].trim();
            const inside = parenMatch[2].replace(/^또는\s*/, '').trim();
            if (outside) optionsSet.add(outside);
            if (inside) optionsSet.add(inside);
        }
    });

    const options = Array.from(optionsSet);
    const userClean = normalizeAnswerText(normUserVal).replace(/\s+/g, '');
    const userCleanNoUnits = stripUnits(userClean);

    for (const opt of options) {
        const optNorm = normalizeFractionAndUnits(opt);
        const optClean = normalizeAnswerText(optNorm).replace(/\s+/g, '');
        const optCleanNoUnits = stripUnits(optClean);

        // Exact match check
        if (userClean === optClean || userCleanNoUnits === optCleanNoUnits) {
            return true;
        }

        // If numeric or fraction, NEVER do fuzzy substring inclusion
        if (isNumericOrFraction(userCleanNoUnits) || isNumericOrFraction(optCleanNoUnits)) {
            continue;
        }

        // Text fuzzy match (only for non-numeric words >= 2 chars, with close length)
        if (optClean.length >= 2 && userClean.length >= 2) {
            if (userClean === optClean || (userClean.includes(optClean) && Math.abs(userClean.length - optClean.length) <= 2)) {
                return true;
            }
        }
    }

    return false;
}

function renderQuizResult(correctCount, totalCount, results) {
    const score = Math.round((correctCount / totalCount) * 100);
    document.getElementById('result-score-text').innerText = `${score}점`;
    document.getElementById('result-summary-text').innerText = `총 ${totalCount}문항 중 ${correctCount}문항을 맞히셨습니다!`;

    const container = document.getElementById('result-list-container');
    container.innerHTML = '';

    results.forEach((res, idx) => {
        const itemEl = document.createElement('div');
        itemEl.className = `result-item ${res.isCorrect ? 'correct' : 'wrong'}`;

        let cleanLecTitle = res.question.lectureTitle || '';
        cleanLecTitle = cleanLecTitle.replace(/^\[+|\]+$/g, '').trim();

        itemEl.innerHTML = `
            <div class="result-header-row">
                <span class="result-q-num">문제 ${idx + 1}</span>
                <span class="result-status-badge ${res.isCorrect ? 'correct' : 'wrong'}">
                    ${res.isCorrect ? '⭕ 정답' : '❌ 오답'}
                </span>
            </div>
            <div class="result-q-title">${escapeHtml(res.question.question)}</div>
            <div class="ans-comparison">
                <div class="ans-row">
                    <span style="width: 80px; color: var(--text-dim);">내 제출답:</span>
                    <span class="${res.isCorrect ? 'real-ans' : 'my-ans'}">${escapeHtml(res.userAns || '(미입력)')}</span>
                </div>
                <div class="ans-row">
                    <span style="width: 80px; color: var(--text-dim);">법정 정답:</span>
                    <span class="real-ans">${escapeHtml(res.question.answerRaw)}</span>
                </div>
            </div>
            <div class="result-review-row">
                <button type="button" class="btn-deeplink" onclick="selectLecture('${res.question.noteFileName}', '${res.question.anchorId}')">
                    📖 해당 강의 노트 원본 복습하기 ➔
                </button>
                <span class="result-lecture-context" title="[${escapeHtml(res.question.subject)}] ${escapeHtml(cleanLecTitle)}">
                    [${escapeHtml(res.question.subject)}] ${escapeHtml(cleanLecTitle)}
                </span>
            </div>
        `;
        container.appendChild(itemEl);
    });

    document.getElementById('btn-tab-result').style.display = 'inline-flex';
    switchView('result');
}

// -------------------------------------------------------------
// Global Search (Enhanced Smart Multi-Token Search Engine)
// -------------------------------------------------------------
function handleGlobalSearch(e) {
    const query = e.target.value.trim();
    if (!query) {
        if (currentView === 'search') switchView('viewer');
        return;
    }

    if (e.key === 'Enter' || query.length >= 2) {
        performSearch(query);
    }
}

function normalizeForSearch(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[\s\cdot·,.\(\)\[\]\-_:;]/g, '');
}

function highlightSearchTerms(text, tokens) {
    if (!text || !tokens || tokens.length === 0) return escapeHtml(text);
    let escapedText = escapeHtml(text);
    tokens.forEach(t => {
        if (!t) return;
        const escToken = escapeHtml(t);
        const regex = new RegExp(`(${escToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        escapedText = escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
    return escapedText;
}

function performSearch(rawQuery) {
    const trimmed = rawQuery.trim().toLowerCase();
    if (!trimmed) return;

    // Split query by whitespace into search tokens (e.g. "주택 수용" -> ["주택", "수용"])
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const normalizedTokens = tokens.map(t => normalizeForSearch(t));

    const matchedLectures = [];

    studyData.lectures.forEach(lec => {
        let matchScore = 0;
        const matches = [];
        const matchedTokensSet = new Set();

        const lecTitleNorm = normalizeForSearch(lec.title);
        const lecFileNorm = normalizeForSearch(lec.fileName);

        // Check Lecture Title
        let titleTokensHit = 0;
        normalizedTokens.forEach((normT, idx) => {
            if (lecTitleNorm.includes(normT) || lecFileNorm.includes(normT)) {
                titleTokensHit++;
                matchedTokensSet.add(tokens[idx]);
            }
        });
        if (titleTokensHit === normalizedTokens.length) {
            matchScore += 100 + (titleTokensHit * 10);
            matches.push({ type: 'title', text: `강의 제목: ${lec.title}` });
        } else if (titleTokensHit > 0) {
            matchScore += titleTokensHit * 15;
            matches.push({ type: 'title', text: `강의 제목(부분): ${lec.title}` });
        }

        // Check SubHeadings (Sub-sections)
        lec.subHeadings.forEach(sh => {
            const shNorm = normalizeForSearch(sh);
            let shHit = 0;
            normalizedTokens.forEach((normT, idx) => {
                if (shNorm.includes(normT)) {
                    shHit++;
                    matchedTokensSet.add(tokens[idx]);
                }
            });
            if (shHit === normalizedTokens.length) {
                matchScore += 50 + (shHit * 5);
                matches.push({ type: 'sub', text: `소단원 목차: ${sh}` });
            } else if (shHit > 0) {
                matchScore += shHit * 8;
                matches.push({ type: 'sub', text: `소단원 목차: ${sh}` });
            }
        });

        // Check Related Quizzes
        const relatedQuizzes = studyData.quizzes.filter(q => q.noteFileName === lec.fileName);
        let quizMatchesCount = 0;
        relatedQuizzes.forEach(q => {
            const qNorm = normalizeForSearch(q.question + ' ' + q.answerRaw);
            let qHit = 0;
            normalizedTokens.forEach((normT, idx) => {
                if (qNorm.includes(normT)) {
                    qHit++;
                    matchedTokensSet.add(tokens[idx]);
                }
            });
            if (qHit === normalizedTokens.length) {
                matchScore += 30;
                if (quizMatchesCount < 3) {
                    matches.push({ type: 'quiz', text: `퀴즈 ${q.num}번: ${q.question}` });
                    quizMatchesCount++;
                }
            } else if (qHit > 0) {
                matchScore += qHit * 3;
                if (quizMatchesCount < 2) {
                    matches.push({ type: 'quiz', text: `퀴즈 ${q.num}번: ${q.question}` });
                    quizMatchesCount++;
                }
            }
        });

        // Lecture passes if ALL search tokens are matched somewhere in the lecture
        const allTokensMatched = tokens.every(t => matchedTokensSet.has(t));
        if (allTokensMatched && matchScore > 0) {
            matchedLectures.push({ lec, matchScore, matches, matchedTokens: Array.from(matchedTokensSet) });
        }
    });

    // Sort matched lectures by matchScore descending
    matchedLectures.sort((a, b) => b.matchScore - a.matchScore);

    renderSearchResults(rawQuery, tokens, matchedLectures);
    switchView('search');
}

function renderSearchResults(rawQuery, tokens, results) {
    const container = document.getElementById('search-results-container');
    container.innerHTML = `
        <div style="color: var(--text-muted); margin-bottom: 16px; font-size: 14px;">
            🔍 '<strong>${escapeHtml(rawQuery)}</strong>' 검색 결과 (총 <strong>${results.length}</strong>건의 강좌 매칭)
        </div>
    `;

    if (results.length === 0) {
        container.innerHTML += `
            <div style="padding: 50px 20px; text-align: center; color: var(--text-dim); background: var(--bg-card); border-radius: 12px; border: 1px dashed var(--border-color);">
                <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 6px; color: var(--text-main);">검색된 강의 노트가 없습니다.</div>
                <div style="font-size: 13px;">입력하신 단어들(${tokens.map(t => `'${escapeHtml(t)}'`).join(', ')})을 모두 포함하는 강의가 없습니다. 다른 단어나 더 짧은 키워드로 검색해 보세요.</div>
            </div>
        `;
        return;
    }

    results.forEach(({ lec, matches }) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'result-item';
        itemEl.style.cssText = 'cursor: pointer; transition: all 0.2s ease; margin-bottom: 12px;';
        itemEl.onclick = () => selectLecture(lec.fileName);

        // Deduplicate matches text for clean display
        const uniqueMatches = [];
        const seen = new Set();
        matches.forEach(m => {
            if (!seen.has(m.text)) {
                seen.add(m.text);
                uniqueMatches.push(m);
            }
        });

        itemEl.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <span class="result-q-num" style="font-weight: bold; font-size: 12px; padding: 2px 8px; border-radius: 4px; background: rgba(59, 130, 246, 0.1); color: var(--accent-blue);">[${escapeHtml(lec.subject)}] ${escapeHtml(lec.fileName)}</span>
                <span style="font-size: 11px; color: var(--text-dim);">${lec.quizCount}개 퀴즈</span>
            </div>
            <div class="result-q-title" style="color: #3b82f6; font-size: 16px; font-weight: bold; margin-bottom: 8px;">
                ${highlightSearchTerms(lec.title, tokens)}
            </div>
            <div style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border-color); padding-top: 8px;">
                ${uniqueMatches.slice(0, 4).map(m => `
                    <div style="line-height: 1.5; color: var(--text-main); font-size: 12.5px;">
                        • ${highlightSearchTerms(m.text, tokens)}
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(itemEl);
    });
}

// -------------------------------------------------------------
// Navigation & Views
// -------------------------------------------------------------
function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-item').forEach(b => b.classList.remove('active'));

    if (viewName === 'viewer') {
        document.getElementById('panel-viewer').classList.add('active');
        document.getElementById('btn-tab-viewer')?.classList.add('active');
        document.getElementById('m-nav-viewer')?.classList.add('active');
    } else if (viewName === 'quiz') {
        document.getElementById('panel-quiz').classList.add('active');
        document.getElementById('btn-tab-quiz')?.classList.add('active');
        document.getElementById('m-nav-quiz')?.classList.add('active');
        setTimeout(resizeQuizPenCanvas, 60);
    } else if (viewName === 'result') {
        document.getElementById('panel-result').classList.add('active');
        document.getElementById('btn-tab-result')?.classList.add('active');
        document.getElementById('m-nav-result')?.classList.add('active');
    } else if (viewName === 'search') {
        document.getElementById('panel-search').classList.add('active');
        document.getElementById('m-nav-search')?.classList.add('active');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&nbsp;/gi, ' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
