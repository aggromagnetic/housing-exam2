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
    console.error('ERROR: GEMINI_API_KEY not found in .env');
    process.exit(1);
}

const SOURCE_DIR = path.join(__dirname, '..', 'exam_data', '추가문제');
const OUTPUT_DIR = path.join(__dirname, '..', 'exam_data', '추가문제_parsed');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 2. Call Gemini 3.7 Flash API with retry
async function callGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${API_KEY}`;
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
            await new Promise(r => setTimeout(r, 2000 * attempts));
        }
    }
}

// 3. Prompt Builder
function buildPrompt(subject, teacher, chunkText, answerKeyText = "") {
    return `당신은 대한민국 주택관리사보 2차 시험(${subject}) 수석 출제위원이자 최고 권위의 법률 검수 위원입니다.
아래의 100선 특강 문제 텍스트(강사: ${teacher})를 분석하여 최신 개정 법령에 부합하는 정밀한 JSON 문제 배열로 변환하세요.

[지침]
1. 원문 보존 및 오타 교정:
   - 문제의 발문과 선택지 텍스트는 최신 개정 법률이 반영된 것이므로 단어를 임의로 바꾸지 마세요.
   - 단, 명백한 OCR 오탈자(예: '다읍'→'다음', '사옹자'→'사용자', 깨진 특수문자 등)만 교정하세요.
2. 정확한 챕터(단원) 테마 분류:
   - 관계법규: "CHAPTER 01 주택법", "CHAPTER 02 공동주택관리법", "CHAPTER 03 민간임대주택에 관한 특별법", "CHAPTER 04 공공주택 특별법", "CHAPTER 05 건축법", "CHAPTER 06 도시 및 주거환경정비법", "CHAPTER 07 도시재정비 촉진을 위한 특별법", "CHAPTER 08 시설물의 안전 및 유지관리에 관한 특별법", "CHAPTER 09 소방기본법", "CHAPTER 10 화재의 예방 및 안전관리에 관한 법률", "CHAPTER 11 소방시설 설치 및 관리에 관한 법률", "CHAPTER 12 전기사업법", "CHAPTER 13 승강기 안전관리법", "CHAPTER 14 집합건물의 소유 및 관리에 관한 법률"
   - 관리실무: "CHAPTER 01 주택의 정의 및 용어", "CHAPTER 02 총칙 및 관리기준", "CHAPTER 03 공동주택의 관리방법", "CHAPTER 04 관리조직 및 입주자대표회의", "CHAPTER 05 주택관리사 제도", "CHAPTER 07 입주자관리 및 규약", "CHAPTER 08 사무 및 인사관리", "CHAPTER 09 대외업무 및 리모델링", "CHAPTER 10 회계관리", "CHAPTER 11 시설관리", "CHAPTER 12 환경 및 안전관리"
3. 모든 보기/지문별 정답 및 오답 상세 교정 해설 작성 (필수):
   - 객관식의 경우 모든 선택지(①~⑤)에 대해 각각 정답 이유와 오답 이유를 명쾌하게 밝히고, 틀린 지문은 올바른 법 조문과 수치로 정확히 교정(지문수정)하여 작성하세요.
   - 해설 포맷 예시:
     - ① (오답): 도시형 생활주택은 '300세대 미만'이어야 하므로 300세대인 주택은 해당하지 않는다.
     - ② (오답): 아파트형 주택과 도시형 생활주택 외의 주택을 함께 건축할 수 있는 지역은 '준주거지역 또는 상업지역'이다.(준공업지역 ❌)
     - ③ (정답): 하나의 건축물에는 단지형 다세대주택과 아파트형 주택을 함께 건축할 수 없다.
     - ④ (오답): 주택 층수를 5개 층까지 완화하려면 '도시계획위원회'가 아니라 「건축법」에 따른 '건축위원회'의 심의를 거쳐야 한다.
     - ⑤ (오답): 주거전용면적 85㎡ 초과 1세대를 함께 건축할 수 있는 예외는 단지형 다세대주택에는 허용되지 않는다.
   - 주관식의 경우 괄호 안에 들어갈 정확한 정답 숫자/용어와 조문 근거를 해설에 상세히 기재하세요.
4. 일타 팁(tip): 해당 문제의 핵심 출제 포인트와 암기 요령을 1~2문장으로 작성하세요.

반드시 다음 JSON 스키마로 출력하세요:
{
  "questions": [
    {
      "id": "문항번호 (예: '01', '02', '31' 등)",
      "type": "choice" 또는 "short",
      "subject": "${subject}",
      "chapter": "단원명 (예: 'CHAPTER 01 주택법')",
      "category": "세부주제 (예: '주택법 - 도시형 생활주택')",
      "exam_info": "${teacher} 100선 특강",
      "title": "문항 핵심 주제 제목",
      "question": "문제 본문",
      "passage": "보기/지문 박스 내용 (없으면 '')",
      "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"] (주관식이면 빈 배열 []),
      "answer": 객관식인 경우 정수(1~5), 주관식이면 0,
      "answers": 주관식인 경우 {"㉠": "정답1", "㉡": "정답2"} (객관식이면 {}),
      "explanation": "모든 선택지별 상세 정오답 교정 해설",
      "tip": "핵심 암기 요령"
    }
  ]
}

${answerKeyText ? `[참고 정답표]\n${answerKeyText}\n` : ''}

[변환 대상 텍스트]
${chunkText}`;
}

// 4. Split text into chunks by question numbers
function splitIntoQuestionChunks(fullText, chunkSize = 5) {
    const lines = fullText.split('\n');
    const questionBlocks = [];
    let currentBlock = [];

    const qStartRegex = /^\s*(\d+)\.\s+/;

    for (const line of lines) {
        if (qStartRegex.test(line)) {
            if (currentBlock.length > 0) {
                questionBlocks.push(currentBlock.join('\n'));
                currentBlock = [];
            }
        }
        currentBlock.push(line);
    }
    if (currentBlock.length > 0) {
        questionBlocks.push(currentBlock.join('\n'));
    }

    // Group blocks into chunks of chunkSize questions
    const chunks = [];
    for (let i = 0; i < questionBlocks.length; i += chunkSize) {
        chunks.push(questionBlocks.slice(i, i + chunkSize).join('\n\n'));
    }
    return chunks;
}

// 5. Process File
async function processFile(filename, subject, teacher) {
    const filePath = path.join(SOURCE_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return [];
    }

    console.log(`\n======================================================`);
    console.log(`🚀 Processing: ${filename} (${subject} / ${teacher})`);
    console.log(`======================================================`);

    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract answer key if present at the end
    let mainContent = content;
    let answerKeyText = "";
    const answerKeyMatch = content.match(/(?:정답표|정답 및 해설|제1장 주택법\s*\n\s*1\.\s*\d)[\s\S]*$/);
    if (answerKeyMatch && answerKeyMatch.index > content.length * 0.7) {
        answerKeyText = answerKeyMatch[0];
        mainContent = content.slice(0, answerKeyMatch.index);
    }

    const chunks = splitIntoQuestionChunks(mainContent, 5);
    console.log(`Total question chunks to process: ${chunks.length}`);

    const baseName = path.basename(filename, path.extname(filename));
    const allQuestions = [];

    for (let idx = 0; idx < chunks.length; idx++) {
        const chunkIndex = idx + 1;
        const chunkOutputFile = path.join(OUTPUT_DIR, `${baseName}_chunk_${String(chunkIndex).padStart(3, '0')}.json`);

        if (fs.existsSync(chunkOutputFile)) {
            console.log(`⏩ [Chunk ${chunkIndex}/${chunks.length}] Already processed. Loading cache.`);
            try {
                const cached = JSON.parse(fs.readFileSync(chunkOutputFile, 'utf-8'));
                if (Array.isArray(cached.questions)) {
                    allQuestions.push(...cached.questions);
                }
            } catch (e) {
                console.warn(`Error reading cached chunk ${chunkOutputFile}:`, e.message);
            }
            continue;
        }

        console.log(`⚡ [Chunk ${chunkIndex}/${chunks.length}] Calling Gemini 3.7 Flash...`);
        const prompt = buildPrompt(subject, teacher, chunks[idx], answerKeyText);
        try {
            const result = await callGemini(prompt);
            if (result && Array.isArray(result.questions)) {
                fs.writeFileSync(chunkOutputFile, JSON.stringify(result, null, 2), 'utf-8');
                allQuestions.push(...result.questions);
                console.log(`   ✓ Extracted ${result.questions.length} questions.`);
            } else {
                console.warn(`   ⚠️ Unexpected result structure:`, result);
            }
        } catch (err) {
            console.error(`   ❌ Failed chunk ${chunkIndex}:`, err.message);
        }

        // Brief delay between API calls
        await new Promise(r => setTimeout(r, 1000));
    }

    const combinedFile = path.join(OUTPUT_DIR, `${baseName}_ALL.json`);
    fs.writeFileSync(combinedFile, JSON.stringify({ filename, subject, teacher, count: allQuestions.length, questions: allQuestions }, null, 2), 'utf-8');
    console.log(`✅ Saved all ${allQuestions.length} questions for ${filename} to ${combinedFile}`);
    return allQuestions;
}

// 6. Master Runner
async function runAll() {
    const tasks = [
        { file: '[1강][주택][관계법규][윤동섭][100선 마무리특강]_50제(1)_unlocked.txt', subject: '관계법규', teacher: '윤동섭' },
        { file: '[1강][주택][관계법규][윤동섭][100선 마무리특강]_50제(2)_unlocked.txt', subject: '관계법규', teacher: '윤동섭' },
        { file: '[1강][주택][관계법규][이재욱][100선 마무리특강]_문제_정답 (1)_unlocked.txt', subject: '관계법규', teacher: '이재욱' },
        { file: '[1강][주택][관리실무][김영곤][100선 마무리특강]_문제_unlocked.txt', subject: '관리실무', teacher: '김영곤' },
        { file: '[1강][주택][관리실무][박성진][100선 마무리특강]_문제_unlocked.txt', subject: '관리실무', teacher: '박성진' }
    ];

    console.log(`================================================================`);
    console.log(`🌟 Starting Batch Conversion of 400 Questions with Gemini 3.7 Flash`);
    console.log(`================================================================`);

    for (const task of tasks) {
        await processFile(task.file, task.subject, task.teacher);
    }

    console.log(`\n🎉 All 400 questions processed! Ready to merge into exam_bank.js.`);
}

module.exports = { runAll, processFile };

if (require.main === module) {
    runAll().catch(console.error);
}
