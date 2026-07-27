// Housing Manager Exam Smart Learning Platform JS App

let studyData = {
    lectures: [],
    quizzes: []
};

let currentView = 'viewer';
let currentSubjectFilter = 'all';
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
    sidebar?.classList.add('open');
    overlay?.classList.add('active');
}

function closeSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
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
    
    if (subject === 'all') document.getElementById('chip-all').classList.add('active');
    else if (subject === '관계법규') document.getElementById('chip-rel').classList.add('active');
    else if (subject === '관리실무') document.getElementById('chip-prac').classList.add('active');
    else if (subject === '관계법규(문제)') document.getElementById('chip-rel-test').classList.add('active');
    else if (subject === '관리실무(문제)') document.getElementById('chip-prac-test').classList.add('active');

    renderLectureList();
}

function renderLectureList() {
    const container = document.getElementById('lecture-list-container');
    container.innerHTML = '';

    const filtered = studyData.lectures.filter(l => {
        if (currentSubjectFilter === 'all') return true;
        return l.subject === currentSubjectFilter;
    });

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

// -------------------------------------------------------------
// Weighted Random Quiz Engine
// -------------------------------------------------------------
function startQuizMode() {
    if (!studyData.quizzes || studyData.quizzes.length === 0) {
        alert('등록된 퀴즈 문항이 없습니다.');
        return;
    }

    // 1. Calculate Weights for each quiz
    const quizPool = studyData.quizzes.map(q => {
        const stat = quizStats[q.id] || { wrongCount: 0, tryCount: 0 };
        // Base weight = 1.0. Wrong answers add +2.0 weight per fail.
        let weight = 1.0 + (stat.wrongCount * 2.0);
        return { quiz: q, weight: weight };
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

    const inputEl = document.getElementById('quiz-answer-input');
    inputEl.value = userAnswers[quizCurrentIndex] || '';
    inputEl.focus();

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

function showInstantAnswer() {
    const currentQ = quizQuestions[quizCurrentIndex];
    if (!currentQ) return;

    // Mark as wrong answer in user input
    userAnswers[quizCurrentIndex] = '(모름/정답확인)';
    document.getElementById('quiz-answer-input').value = '(모름/정답확인)';

    // Increase wrong count in stats immediately
    if (!quizStats[currentQ.id]) {
        quizStats[currentQ.id] = { wrongCount: 0, tryCount: 0 };
    }
    quizStats[currentQ.id].wrongCount += 1;
    quizStats[currentQ.id].tryCount += 1;
    saveLocalStats();

    // Show answer box
    const box = document.getElementById('quiz-instant-answer-box');
    const ansTextEl = document.getElementById('quiz-instant-ans-text');
    const linkBtn = document.getElementById('quiz-instant-link-btn');

    ansTextEl.innerHTML = `정답: <span style="color: #34d399; font-size: 16px;">${escapeHtml(currentQ.answerRaw)}</span>`;
    linkBtn.onclick = () => selectLecture(currentQ.noteFileName, currentQ.anchorId);
    box.style.display = 'block';
}

function handleQuizEnter(e) {
    if (e.key === 'Enter') {
        nextQuizQuestion();
    }
}

function saveCurrentQuizAnswer() {
    const inputVal = document.getElementById('quiz-answer-input').value.trim();
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
// Grading & Result Evaluation
// -------------------------------------------------------------
function finishAndGradeQuiz() {
    let correctCount = 0;
    const results = [];

    quizQuestions.forEach((q, idx) => {
        const uAns = userAnswers[idx] || '';
        const isCorrect = checkAnswerCorrectness(uAns, q.answerRaw);

        if (isCorrect) correctCount++;

        // Update local stats for weighted sampling
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

function checkAnswerCorrectness(userAns, realAnsRaw) {
    if (!userAns) return false;

    // Normalize strings (remove spaces, parentheses, etc)
    const normUser = userAns.replace(/\s+/g, '').toLowerCase();
    const normReal = realAnsRaw.replace(/\s+/g, '').toLowerCase();

    // Exact or contained check
    if (normUser === normReal) return true;

    // Split keywords if multi-answer
    const userTokens = normUser.split(/[,,\/]/).filter(Boolean);
    const realTokens = normReal.split(/[,,\/]/).filter(Boolean);

    if (userTokens.length > 0 && realTokens.length > 0) {
        let matchMatches = 0;
        userTokens.forEach(ut => {
            if (realTokens.some(rt => rt.includes(ut) || ut.includes(rt))) {
                matchMatches++;
            }
        });
        if (matchMatches >= Math.min(userTokens.length, realTokens.length)) return true;
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
