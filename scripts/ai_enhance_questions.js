/**
 * AI Question Enhancer & Legal Verification Engine (Gemini 3.7 / 2.5 Flash + Google Search Grounding)
 * 
 * Usage:
 *   node scripts/ai_enhance_questions.js --score=5 --limit=10    # Test 10 items of 5-score
 *   node scripts/ai_enhance_questions.js --score=5              # Run unedited 5-score items
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

console.log(`\n📋 Target ${targetScore}-Point Questions to Enhance: ${targetQuestions.length} items (Total already completed: ${Object.keys(progressData).length})`);

if (targetQuestions.length === 0) {
    console.log("🎉 No questions left to process for this target score!");
    process.exit(0);
}

// 4. Upgraded Gemini System Prompt (Uniform Circled Numbers & Comprehensive Comparative Tips)
const SYSTEM_PROMPT = `당신은 대한민국 주택관리사(보) 2차 국가전문자격시험(관계법규, 공동주택관리실무)의 최고 일타강사이자 국가전문자격시험 출제위원급 검증 전문가입니다.
사용자가 제공하는 문제(객관식 5지선다 또는 주관식 단답/기입형), 정답, 해설, 팁을 면밀히 분석하고 검증하여 2026년 7월 기준 최신 개정 법령 및 표준 실무 기준에 완벽히 부합하도록 교정합니다.

[핵심 작성 원칙]
1. 사전 지식 과신 금지 및 실시간 검색:
   - 반드시 웹 검색 도구(Google Search)를 실행하여 2026년 최신 개정 법령의 조문, 수치, 행정기관 명칭을 실시간 검색/확인 후 교정하십시오.
2. 지문 표기 완전 통일 (동그라미 숫자):
   - 객관식 지문은 무조건 동그라미 숫자(①, ②, ③, ④, ⑤)로만 표기하십시오. ('선택지 1번', '1.', '3번 지문' 등 혼용 절대 금지)
   - 주관식 빈칸은 [㉠], [㉡], [㉢] 등으로 표기하십시오.
3. 해설 간결화 및 법조문 번호 배제:
   - 「법률명」 제00조 제0항 같은 단순 조문 번호 나열은 일체 쓰지 말고, 법률의 실제 요건, 핵심 수치, 개념에만 집중하십시오.
   - ❌ [오답 지문 수정]: 왜 틀렸는지 핵심 이유와 올바른 정문(正文)을 제시하십시오. (예: ❌ ⑤: 사용자는 ... 거부할 수 없고, 필요한 경우 시간을 변경할 수만 있습니다.)
   - 🔵 [정답/기타 지문 핵심]: 보기 지문과 대동소이한 단순 반복 설명은 과감히 전부 생략하십시오. 꼭 필요한 핵심 추가 포인트가 있을 때만 1줄로 압축하십시오.
4. [일타 팁] - 시험 변형 대비 전체 주제 총정리 및 비교 (가장 중요!):
   - 문제 지문을 단순히 다시 요약하지 마십시오. (지문 단순 반복 절대 금지)
   - 해당 문제가 속한 주제의 전체 체계와 헷갈리는 비교 대상(예: 과태료 기준별 2천만/1천만/5백만/3백만 비교, 권한자별 국토부/시도지사/시군구 비교, 정족수별 과반수/3분의2/4분의3 비교 등)을 입체적으로 총정리하십시오.
   - 3초 암기 공식: 변형 문제가 나와도 즉시 풀 수 있는 직관적인 암기 구호를 포함하십시오.

[출력 형식]:
반드시 단 하나의 \`\`\`json 코드블록으로 응답하십시오.
\`\`\`json
{
  "isCriticalError": false,
  "errorType": "NONE",
  "errorSummary": "",
  "question": "문제 전문",
  "passage": "지문 박스 내용 (없으면 빈 문자열)",
  "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
  "answer": 1,
  "answers": {},
  "explanation": "해설 내용",
  "tip": "일타 팁 내용"
}
\`\`\``;

function extractJsonFromParts(parts) {
    const fullText = parts.map(p => p.text || "").join("\n");
    const jsonMatch = fullText.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
    if (jsonMatch) {
        try { return JSON.parse(jsonMatch[1]); } catch (e) {}
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
    console.log(`🚀 Starting AI Enhancement with Upgraded Prompt (Circled Numbers & Holistic Tips)...`);
    const totalCount = targetQuestions.length;
    let completedCount = 0;
    let criticalErrorsCount = 0;

    // Save pre-backup snapshot
    let preBackup = {};
    if (fs.existsSync(PRE_BACKUP_JSON)) {
        try { preBackup = JSON.parse(fs.readFileSync(PRE_BACKUP_JSON, "utf8")); } catch (e) {}
    }

    const CONCURRENCY = 2;
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
