// Housing Manager Exam Smart Learning Platform JS App

let studyData = {
    lectures: [],
    quizzes: []
};

let currentView = 'viewer';
let currentSubjectFilter = '관계법규';
let currentLecture = null;
let clozeMaskEnabled = false;

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
        const resp = await fetch('data/study_data.json');
        studyData = await resp.json();
        console.log('Loaded study data:', studyData);
    } catch (err) {
        console.error('Failed to load study_data.json', err);
    }
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

        itemEl.innerHTML = `
            <div class="lecture-meta">
                <span class="subject-badge ${badgeClass}">${escapeHtml(lec.subject)}</span>
                <span class="quiz-cnt-badge">📝 ${lec.quizCount}문제</span>
            </div>
            <div class="lecture-title">${escapeHtml(lec.title)}</div>
            ${subHeadingsHtml}
        `;
        container.appendChild(itemEl);
    });
}

function selectLecture(fileNameOrPath, anchorId = null) {
    const lec = studyData.lectures.find(l => l.fileName === fileNameOrPath || l.relativePath === fileNameOrPath);
    if (!lec) return;

    currentLecture = lec;
    renderLectureList();

    // Update Note Header Info
    document.getElementById('current-note-title').innerText = lec.title;
    const badgeEl = document.getElementById('current-note-badge');
    badgeEl.innerText = lec.subject;
    badgeEl.className = `subject-badge ${lec.subject === '관계법규' ? 'rel' : (lec.subject === '관리실무' ? 'prac' : 'etc')}`;

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
// Weighted Random Quiz Engine
// -------------------------------------------------------------
function startQuizMode() {
    if (!studyData.quizzes || studyData.quizzes.length === 0) {
        alert('등록된 퀴즈 문항이 없습니다.');
        return;
    }

    // 1. Calculate Weights for each quiz (Cap at 5.0x max)
    // wrongCount 0 -> 1.0 (1/N)
    // wrongCount 1 -> 2.0 (2/N)
    // wrongCount 2 -> 3.0 (3/N)
    // wrongCount 3 -> 4.0 (4/N)
    // wrongCount >= 4 -> 5.0 (5/N max cap)
    const quizPool = studyData.quizzes.map(q => {
        const stat = quizStats[q.id] || { wrongCount: 0, tryCount: 0 };
        const rawWeight = 1.0 + (stat.wrongCount * 1.0);
        const cappedWeight = Math.min(5.0, rawWeight); // Cap at 5배 max
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
    const text = (q.question || '') + ' ' + (q.answerRaw || '');
    const found = [...text.matchAll(/[㉠㉡㉢㉣㉤]/g)].map(m => m[0]);
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
// Global Search
// -------------------------------------------------------------
function handleGlobalSearch(e) {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
        if (currentView === 'search') switchView('viewer');
        return;
    }

    if (e.key === 'Enter' || query.length >= 2) {
        performSearch(query);
    }
}

function performSearch(query) {
    const matchedLectures = [];

    studyData.lectures.forEach(lec => {
        let matchScore = 0;
        const matches = [];

        if (lec.title.toLowerCase().includes(query)) {
            matchScore += 5;
            matches.push(`제목 매칭: ${lec.title}`);
        }

        lec.subHeadings.forEach(sh => {
            if (sh.toLowerCase().includes(query)) {
                matchScore += 3;
                matches.push(`소단원: ${sh}`);
            }
        });

        const relatedQuizzes = studyData.quizzes.filter(q => q.noteFileName === lec.fileName);
        relatedQuizzes.forEach(q => {
            if (q.question.toLowerCase().includes(query) || q.answerRaw.toLowerCase().includes(query)) {
                matchScore += 2;
                matches.push(`퀴즈 문제: ${q.question}`);
            }
        });

        if (matchScore > 0) {
            matchedLectures.push({ lec, matches });
        }
    });

    renderSearchResults(query, matchedLectures);
    switchView('search');
}

function renderSearchResults(query, results) {
    const container = document.getElementById('search-results-container');
    container.innerHTML = `<div style="color: var(--text-muted); margin-bottom: 16px;">'<strong>${escapeHtml(query)}</strong>' 검색 결과 (총 ${results.length}건)</div>`;

    if (results.length === 0) {
        container.innerHTML += `<div style="padding: 40px; text-align: center; color: var(--text-dim);">검색된 강의 노트가 없습니다. 다른 키워드로 검색해 보세요.</div>`;
        return;
    }

    results.forEach(({ lec, matches }) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'result-item';
        itemEl.style.cursor = 'pointer';
        itemEl.onclick = () => selectLecture(lec.fileName);

        itemEl.innerHTML = `
            <div class="result-q-num">[${escapeHtml(lec.subject)}] ${escapeHtml(lec.fileName)}</div>
            <div class="result-q-title" style="color: #60a5fa;">${escapeHtml(lec.title)}</div>
            <div style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
                ${matches.map(m => `<div>• ${escapeHtml(m)}</div>`).join('')}
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
