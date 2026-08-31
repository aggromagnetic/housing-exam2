/**
 * AI Question Enhancer & Legal Verification Engine (Gemini 3.7 / 2.5 Flash + Google Search Grounding)
 * 
 * Usage:
 *   node scripts/ai_enhance_questions.js --score=5 --limit=10    # Test 10 items of 5-score
 *   node scripts/ai_enhance_questions.js --score=5              # Run all 417 unedited 5-score items
 *   node scripts/ai_enhance_questions.js --score=6              # Run 6-score items
 *   node scripts/ai_enhance_questions.js --score=7              # Run 7-score items
 */

const fs = require("fs");
const path = require("path");

// 1. Load API Keys from .env
function getApiKeys() {
    const keys = [];
    const envPath = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const m1 = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
        if (m1) keys.push(m1[1].trim());
        const m2 = envContent.match(/GEMINI_API_KEY_2\s*=\s*(.+)/);
        if (m2) keys.push(m2[1].trim());
    }
    if (process.env.GEMINI_API_KEY && !keys.includes(process.env.GEMINI_API_KEY)) {
        keys.push(process.env.GEMINI_API_KEY.trim());
    }
    return keys;
}

const API_KEYS = getApiKeys();
if (API_KEYS.length === 0) {
    console.error("❌ ERROR: No GEMINI_API_KEY found in .env");
    process.exit(1);
}
console.log(`🔑 Loaded ${API_KEYS.length} Gemini API Key(s).`);

// 2. Setup Directories & Log Files
const LOG_DIR = path.join(__dirname, "..", "exam_data", "ai_enhancement_log");
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const CRITICAL_ERRORS_JSON = path.join(LOG_DIR, "critical_errors_log.json");
const CRITICAL_ERRORS_MD = path.join(LOG_DIR, "critical_errors_report.md");
const PRE_BACKUP_JSON = path.join(LOG_DIR, "pre_enhancement_backup.json");

// Parse CLI flags
const args = process.argv.slice(2);
let targetScore = 5;
let limitCount = Infinity;

args.forEach(arg => {
    if (arg.startsWith("--score=")) {
        targetScore = parseInt(arg.split("=")[1], 10);
    }
    if (arg.startsWith("--limit=")) {
        limitCount = parseInt(arg.split("=")[1], 10);
    }
});

const PROGRESS_FILE = path.join(LOG_DIR, `enhanced_score_${targetScore}_progress.json`);

// 3. Load Exam Bank & Helper Mappings
global.window = { addEventListener: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] };

require("../housing_exam_hell/data/exam_bank.js");
require("../housing_exam_hell/data/core_keywords_db.js");

let appCode = fs.readFileSync(path.join(__dirname, "..", "housing_exam_hell", "js", "app.js"), "utf8");
appCode = appCode.replace("const ExamEngine = {", "window.ExamEngine = {");
eval(appCode);

const ExamEngine = window.ExamEngine;
const lawMC = ExamEngine.getQuestionPool("관계법규", "choice");
const lawSA = ExamEngine.getQuestionPool("관계법규", "short");
const gwanriMC = ExamEngine.getQuestionPool("관리실무", "choice");
const gwanriSA = ExamEngine.getQuestionPool("관리실무", "short");
const allPool = [...lawMC, ...lawSA, ...gwanriMC, ...gwanriSA];

// Load backup edits
let existingEdits = {};
const backupPath = path.join(__dirname, "..", "backups", "firestore_full_backup_20260831_1605.json");
if (fs.existsSync(backupPath)) {
    try {
        const bData = JSON.parse(fs.readFileSync(backupPath, "utf8"));
        existingEdits = bData.allCustomEdits || {};
    } catch (e) {}
}

// Load current progress if already exists
let progressData = {};
if (fs.existsSync(PROGRESS_FILE)) {
    try {
        progressData = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch (e) {}
}

// Load critical errors log
let criticalErrorsLog = [];
if (fs.existsSync(CRITICAL_ERRORS_JSON)) {
    try {
        criticalErrorsLog = JSON.parse(fs.readFileSync(CRITICAL_ERRORS_JSON, "utf8"));
    } catch (e) {}
}

// Filter target questions
const targetQuestions = allPool.filter(q => {
    if (q.topScore !== targetScore) return false;
    if (existingEdits[q.qKey]) return false; // Skip already custom-edited in past
    if (progressData[q.qKey]) return false; // Skip already completed in current run
    return true;
}).slice(0, limitCount);

console.log(`\n📋 Target ${targetScore}-Point Questions to Enhance: ${targetQuestions.length} items (Total already in progress: ${Object.keys(progressData).length})`);

if (targetQuestions.length === 0) {
    console.log("🎉 No questions left to process for this target score!");
    process.exit(0);
}

// 4. Gemini System Prompt with Legal Search Grounding
const SYSTEM_PROMPT = `당신은 대한민국 주택관리사(보) 2차 국가전문자격시험(관계법규, 공동주택관리실무)의 최고 일타강사이자 국가전문자격시험 출제위원급 검증 전문가입니다.
사용자가 제공하는 문제(객관식 5지선다 또는 주관식 단답/기입형), 정답, 해설, 팁을 면밀히 분석하고 검증하여 2026년 7월 기준 최신 개정 법령 및 표준 실무 기준에 완벽히 부합하도록 교정합니다.

[지시 사항]
1. 사전 지식 과신 금지: 반드시 웹 검색 도구(Google Search)를 실행하여 2026년 최신 개정 법령(공동주택관리법, 주택법, 건축법, 민간임대주택특별법, 소방시설법, 승강기안전관리법 등)의 조문, 수치, 행정기관 명칭을 실시간 검색/확인 후 그에 기반하여 답변하십시오.
2. 치명적 오류 감지:
   - 복수 정답 발생, 정답 번호 오류, 법 개정으로 인한 문제 무효화, 지문/보기 심각한 파손 시 "isCriticalError": true, "errorType": "MULTIPLE_ANSWERS" | "WRONG_ANSWER_KEY" | "OBSOLETE_LAW" | "CORRUPTED_QUESTION", "errorSummary": "간결한 원인 요약"
   - 정상 문항 시 "isCriticalError": false, "errorType": "NONE", "errorSummary": ""
3. 간결성 및 핵심 위주 보강:
   - 단순 조문 번호(예: 제00조 제0항) 나열은 지양하고, 실제 요건과 수치, 용어에 집중.
4. 표기 및 시각화 규칙:
   - LaTeX 수식 문법($, $$, \\frac 등) 절대 사용 금지. (1/2, 50m², 20m 등 일반 텍스트 사용)
   - 시각화 기호 활용: 🔵 맞는 지문, ❌ 틀린 지문, ⚠️ 함정 주의, ⭐ 중요, 🌟 매우중요, 🚨 매우조심, 💯 이렇게하면 100점
   - 해설 구성:
     - [문제/정답 오류 교정]: (오류 수정 요약, 없으면 생략)
     - ❌ [오답 지문 수정]: (왜 틀렸는지 이유와 올바른 지문 제시)
     - 🔵 [정답/기타 지문 핵심]: (핵심 근거 요약)
   - 일타 팁 구성:
     - 1. 핵심 비교·정리, 빈출 핵심(수치), ⚠️함정 피하기 (시각 기호 활용)
     - 2. 3초 암기 공식: "핵심 키워드 중심의 직관적 암기 문구"

[출력 형식]:
답변 마지막에 반드시 다음과 같은 단 하나의 \`\`\`json 코드블록으로 응답하십시오.
\`\`\`json
{
  "isCriticalError": false,
  "errorType": "NONE",
  "errorSummary": "",
  "question": "문제 전문",
  "passage": "지문 박스 내용 (없으면 빈 문자열)",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"], // 객관식일 때 ①~⑤ 텍스트 (원문자 제외)
  "answer": 1, // 객관식 정답 번호 (1~5)
  "answers": {}, // 주관식일 때 {"㉠": "정답단어"} (객관식이면 {})
  "explanation": "해설 내용",
  "tip": "일타 팁 내용"
}
\`\`\``;

function extractJsonFromParts(parts) {
    const fullText = parts.map(p => p.text || "").join("\n");
    const jsonMatch = fullText.match(/\`\`\`json\s*([\s\S]*?)\s*\`\`\`/);
    if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
    }
    const firstBrace = fullText.indexOf("{");
    const lastBrace = fullText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(fullText.substring(firstBrace, lastBrace + 1));
    }
    throw new Error("No JSON code block found in response");
}

let keyIdx = 0;
async function callGeminiEnhance(q, retries = 4) {
    const apiKey = API_KEYS[keyIdx % API_KEYS.length];
    keyIdx++;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `[검증 대상 문항 정보]
- 과목: ${q.subject} (${q.type === "choice" ? "객관식 5지선다" : "주관식 단답/기입형"})
- 단원: ${q.chapterName}
- 문제: ${q.question || q.title}
${q.passage ? `- 지문/보기:\n${q.passage}` : ""}
${q.options && q.options.length > 0 ? `- 선택 보기:\n${q.options.map((o, i) => `${i+1}. ${o}`).join("\n")}` : ""}
- 기존 정답: ${q.type === "choice" ? q.answer : JSON.stringify(q.answers || {})}
- 기존 해설: ${q.explanation || "해설 없음"}
- 기존 팁: ${q.tip || "팁 없음"}

위 문항을 2026년 최신 개정 법령 기준으로 Google 검색을 통해 철저히 검증 및 교정하여 최종 JSON을 반환하십시오.`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        tools: [{ googleSearch: {} }],
        generationConfig: {
            temperature: 0.1
        }
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errText = await res.text();
                if (res.status === 429 || res.status >= 500) {
                    const waitSec = attempt * 3;
                    console.warn(`⏳ API Limit [${res.status}], waiting ${waitSec}s... (Attempt ${attempt}/${retries})`);
                    await new Promise(r => setTimeout(r, waitSec * 1000));
                    continue;
                }
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }

            const data = await res.json();
            if (!data.candidates || !data.candidates[0]?.content?.parts) {
                throw new Error("Invalid candidates in response: " + JSON.stringify(data));
            }

            const parsed = extractJsonFromParts(data.candidates[0].content.parts);
            return parsed;
        } catch (err) {
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
}

// 5. Execution Queue & Batch Worker
async function runBatch() {
    console.log(`🚀 Starting AI Enhancement with Gemini 3.7/2.5 Flash & Search Grounding...`);
    const totalCount = targetQuestions.length;
    let completedCount = 0;
    let criticalErrorsCount = 0;

    // Save pre-backup snapshot
    let preBackup = {};
    if (fs.existsSync(PRE_BACKUP_JSON)) {
        try { preBackup = JSON.parse(fs.readFileSync(PRE_BACKUP_JSON, "utf8")); } catch (e) {}
    }

    const CONCURRENCY = 2; // Conservative concurrency to avoid 429 quota limits
    let currentIndex = 0;

    async function worker(workerId) {
        while (currentIndex < targetQuestions.length) {
            const q = targetQuestions[currentIndex++];
            const itemNum = Object.keys(progressData).length + 1;
            const percent = ((completedCount / totalCount) * 100).toFixed(1);

            console.log(`[W${workerId}] [${itemNum}/${totalCount + Object.keys(progressData).length}] (${percent}%) Processing ${q.qKey}...`);

            // Save pre-backup
            if (!preBackup[q.qKey]) {
                preBackup[q.qKey] = {
                    qKey: q.qKey,
                    subject: q.subject,
                    type: q.type,
                    chapterName: q.chapterName,
                    question: q.question,
                    passage: q.passage,
                    options: q.options,
                    answer: q.answer,
                    answers: q.answers,
                    explanation: q.explanation,
                    tip: q.tip
                };
            }

            try {
                const enhanced = await callGeminiEnhance(q);

                const resultRecord = {
                    qKey: q.qKey,
                    subject: q.subject,
                    type: q.type,
                    chapterName: q.chapterName,
                    isCriticalError: !!enhanced.isCriticalError,
                    errorType: enhanced.errorType || "NONE",
                    errorSummary: enhanced.errorSummary || "",
                    question: enhanced.question || q.question,
                    passage: enhanced.passage !== undefined ? enhanced.passage : (q.passage || ""),
                    options: enhanced.options && enhanced.options.length > 0 ? enhanced.options : q.options,
                    answer: enhanced.answer !== undefined ? enhanced.answer : q.answer,
                    answers: enhanced.answers || q.answers || {},
                    explanation: enhanced.explanation || q.explanation,
                    tip: enhanced.tip || q.tip,
                    enhancedAt: new Date().toISOString()
                };

                progressData[q.qKey] = resultRecord;
                completedCount++;

                if (resultRecord.isCriticalError) {
                    criticalErrorsCount++;
                    console.log(`🚨 [CRITICAL ERROR DETECTED] [${resultRecord.errorType}] ${q.qKey}: ${resultRecord.errorSummary}`);
                    criticalErrorsLog.push({
                        qKey: q.qKey,
                        errorType: resultRecord.errorType,
                        errorSummary: resultRecord.errorSummary,
                        original: preBackup[q.qKey],
                        enhanced: resultRecord,
                        detectedAt: new Date().toISOString()
                    });
                } else {
                    console.log(`✅ [OK] ${q.qKey} enhanced successfully.`);
                }

                // Save progress to disk every 2 items
                if (completedCount % 2 === 0 || completedCount === totalCount) {
                    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), "utf8");
                    fs.writeFileSync(PRE_BACKUP_JSON, JSON.stringify(preBackup, null, 2), "utf8");
                    fs.writeFileSync(CRITICAL_ERRORS_JSON, JSON.stringify(criticalErrorsLog, null, 2), "utf8");
                    updateMarkdownReport(criticalErrorsLog);
                }

                // Brief pause to respect API limits
                await new Promise(r => setTimeout(r, 800));

            } catch (err) {
                console.error(`❌ Failed ${q.qKey}:`, err.message);
            }
        }
    }

    const workers = [];
    for (let i = 1; i <= CONCURRENCY; i++) {
        workers.push(worker(i));
    }
    await Promise.all(workers);

    // Final save
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), "utf8");
    fs.writeFileSync(PRE_BACKUP_JSON, JSON.stringify(preBackup, null, 2), "utf8");
    fs.writeFileSync(CRITICAL_ERRORS_JSON, JSON.stringify(criticalErrorsLog, null, 2), "utf8");
    updateMarkdownReport(criticalErrorsLog);

    console.log(`\n========================================`);
    console.log(`🎉 Batch Enhancement Completed!`);
    console.log(`- Total Processed in this run: ${completedCount}`);
    console.log(`- Critical Errors Identified: ${criticalErrorsCount}`);
    console.log(`- Progress saved to: ${PROGRESS_FILE}`);
    console.log(`- Critical errors log: ${CRITICAL_ERRORS_JSON}`);
    console.log(`- Critical errors report: ${CRITICAL_ERRORS_MD}`);
    console.log(`========================================\n`);
}

function updateMarkdownReport(log) {
    let md = `# 🚨 주택관리사 2차 문제은행 AI 법령 검증 중대 결함 리포트\n\n`;
    md += `* **작성 일시**: ${new Date().toLocaleString("ko-KR")}\n`;
    md += `* **발견된 중대 결함 문항 수**: **${log.length}개**\n\n`;
    md += `본 리포트는 Gemini 3.7 Flash + Google 실시간 법령 검색 검증 중 발견된 복수 정답, 정답 오류, 개정 법령 미반영(사문화), 지문 파손 문항의 상세 내역입니다.\n\n---\n\n`;

    log.forEach((item, idx) => {
        md += `### [오류 #${idx + 1}] ${item.qKey}\n\n`;
        md += `- **결함 유형**: \`${item.errorType}\`\n`;
        md += `- **결함 요약**: **${item.errorSummary}**\n`;
        md += `- **검증 일시**: ${item.detectedAt}\n\n`;
        md += `#### 🔍 [교정 전 원본 문제]\n`;
        md += `\`\`\`text\n${item.original?.question || ""}\n\`\`\`\n`;
        if (item.original?.options) {
            md += `* 원본 정답: **${item.original.answer}번**\n`;
        }
        md += `\n#### 🛠️ [교정 후 내용 및 해설]\n`;
        md += `\`\`\`text\n${item.enhanced?.explanation || ""}\n\`\`\`\n\n`;
        md += `---\n\n`;
    });

    fs.writeFileSync(CRITICAL_ERRORS_MD, md, "utf8");
}

runBatch().catch(console.error);
