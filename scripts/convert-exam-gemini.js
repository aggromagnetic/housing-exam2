const fs = require('fs');
const path = require('path');

// 1. Load API Key
function getApiKey() {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.+)/);
        if (match) return match[1].trim();
    }
    return null;
}

const API_KEY = getApiKey();
if (!API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not found in .env or environment variables.');
    process.exit(1);
}

// Output directory
const OUTPUT_DIR = path.join(__dirname, '..', 'exam_data', '관리실무', '객관식');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Call Gemini 2.5 Flash API with retry
async function callGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
        }
    };

    let attempts = 0;
    while (attempts < 5) {
        attempts++;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errText}`);
            }

            const data = await res.json();
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
                const text = data.candidates[0].content.parts[0].text;
                return JSON.parse(text);
            } else {
                throw new Error('Empty or unexpected API response: ' + JSON.stringify(data));
            }
        } catch (err) {
            console.warn(`   [Retry ${attempts}/5] ${err.message}`);
            if (attempts >= 5) throw err;
            await new Promise(r => setTimeout(r, 3000 * attempts));
        }
    }
}

// Build extraction prompt
function buildPrompt(chapterTitle, chunkText, isSubChunk = false, partIndex = 1, totalParts = 1) {
    return `당신은 주택관리사보 2차 시험(공동주택관리실무) 전문 AI 데이터 엔지니어입니다.
아래의 OCR 전사 텍스트를 분석하여 오타와 다단 깨짐을 완벽히 교정하고, 모든 객관식 문제를 정밀한 JSON 포맷으로 변환하세요.

[교정 및 추출 지침]
1. 문항 식별 및 번호 표준화:
   - '°τ', '°1', '°2', '초 기출 02', '° 5', '°10' 등 깨진 번호 기호를 '01', '02', '대표기출 01' 등의 표준 ID 문자열로 변환합니다.
2. OCR 오탈자 완벽 교정:
   - '다읍'→'다음', '사옹자'→'사용자', '공등'→'공동', '용토'→'용도', '제촐'→'제출' 등 오탈자를 한국어 문맥과 공동주택관리법/건축법 등 법률 용어에 맞게 완벽 교정합니다.
3. 보기/지문 분리 (passage):
   - ㉠, ㉡, ㉢ 등 박스형 조건문이나 지문은 'passage' 필드에 개행(\\n)을 보존하여 분리합니다. 보기 박스가 없는 일반 문항은 빈 문자열("")로 둡니다.
4. 선택지(options):
   - ①, ②, ③, ④, ⑤ 기호는 제거하고, 순수 지문 5개를 요소로 갖는 문자열 배열 ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"]로 구성합니다.
5. 정답(answer):
   - 1, 2, 3, 4, 5 중 해당하는 정답 번호를 정수(integer)로 기입합니다.
6. 해설(explanation):
   - 앞에 붙은 '삐', '버', '미', 'ㄿ', '뼈' 등 기호를 제거하고, 완전하고 명확한 문장으로 복원합니다.
7. 일타 팁(tip):
   - 해당 문제의 핵심 출제 포인트나 암기 팁, 함정 주의사항을 1~2문장으로 명쾌하게 작성합니다.

반드시 다음 JSON 스키마로만 출력하세요:
{
  "chapter": "${chapterTitle}",
  "subject": "관리실무",
  "category": "행정관리 - ${chapterTitle}",
  "questions": [
    {
      "id": "01",
      "exam_info": "제25회" (기출 회차가 명시되어 있지 않으면 ""),
      "title": "출제 주제 또는 문항 핵심 제목",
      "question": "문제 본문 발문",
      "passage": "보기 지문 (없으면 \"\")",
      "options": ["1번 지문", "2번 지문", "3번 지문", "4번 지문", "5번 지문"],
      "answer": 4,
      "explanation": "정답 및 상세 해설 문장",
      "tip": "핵심 암기 팁 또는 함정 방지 팁"
    }
  ]
}

[OCR 원본 텍스트 (${chapterTitle} ${isSubChunk ? `Part ${partIndex}/${totalParts}` : ''})]
${chunkText}`;
}

// Split large raw text into clean chunks of ~350-450 lines at natural question boundaries
function splitTextIntoCleanChunks(rawText, targetLinesPerChunk = 400) {
    const lines = rawText.split('\n');
    if (lines.length <= targetLinesPerChunk * 1.3) {
        return [rawText];
    }

    const chunks = [];
    let startLine = 0;

    while (startLine < lines.length) {
        let endLine = Math.min(startLine + targetLinesPerChunk, lines.length);

        if (endLine < lines.length) {
            // Find natural split boundary within next 100 lines (looking for new question start)
            let bestSplit = -1;
            for (let i = endLine; i < Math.min(endLine + 100, lines.length); i++) {
                const l = lines[i];
                if (l.match(/^°\s*[\dτ]/) || l.match(/^(?:초\s*)?기출\s*\d+/) || l.match(/^CHAPTER\s+\d+/i)) {
                    bestSplit = i;
                    break;
                }
            }
            if (bestSplit === -1) {
                // Look backwards 80 lines for split
                for (let i = endLine; i >= Math.max(startLine + 200, endLine - 80); i--) {
                    const l = lines[i];
                    if (l.match(/^°\s*[\dτ]/) || l.match(/^(?:초\s*)?기출\s*\d+/) || l.match(/^CHAPTER\s+\d+/i)) {
                        bestSplit = i;
                        break;
                    }
                }
            }
            if (bestSplit !== -1) {
                endLine = bestSplit;
            }
        }

        const chunkLines = lines.slice(startLine, endLine);
        chunks.push(chunkLines.join('\n'));
        startLine = endLine;
    }

    return chunks;
}

// Process a single file
async function processFile(filePath, force = false) {
    const fileName = path.basename(filePath);
    const nameMatch = fileName.match(/(\d+)\s+(.+)\.txt$/);
    const chapterNum = nameMatch ? nameMatch[1].padStart(2, '0') : '01';
    const chapterName = nameMatch ? nameMatch[2] : fileName.replace('.txt', '');
    const chapterTitle = `CHAPTER ${chapterNum} ${chapterName}`;
    const outFileName = `${chapterNum}_${chapterName.replace(/\s+/g, '_')}.json`;
    const outPath = path.join(OUTPUT_DIR, outFileName);

    // Skip if already converted and valid
    if (!force && fs.existsSync(outPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
            if (existing && Array.isArray(existing.questions) && existing.questions.length > 0) {
                console.log(`[SKIP] Already exists: ${outFileName} (${existing.questions.length} questions)`);
                return existing;
            }
        } catch (e) {
            // invalid JSON, re-process
        }
    }

    console.log(`\n========================================`);
    console.log(`Processing: ${fileName}`);
    console.log(`========================================`);

    const rawText = fs.readFileSync(filePath, 'utf-8');
    const lines = rawText.split('\n');
    console.log(`Total lines: ${lines.length}, File size: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`);

    const chunks = splitTextIntoCleanChunks(rawText, 400);
    console.log(`Divided into ${chunks.length} clean chunk(s).`);

    const allQuestions = [];
    let metaInfo = null;

    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunk = chunks[cIdx];
        console.log(`-> Processing Chunk ${cIdx + 1}/${chunks.length} (${chunk.split('\n').length} lines)...`);
        const prompt = buildPrompt(chapterTitle, chunk, chunks.length > 1, cIdx + 1, chunks.length);
        
        const result = await callGemini(prompt);
        if (result && Array.isArray(result.questions)) {
            console.log(`   Chunk ${cIdx + 1} converted: +${result.questions.length} questions`);
            if (!metaInfo) {
                metaInfo = {
                    chapter: result.chapter || chapterTitle,
                    subject: result.subject || "관리실무",
                    category: result.category || `행정관리 - ${chapterName}`
                };
            }
            allQuestions.push(...result.questions);
        } else {
            console.error(`   Warning: Failed to extract questions from chunk ${cIdx + 1}`);
        }

        // Polite delay between chunk calls
        await new Promise(r => setTimeout(r, 1500));
    }

    // Deduplicate & re-index IDs cleanly
    const finalQuestions = allQuestions.map((q, idx) => {
        const standardId = String(idx + 1).padStart(2, '0');
        return {
            id: standardId,
            exam_info: q.exam_info || "",
            title: q.title || "",
            question: q.question ? q.question.trim() : "",
            passage: q.passage ? q.passage.trim() : "",
            options: Array.isArray(q.options) ? q.options.map(opt => String(opt).replace(/^[①-⑤\d\.\s]+/, '').trim()) : [],
            answer: typeof q.answer === 'number' ? q.answer : (parseInt(q.answer, 10) || 1),
            explanation: q.explanation ? q.explanation.trim() : "",
            tip: q.tip ? q.tip.trim() : ""
        };
    });

    const finalJson = {
        chapter: metaInfo ? metaInfo.chapter : chapterTitle,
        subject: metaInfo ? metaInfo.subject : "관리실무",
        category: metaInfo ? metaInfo.category : `행정관리 - ${chapterName}`,
        total_count: finalQuestions.length,
        source_file: fileName,
        updated_at: new Date().toISOString(),
        questions: finalQuestions
    };

    fs.writeFileSync(outPath, JSON.stringify(finalJson, null, 2), 'utf-8');
    console.log(`Saved: ${outPath} (Total ${finalQuestions.length} questions)\n`);
    return finalJson;
}

// Master CLI Runner for ALL files
async function main() {
    const rawDir = path.join(__dirname, '..', 'exam_data', 'txt문제', '관리실무', '객관식');
    const files = fs.readdirSync(rawDir)
        .map(f => f.normalize('NFC'))
        .filter(f => f.endsWith('.txt'))
        .sort((a, b) => {
            const numA = parseInt((a.match(/(\d+)/) || [0, 0])[1], 10);
            const numB = parseInt((b.match(/(\d+)/) || [0, 0])[1], 10);
            return numA - numB;
        });

    console.log(`Starting Batch Conversion for all ${files.length} chapters of 관리실무 객관식...`);
    const startTime = Date.now();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`\n[Progress: ${i + 1}/${files.length}] Starting ${file}...`);
        try {
            await processFile(path.join(rawDir, file));
        } catch (err) {
            console.error(`[ERROR] Failed to convert ${file}:`, err);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n========================================`);
    console.log(`All ${files.length} chapters processed in ${elapsed}s!`);
    console.log(`Output directory: ${OUTPUT_DIR}`);
    console.log(`========================================`);
}

main().catch(err => {
    console.error('Fatal batch error:', err);
    process.exit(1);
});
