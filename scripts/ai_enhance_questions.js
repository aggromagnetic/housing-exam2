/**
 * AI Question Enhancer & Legal Verification Engine (Gemini 2.5 Flash + Fast Fallback)
 */

const fs = require("fs");
const path = require("path");

function getApiKey() {
    const envPath = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
        const m2 = envContent.match(/GEMINI_API_KEY_2\s*=\s*(.+)/);
        if (m2) return m2[1].trim();
        const m1 = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
        if (m1) return m1[1].trim();
    }
    return process.env.GEMINI_API_KEY || "";
}
const API_KEY = getApiKey();

const LOG_DIR = path.join(__dirname, "..", "exam_data", "ai_enhancement_log");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const CRITICAL_ERRORS_JSON = path.join(LOG_DIR, "critical_errors_log.json");
const CRITICAL_ERRORS_MD = path.join(LOG_DIR, "critical_errors_report.md");
const PRE_BACKUP_JSON = path.join(LOG_DIR, "pre_enhancement_backup.json");
const PROGRESS_FILE = path.join(LOG_DIR, "enhanced_score_5_progress.json");

// Load Environment & Pools
global.window = { addEventListener: () => {} };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.document = { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] };

require("../housing_exam_hell/data/exam_bank.js");
require("../housing_exam_hell/data/core_keywords_db.js");

let appCode = fs.readFileSync(path.join(__dirname, "..", "housing_exam_hell", "js", "app.js"), "utf8");
appCode = appCode.replace("const ExamEngine = {", "window.ExamEngine = {");
eval(appCode);

const ExamEngine = window.ExamEngine;
const allPool = [
    ...ExamEngine.getQuestionPool("관계법규", "choice"),
    ...ExamEngine.getQuestionPool("관계법규", "short"),
    ...ExamEngine.getQuestionPool("관리실무", "choice"),
    ...ExamEngine.getQuestionPool("관리실무", "short")
];

const backupPath = path.join(__dirname, "..", "backups", "firestore_full_backup_20260831_1605.json");
const existingEdits = fs.existsSync(backupPath) ? (JSON.parse(fs.readFileSync(backupPath, "utf8")).allCustomEdits || {}) : {};

let progressData = fs.existsSync(PROGRESS_FILE) ? JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")) : {};
let criticalErrorsLog = fs.existsSync(CRITICAL_ERRORS_JSON) ? JSON.parse(fs.readFileSync(CRITICAL_ERRORS_JSON, "utf8")) : [];
let preBackup = fs.existsSync(PRE_BACKUP_JSON) ? JSON.parse(fs.readFileSync(PRE_BACKUP_JSON, "utf8")) : {};

const targetQuestions = allPool.filter(q => q.topScore === 5 && !existingEdits[q.qKey] && !progressData[q.qKey]);

console.log(`📋 Remaining 5-Score Questions: ${targetQuestions.length} (Already completed: ${Object.keys(progressData).length}/417)`);

const SYSTEM_PROMPT = `당신은 대한민국 주택관리사(보) 2차 국가전문자격시험(관계법규, 공동주택관리실무)의 최고 일타강사이자 국가전문자격시험 출제위원급 검증 전문가입니다.
사용자가 제공하는 문제(객관식 5지선다 또는 주관식 단답/기입형), 정답, 해설, 팁을 면밀히 분석하고 검증하여 2026년 7월 기준 최신 개정 법령 및 표준 실무 기준에 완벽히 부합하도록 교정합니다.

[핵심 작성 원칙]
1. 사전 지식 과신 금지 및 2026년 최신 개정 법령 철저 준수:
   - 2026년 최신 개정 법령의 조문, 수치, 행정기관 명칭을 정확히 확인 후 교정하십시오.
2. 지문 표기 완전 통일 (동그라미 숫자):
   - 객관식 지문은 무조건 동그라미 숫자(①, ②, ③, ④, ⑤)로만 표기하십시오. ('선택지 1번', '1.', '3번 지문' 등 혼용 절대 금지)
   - 주관식 빈칸은 [㉠], [㉡], [㉢] 등으로 표기하십시오.
3. 해설 간결화 및 법조문 번호 배제:
   - 「법률명」 제00조 제0항 같은 단순 조문 번호 나열은 일체 쓰지 말고, 법률의 실제 요건, 핵심 수치, 개념에만 집중하십시오.
   - ❌ [오답 지문 수정]: 왜 틀렸는지 핵심 이유와 올바른 정문(正文)을 제시하십시오.
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
    throw new Error("No JSON found: " + fullText.substring(0, 100));
}

async function callGemini(q, useSearch = true) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const prompt = `[검증 대상 문항 정보]
- 과목: ${q.subject} (${q.type === "choice" ? "객관식 5지선다" : "주관식 단답/기입형"})
- 단원: ${q.chapterName}
- 문제: ${q.question || q.title}
${q.passage ? `- 지문/보기:\n${q.passage}` : ""}
${q.options && q.options.length > 0 ? `- 선택 보기:\n${q.options.map((o, i) => `${i+1}. ${o}`).join("\n")}` : ""}
- 기존 정답: ${q.type === "choice" ? q.answer : JSON.stringify(q.answers || {})}
- 기존 해설: ${q.explanation || "해설 없음"}
- 기존 팁: ${q.tip || "팁 없음"}`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.1 }
    };
    if (useSearch) {
        body.tools = [{ googleSearch: {} }];
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.candidates || !data.candidates[0]?.content?.parts || !data.candidates[0]?.content?.parts[0]?.text) {
        throw new Error("Empty candidate parts");
    }
    return extractJsonFromParts(data.candidates[0].content.parts);
}

async function enhanceQuestion(q) {
    try {
        return await callGemini(q, true);
    } catch (e) {
        // Fast fallback without search
        return await callGemini(q, false);
    }
}

async function run() {
    const total = targetQuestions.length;
    let currentIndex = 0;
    let completed = 0;

    async function worker(workerId) {
        while (currentIndex < targetQuestions.length) {
            const idx = currentIndex++;
            const q = targetQuestions[idx];
            const currentTotal = Object.keys(progressData).length + 1;
            console.log(`[W${workerId}] [${currentTotal}/417] Enhancing ${q.qKey}...`);

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
                const enhanced = await enhanceQuestion(q);
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
                completed++;

                if (resultRecord.isCriticalError) {
                    console.log(`[W${workerId}] 🚨 [CRITICAL ERROR: ${resultRecord.errorType}] ${q.qKey}`);
                    criticalErrorsLog.push({
                        qKey: q.qKey,
                        errorType: resultRecord.errorType,
                        errorSummary: resultRecord.errorSummary,
                        original: preBackup[q.qKey],
                        enhanced: resultRecord,
                        detectedAt: new Date().toISOString()
                    });
                } else {
                    console.log(`[W${workerId}] ✅ OK ${q.qKey}`);
                }

                fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressData, null, 2), "utf8");
                fs.writeFileSync(PRE_BACKUP_JSON, JSON.stringify(preBackup, null, 2), "utf8");
                fs.writeFileSync(CRITICAL_ERRORS_JSON, JSON.stringify(criticalErrorsLog, null, 2), "utf8");

                await new Promise(r => setTimeout(r, 300));
            } catch (err) {
                console.log(`[W${workerId}] ❌ FAILED: ${err.message}`);
            }
        }
    }

    await Promise.all([worker(1), worker(2), worker(3), worker(4)]);
    console.log(`\n🎉 All ${Object.keys(progressData).length}/417 items finished successfully!`);
}

run();
