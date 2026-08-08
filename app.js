// Housing Manager Exam Smart Learning Platform JS App

let studyData = {
    lectures: [],
    quizzes: []
};

let currentView = 'viewer';
let currentSubjectFilter = '관계법규';
let currentLecture = null;
let clozeMaskEnabled = false;

// Quiz Mode State
let currentQuizMode = 'all'; // 'all' (전범위) or 'unit' (단원별)
let currentQuizUnitTitle = '';

// Quiz State
let quizQuestions = [];
let quizCurrentIndex = 0;
let userAnswers = [];
let quizStats = {}; // LocalStorage synced: { quizId: { wrongCount, tryCount, weight } }

document.addEventListener('DOMContentLoaded', async () => {
    loadLocalStats();
    initSidebarState();
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
    if (chipRelTest) chipRelTest.innerText = `법규문 (${relTestCount})`;

    const chipPracTest = document.getElementById('chip-prac-test');
    if (chipPracTest) chipPracTest.innerText = `실무문 (${pracTestCount})`;
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

        const badgeClass = lec.subject.includes('관계법규') ? 'rel' : (lec.subject.includes('관리실무') ? 'prac' : 'etc');

        let subHeadingsHtml = '';
        if (lec.subHeadings && lec.subHeadings.length > 0) {
            subHeadingsHtml = `<div class="subheadings-list">` + 
                lec.subHeadings.slice(0, 3).map(sh => `<div>• ${escapeHtml(sh)}</div>`).join('') +
                `</div>`;
        }

        const quizBtnHtml = lec.quizCount > 0 
            ? `<button class="btn-unit-quiz-mini" title="${escapeHtml(lec.title)} 전체 퀴즈 풀기" onclick="event.stopPropagation(); startUnitQuizForLecture('${escapeHtml(lec.fileName)}')">🎯 ${lec.quizCount}문제</button>`
            : `<span class="quiz-cnt-badge zero">📝 모의고사</span>`;

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
// Cloze Mask (암기장 모드)
// -------------------------------------------------------------
function toggleClozeMask() {
    clozeMaskEnabled = !clozeMaskEnabled;
    const btn = document.getElementById('btn-mask-toggle');
    btn.classList.toggle('active', clozeMaskEnabled);
    btn.innerText = clozeMaskEnabled ? '🔓 숨김 해제 (원문 보기)' : '🔒 숫자/조문 가리기 (암기장 모드)';

    applyClozeMaskToIframe();
}

function applyClozeMaskToIframe() {
    const iframe = document.getElementById('note-frame');
    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc) return;

        let styleEl = doc.getElementById('cloze-mask-style');
        if (clozeMaskEnabled) {
            if (!styleEl) {
                styleEl = doc.createElement('style');
                styleEl.id = 'cloze-mask-style';
                styleEl.innerHTML = `
                    .highlight-red, .highlight-blue, .highlight-purple, .highlight-green {
                        background-color: #111827 !important;
                        color: #111827 !important;
                        user-select: none !important;
                        border-radius: 4px !important;
                        padding: 0 4px !important;
                        cursor: pointer !important;
                        transition: all 0.2s !important;
                    }
                    .highlight-red:hover, .highlight-blue:hover, .highlight-purple:hover, .highlight-green:hover {
                        background-color: #fef08a !important;
                        color: #000000 !important;
                    }
                `;
                doc.head.appendChild(styleEl);
            }
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

    // 1. Calculate Weights for each quiz (Cap at 5.0x max)
    const quizPool = studyData.quizzes.map(q => {
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
    document.getElementById('quiz-instant-answer-box').style.display = 'none';

    // Progress bar
    const progress = ((quizCurrentIndex + 1) / quizQuestions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${progress}%`;

    document.getElementById('quiz-step-indicator').innerText = `문제 ${quizCurrentIndex + 1} / ${quizQuestions.length}`;
    document.getElementById('quiz-subject-tag').innerText = `${currentQ.subject} (${currentQ.lectureTitle.split('.')[0] || ''})`;

    document.getElementById('quiz-question-text').innerHTML = `
        <div style="margin-bottom: 8px; font-weight: 700; color: #60a5fa;">[${escapeHtml(currentQ.lectureTitle)}]</div>
        ${escapeHtml(currentQ.question)}
    `;

    // Detect symbols in question & answer
    const symbols = detectQuizSymbols(currentQ);
    const container = document.getElementById('quiz-inputs-container');
    container.innerHTML = '';

    const savedAns = userAnswers[quizCurrentIndex] || '';

    if (symbols.length > 1) {
        // Multi-blank mode: Create separate input fields for ㉠, ㉡, ㉢
        document.getElementById('quiz-input-label').innerText = `✍️ 빈칸별 정답 입력 (총 ${symbols.length}개 빈칸)`;
        
        const gridEl = document.createElement('div');
        gridEl.className = 'multi-blank-grid';

        const parsedSavedMap = parseUserAnswersToMap(savedAns);

        symbols.forEach((sym, sIdx) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'blank-input-row';
            rowEl.innerHTML = `
                <span class="blank-symbol-badge">${sym}</span>
                <input type="text" class="blank-text-input" data-symbol="${sym}" placeholder="${sym} 빈칸 정답 입력" value="${escapeHtml(parsedSavedMap[sym] || '')}" autocomplete="off">
            `;
            gridEl.appendChild(rowEl);
        });

        container.appendChild(gridEl);

        const inputs = gridEl.querySelectorAll('.blank-text-input');
        inputs.forEach((inp, idx) => {
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (idx < inputs.length - 1) {
                        inputs[idx + 1].focus();
                    } else {
                        const box = document.getElementById('quiz-instant-answer-box');
                        if (box && box.style.display === 'none') {
                            checkCurrentQuestionAnswer();
                        } else {
                            nextQuizQuestion();
                        }
                    }
                }
            });
        });

        if (inputs.length > 0) {
            inputs[0].focus();
        }

    } else {
        // Single-blank mode
        document.getElementById('quiz-input-label').innerText = '✍️ 정답 입력';
        container.innerHTML = `
            <input type="text" id="quiz-answer-input" class="quiz-text-input" placeholder="정답을 입력하세요" value="${escapeHtml(typeof savedAns === 'string' ? savedAns : '')}" autocomplete="off" onkeydown="handleQuizEnter(event)">
        `;
        const singleInp = document.getElementById('quiz-answer-input');
        singleInp?.focus();
    }

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
    if (symbols.length > 1) {
        const inputs = document.querySelectorAll('.blank-text-input');
        const map = {};
        let combinedParts = [];
        inputs.forEach(inp => {
            const sym = inp.getAttribute('data-symbol');
            const val = inp.value.trim();
            if (sym) {
                map[sym] = val;
                if (val) combinedParts.push(`${sym} ${val}`);
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
    const ansTextEl = document.getElementById('quiz-instant-ans-text');
    const linkBtn = document.getElementById('quiz-instant-link-btn');

    ansTextEl.innerHTML = `정답: <span style="color: #34d399; font-size: 16px;">${escapeHtml(currentQ.answerRaw)}</span>`;
    linkBtn.onclick = () => selectLecture(currentQ.noteFileName, currentQ.anchorId);
    box.style.display = 'block';
}

function checkCurrentQuestionAnswer() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return;

    const inputVal = getUserInputAnswer();
    if (!inputVal) {
        alert('답안을 입력한 후 정답 확인을 눌러주세요. (모를 때는 [💡 모르겠어요] 클릭)');
        return;
    }

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

    const box = document.getElementById('quiz-instant-answer-box');
    const headerEl = document.getElementById('quiz-instant-header');
    const ansTextEl = document.getElementById('quiz-instant-ans-text');
    const linkBtn = document.getElementById('quiz-instant-link-btn');

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

function handleQuizEnter(e) {
    if (e.key === 'Enter') {
        const box = document.getElementById('quiz-instant-answer-box');
        if (box && box.style.display === 'none') {
            checkCurrentQuestionAnswer();
        } else {
            nextQuizQuestion();
        }
    }
}

function saveCurrentQuizAnswer() {
    userAnswers[quizCurrentIndex] = getUserInputAnswer();
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
        const isCorrect = checkAnswerCorrectness(uAns, q.answerRaw);

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
            userAns: uAns,
            isCorrect: isCorrect
        });
    });

    saveLocalStats();
    renderQuizResult(correctCount, quizQuestions.length, results);
}

function normalizeAnswerText(text) {
    if (!text) return '';
    return text
        .replace(/[㉠㉡㉢㉣㉤]/g, ' ')
        .replace(/[,;:\/\\|\(\)\[\]·•]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function stripUnits(token) {
    if (!token) return '';
    return token
        .replace(/(\d+)(일|명|년|개|원|만원|억원|세대|호|%|퍼센트)$/i, '$1')
        .replace(/(\d+)천만원?/i, '$1000만')
        .replace(/(\d+)천만/i, '$1000만')
        .replace(/(\d+)천/i, '$1000')
        .replace(/,/g, '');
}

function checkAnswerCorrectness(userAns, realAnsRaw) {
    if (!userAns || !realAnsRaw) return false;

    // 1. Symbol-based multi-blank matching (㉠, ㉡, ㉢)
    const symbols = [...new Set([...(userAns + ' ' + realAnsRaw).matchAll(/[㉠㉡㉢㉣㉤]/g)].map(m => m[0]))];
    
    if (symbols.length > 0) {
        // Extract real answer for each symbol
        let allMatched = true;
        
        for (const sym of symbols) {
            // Find real answer segment for this symbol
            const symRegex = new RegExp(`${sym}\\s*([^㉠㉡㉢㉣㉤,;]+)`, 'i');
            const realSymMatch = realAnsRaw.match(symRegex);
            const userSymMatch = userAns.match(symRegex);

            const realSymVal = realSymMatch ? realSymMatch[1].trim() : '';
            const userSymVal = userSymMatch ? userSymMatch[1].trim() : (userAns.trim());

            if (realSymVal) {
                const singleMatched = checkSingleBlankValue(userSymVal, realSymVal);
                if (!singleMatched) {
                    allMatched = false;
                    break;
                }
            } else if (symbols.length > 1) {
                allMatched = false;
                break;
            }
        }

        if (allMatched) return true;
    }

    // 2. Global Fuzzy Fallback matching
    return checkSingleBlankValue(userAns, realAnsRaw);
}

function checkSingleBlankValue(userVal, realValRaw) {
    if (!userVal || !realValRaw) return false;

    // Expand parenthesized options:
    // e.g. "입주자(소유자)" -> ["입주자(소유자)", "입주자", "소유자"]
    // e.g. "수용권자(또는 사업주체)" -> ["수용권자(또는 사업주체)", "수용권자", "사업주체"]
    const optionsSet = new Set();
    
    // Split by Slash or OR keywords
    const primarySplits = realValRaw.split(/\(또는\s*|\/|\|/).filter(Boolean);
    primarySplits.forEach(str => {
        optionsSet.add(str.trim());
        const parenMatch = str.match(/^([^(]+)\(([^)]+)\)/);
        if (parenMatch) {
            const outside = parenMatch[1].trim();
            const inside = parenMatch[2].replace(/^또는\s*/, '').trim();
            if (outside) optionsSet.add(outside);
            if (inside) optionsSet.add(inside);
        }
    });

    const options = Array.from(optionsSet);
    const normUser = normalizeAnswerText(userVal);
    const normUserNoSpace = normUser.replace(/\s+/g, '');
    const userCleanNum = stripUnits(normUserNoSpace);

    for (const opt of options) {
        const normOpt = normalizeAnswerText(opt);
        const normOptNoSpace = normOpt.replace(/\s+/g, '');
        const optCleanNum = stripUnits(normOptNoSpace);

        // Direct match
        if (
            normUserNoSpace === normOptNoSpace ||
            userCleanNum === optCleanNum ||
            normUser.includes(normOpt) ||
            normOpt.includes(normUser)
        ) {
            return true;
        }

        // Token list match
        const realTokens = normOpt
            .split(/\s+/)
            .filter(Boolean)
            .map(stripUnits)
            .filter(t => t.length > 0 && t !== '또는' && t !== '등' && t !== '및');

        const userTokens = normUser
            .split(/\s+/)
            .filter(Boolean)
            .map(stripUnits)
            .filter(t => t.length > 0);

        if (realTokens.length > 0) {
            let matchedCount = 0;
            realTokens.forEach(rt => {
                if (
                    normUserNoSpace.includes(rt) ||
                    userTokens.some(ut => ut.includes(rt) || rt.includes(ut))
                ) {
                    matchedCount++;
                }
            });
            if (matchedCount >= realTokens.length) {
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

        itemEl.innerHTML = `
            <div class="result-q-num">Q${idx + 1}. [${escapeHtml(res.question.subject)}] ${escapeHtml(res.question.lectureTitle)}</div>
            <div class="result-q-title">${escapeHtml(res.question.question)}</div>
            <div class="ans-comparison">
                <div class="ans-row">
                    <span style="width: 80px; color: var(--text-dim);">내 제출답:</span>
                    <span class="${res.isCorrect ? 'real-ans' : 'my-ans'}">${escapeHtml(res.userAns || '(미입력)')} ${res.isCorrect ? '⭕ 정답' : '❌ 오답'}</span>
                </div>
                <div class="ans-row">
                    <span style="width: 80px; color: var(--text-dim);">법정 정답:</span>
                    <span class="real-ans">${escapeHtml(res.question.answerRaw)}</span>
                </div>
            </div>
            <div>
                <button class="btn-deeplink" onclick="selectLecture('${res.question.noteFileName}', '${res.question.anchorId}')">
                    📖 해당 강의 노트 원본 복습하기 ➔
                </button>
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
