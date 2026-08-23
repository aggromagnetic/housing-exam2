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
    console.error('ERROR: GEMINI_API_KEY not found.');
    process.exit(1);
}

// Ensure base directories exist
const BASE_EXAM_DIR = path.join(__dirname, '..', 'exam_data');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
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

// Split large raw text into clean chunks (~400 lines target)
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
            let bestSplit = -1;
            for (let i = endLine; i < Math.min(endLine + 100, lines.length); i++) {
                const l = lines[i];
                if (l.match(/^°\s*[\dτ]/) || l.match(/^(?:초\s*)?기출\s*\d+/) || l.match(/^CHAPTER\s+\d+/i) || l.match(/^回\s*\d+/)) {
                    bestSplit = i;
                    break;
                }
            }
            if (bestSplit === -1) {
                for (let i = endLine; i >= Math.max(startLine + 200, endLine - 80); i--) {
                    const l = lines[i];
                    if (l.match(/^°\s*[\dτ]/) || l.match(/^(?:초\s*)?기출\s*\d+/) || l.match(/^CHAPTER\s+\d+/i) || l.match(/^回\s*\d+/)) {
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

// Prompt for Multiple Choice (객관식)
function buildChoicePrompt(subject, chapterTitle, chunkText, isSubChunk, partIndex, totalParts) {
    return `당신은 주택관리사보 2차 시험(${subject}) 전문 AI 데이터 엔지니어입니다.
아래의 OCR 전사 텍스트를 분석하여 오타와 레이아웃 깨짐을 완벽히 교정하고, 모든 객관식 문제를 정밀한 JSON 포맷으로 변환하세요.

[교정 및 추출 지침]
1. 문항 번호 표준화: 깨진 기호를 '01', '02', '대표기출 01' 등의 표준 ID로 변환합니다.
2. OCR 오탈자 완벽 교정: 한국어 문맥과 법률 조문에 맞게 완벽 교정합니다.
3. 보기/지문 분리 (passage): ㉠, ㉡ 등 조건문이나 지문은 'passage' 필드에 개행(\\n)을 보존하여 분리하고, 없으면 ""로 둡니다.
4. 선택지(options): ①, ②, ③, ④, ⑤ 기호는 제거하고, 순수 지문 5개를 요소로 갖는 문자열 배열 ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"]로 구성합니다.
5. 정답(answer): 1, 2, 3, 4, 5 중 해당하는 정답 번호를 정수(integer)로 기입합니다.
6. 해설(explanation): 앞에 붙은 더미 기호를 제거하고, 완전하고 명확한 문장으로 복원합니다.
7. 팁(tip): 핵심 출제 포인트나 암기 팁을 1문장으로 작성합니다.

반드시 다음 JSON 스키마로만 출력하세요:
{
  "chapter": "${chapterTitle}",
  "subject": "${subject}",
  "category": "${subject} - ${chapterTitle}",
  "questions": [
    {
      "id": "01",
      "exam_info": "",
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

// Prompt for Subjective (주관식)
function buildSubjectivePrompt(subject, chapterTitle, chunkText, isSubChunk, partIndex, totalParts) {
    return `당신은 주택관리사보 2차 시험(${subject}) 전문 AI 데이터 엔지니어입니다.
아래의 OCR 전사 텍스트를 분석하여 오타와 레이아웃 깨짐을 완벽히 교정하고, 모든 주관식(단답형/괄호넣기) 문제를 정밀한 JSON 포맷으로 변환하세요.

[교정 및 추출 지침]
1. 문항 번호 표준화: '01', '02', '대표기출 01' 등의 표준 ID로 변환합니다.
2. OCR 오탈자 완벽 교정: 오탈자를 법령 용어 및 수치에 맞게 완벽 교정합니다.
3. 문제 본문(question) 및 지문(passage):
   - 빈칸은 ( ㉠ ), ( ㉡ ) 등의 통일된 기호로 표기합니다.
4. 정답(answers):
   - 각 빈칸 기호를 키로 하고 올바른 정답 단어/수치를 값으로 갖는 객체로 작성합니다. 예: { "㉠": "주거환경", "㉡": "주택시장" }
5. 해설(explanation):
   - 문제와 정답에 대한 명확한 법률적 근거 및 해설 문장을 작성합니다.
6. 팁(tip):
   - 빈칸 단답형 핵심 암기 공식이나 혼동하기 쉬운 용어 팁을 1문장으로 작성합니다.

반드시 다음 JSON 스키마로만 출력하세요:
{
  "chapter": "${chapterTitle}",
  "subject": "${subject}",
  "category": "${subject} - ${chapterTitle}",
  "questions": [
    {
      "id": "01",
      "exam_info": "",
      "title": "출제 주제",
      "question": "문제 본문 발문 및 조항 설명",
      "passage": "지문 또는 본문 전문 (필요시)",
      "answers": {
        "㉠": "정답단어1",
        "㉡": "정답단어2"
      },
      "explanation": "상세 해설",
      "tip": "핵심 암기 팁"
    }
  ]
}

[OCR 원본 텍스트 (${chapterTitle} ${isSubChunk ? `Part ${partIndex}/${totalParts}` : ''})]
${chunkText}`;
}

// Convert a folder of TXT files
async function convertFolder(srcDir, destDir, subject, type) {
    ensureDir(destDir);
    const files = fs.readdirSync(srcDir)
        .map(f => f.normalize('NFC'))
        .filter(f => f.endsWith('.txt'))
        .sort((a, b) => {
            const numA = parseFloat((a.match(/(\d+(?:-\d+)?)/) || [0, 0])[1].replace('-', '.'));
            const numB = parseFloat((b.match(/(\d+(?:-\d+)?)/) || [0, 0])[1].replace('-', '.'));
            return numA - numB;
        });

    console.log(`\n======================================================`);
    console.log(`[BATCH] Starting ${subject} ${type === 'choice' ? '객관식' : '주관식'} (${files.length} files)`);
    console.log(`======================================================`);

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(srcDir, file);
        const nameMatch = file.match(/(\d+(?:-\d+)?)\s+(.+)\.txt$/);
        const chapterNum = nameMatch ? nameMatch[1].padStart(2, '0') : String(i + 1).padStart(2, '0');
        const chapterName = nameMatch ? nameMatch[2] : file.replace('.txt', '');
        const chapterTitle = `CHAPTER ${chapterNum} ${chapterName}`;
        const outFileName = `${chapterNum}_${chapterName.replace(/\s+/g, '_')}.json`;
        const outPath = path.join(destDir, outFileName);

        // Check if already converted and valid
        if (fs.existsSync(outPath)) {
            try {
                const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
                if (existing && Array.isArray(existing.questions) && existing.questions.length > 0) {
                    console.log(`[${i + 1}/${files.length}] [SKIP] Already exists: ${outFileName} (${existing.questions.length} questions)`);
                    continue;
                }
            } catch (e) {}
        }

        console.log(`\n[${i + 1}/${files.length}] Processing: ${file}`);
        const rawText = fs.readFileSync(filePath, 'utf-8');
        const chunks = splitTextIntoCleanChunks(rawText, 400);
        console.log(`Divided into ${chunks.length} clean chunk(s)...`);

        const allQuestions = [];
        let metaInfo = null;

        for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
            const chunk = chunks[cIdx];
            console.log(`-> Processing Chunk ${cIdx + 1}/${chunks.length} (${chunk.split('\n').length} lines)...`);
            const prompt = type === 'choice' 
                ? buildChoicePrompt(subject, chapterTitle, chunk, chunks.length > 1, cIdx + 1, chunks.length)
                : buildSubjectivePrompt(subject, chapterTitle, chunk, chunks.length > 1, cIdx + 1, chunks.length);

            const result = await callGemini(prompt);
            if (result && Array.isArray(result.questions)) {
                console.log(`   Chunk ${cIdx + 1} converted: +${result.questions.length} questions`);
                if (!metaInfo) {
                    metaInfo = {
                        chapter: result.chapter || chapterTitle,
                        subject: result.subject || subject,
                        category: result.category || `${subject} - ${chapterName}`
                    };
                }
                allQuestions.push(...result.questions);
            }

            await new Promise(r => setTimeout(r, 1500));
        }

        const finalQuestions = allQuestions.map((q, idx) => {
            const standardId = String(idx + 1).padStart(2, '0');
            if (type === 'choice') {
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
            } else {
                return {
                    id: standardId,
                    exam_info: q.exam_info || "",
                    title: q.title || "",
                    question: q.question ? q.question.trim() : "",
                    passage: q.passage ? q.passage.trim() : "",
                    answers: q.answers && typeof q.answers === 'object' ? q.answers : {},
                    explanation: q.explanation ? q.explanation.trim() : "",
                    tip: q.tip ? q.tip.trim() : ""
                };
            }
        });

        const finalJson = {
            chapter: metaInfo ? metaInfo.chapter : chapterTitle,
            subject: subject,
            category: metaInfo ? metaInfo.category : `${subject} - ${chapterName}`,
            type: type,
            total_count: finalQuestions.length,
            source_file: file,
            updated_at: new Date().toISOString(),
            questions: finalQuestions
        };

        fs.writeFileSync(outPath, JSON.stringify(finalJson, null, 2), 'utf-8');
        console.log(`Saved: ${outPath} (Total ${finalQuestions.length} questions)\n`);
    }

    // Build Master File for this section
    buildMasterFile(destDir, subject, type);
}

// Build Master Consolidated Dataset
function buildMasterFile(destDir, subject, type) {
    const parentDir = path.dirname(destDir);
    const typeLabel = type === 'choice' ? '객관식' : '주관식';
    const masterJsonName = `${subject}_${typeLabel}_전체.json`;
    const masterJsName = `${subject}_${typeLabel}_전체.js`;
    const varName = subject === '관리실무' 
        ? (type === 'choice' ? 'EXAM_DATA_GWANRI_MC' : 'EXAM_DATA_GWANRI_SA')
        : (type === 'choice' ? 'EXAM_DATA_LAW_MC' : 'EXAM_DATA_LAW_SA');

    const files = fs.readdirSync(destDir)
        .map(f => f.normalize('NFC'))
        .filter(f => f.endsWith('.json') && !f.includes('전체'))
        .sort();

    const masterData = {
        subject: subject,
        type: type,
        totalChapters: files.length,
        totalQuestions: 0,
        updatedAt: new Date().toISOString(),
        chapters: []
    };

    files.forEach(f => {
        try {
            const cData = JSON.parse(fs.readFileSync(path.join(destDir, f), 'utf-8'));
            masterData.chapters.push(cData);
            masterData.totalQuestions += (cData.questions || []).length;
        } catch (e) {}
    });

    const outJsonPath = path.join(parentDir, masterJsonName);
    const outJsPath = path.join(parentDir, masterJsName);

    fs.writeFileSync(outJsonPath, JSON.stringify(masterData, null, 2), 'utf-8');
    fs.writeFileSync(outJsPath, `window.${varName} = ` + JSON.stringify(masterData, null, 2) + ';', 'utf-8');

    console.log(`[MASTER] Created: ${masterJsonName} (Total ${masterData.totalQuestions} questions across ${masterData.totalChapters} chapters)\n`);
}

// Consolidate existing 관계법규 주관식 (28 files -> 14 unified law files)
function consolidateExistingLawSubjective() {
    const srcDir = path.join(__dirname, '..', 'exam_data', '관계법규', '주관식');
    const targetCleanDir = path.join(__dirname, '..', 'exam_data', '관계법규', '주관식_통합');
    ensureDir(targetCleanDir);

    const files = fs.readdirSync(srcDir).map(f => f.normalize('NFC'));
    console.log(`\n======================================================`);
    console.log(`[CONSOLIDATE] Processing 관계법규 주관식 (28 files -> 14 Laws)`);
    console.log(`======================================================`);

    const lawsMap = {
        '01_주택법': { chapter: 'CHAPTER 01 주택법', questions: [] },
        '02_공동주택관리법': { chapter: 'CHAPTER 02 공동주택관리법', questions: [] },
        '03_민간임대주택에_관한_특별법': { chapter: 'CHAPTER 03 민간임대주택에 관한 특별법', questions: [] },
        '04_공공주택_특별법': { chapter: 'CHAPTER 04 공공주택 특별법', questions: [] },
        '05_건축법': { chapter: 'CHAPTER 05 건축법', questions: [] },
        '06_도시_및_주거환경정비법': { chapter: 'CHAPTER 06 도시 및 주거환경정비법', questions: [] },
        '07_도시재정비_촉진을_위한_특별법': { chapter: 'CHAPTER 07 도시재정비 촉진을 위한 특별법', questions: [] },
        '08_시설물의_안전_및_유지관리에_관한_특별법': { chapter: 'CHAPTER 08 시설물의 안전 및 유지관리에 관한 특별법', questions: [] },
        '09_소방기본법': { chapter: 'CHAPTER 09 소방기본법', questions: [] },
        '10_화재의_예방_및_안전관리에_관한_법률': { chapter: 'CHAPTER 10 화재의 예방 및 안전관리에 관한 법률', questions: [] },
        '11_소방시설_설치_및_관리에_관한_법률': { chapter: 'CHAPTER 11 소방시설 설치 및 관리에 관한 법률', questions: [] },
        '12_전기사업법': { chapter: 'CHAPTER 12 전기사업법', questions: [] },
        '13_승강기_안전관리법': { chapter: 'CHAPTER 13 승강기 안전관리법', questions: [] },
        '14_집합건물의_소유_및_관리에_관한_법률': { chapter: 'CHAPTER 14 집합건물의 소유 및 관리에 관한 법률', questions: [] }
    };

    files.forEach(f => {
        let key = null;
        if (f.includes('주택법')) key = '01_주택법';
        else if (f.includes('공동주택관리법')) key = '02_공동주택관리법';
        else if (f.includes('민간임대주택')) key = '03_민간임대주택에_관한_특별법';
        else if (f.includes('공공주택')) key = '04_공공주택_특별법';
        else if (f.includes('건축법')) key = '05_건축법';
        else if (f.includes('도시 및 주거환경정비법') || f.startsWith('6')) key = '06_도시_및_주거환경정비법';
        else if (f.includes('도시재정비') || f.startsWith('7')) key = '07_도시재정비_촉진을_위한_특별법';
        else if (f.includes('시설물의 안전') || f.startsWith('8')) key = '08_시설물의_안전_및_유지관리에_관한_특별법';
        else if (f.includes('소방기본법') || f.startsWith('9')) key = '09_소방기본법';
        else if (f.includes('화재의 예방') || f.startsWith('10')) key = '10_화재의_예방_및_안전관리에_관한_법률';
        else if (f.includes('소방시설 설치') || f.startsWith('11')) key = '11_소방시설_설치_및_관리에_관한_법률';
        else if (f.includes('전기사업법') || f.startsWith('12')) key = '12_전기사업법';
        else if (f.includes('승강기') || f.startsWith('13')) key = '13_승강기_안전관리법';
        else if (f.includes('집합건물') || f.startsWith('14')) key = '14_집합건물의_소유_및_관리에_관한_법률';

        if (key && lawsMap[key]) {
            try {
                let raw = fs.readFileSync(path.join(srcDir, f), 'utf-8');
                // Clean trailing comments if any
                const firstBrace = raw.indexOf('{');
                const lastBrace = raw.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    raw = raw.slice(firstBrace, lastBrace + 1);
                }
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.questions)) {
                    lawsMap[key].questions.push(...parsed.questions);
                }
            } catch (e) {
                console.error(`Error parsing ${f}:`, e.message);
            }
        }
    });

    // Save consolidated files
    let totalQuestions = 0;
    Object.keys(lawsMap).forEach((lawKey, idx) => {
        const lawObj = lawsMap[lawKey];
        const standardQuestions = lawObj.questions.map((q, qIdx) => ({
            id: String(qIdx + 1).padStart(2, '0'),
            exam_info: q.exam_info || "",
            title: q.title || "",
            question: q.question ? q.question.trim() : "",
            passage: q.passage ? q.passage.trim() : "",
            answers: q.answers && typeof q.answers === 'object' ? q.answers : {},
            explanation: q.explanation ? q.explanation.trim() : "",
            tip: q.tip ? q.tip.trim() : ""
        }));

        const cleanJson = {
            chapter: lawObj.chapter,
            subject: "관계법규",
            category: `주택관리관계법규 - ${lawKey.replace(/^\d+_/, '')}`,
            type: "short",
            total_count: standardQuestions.length,
            updated_at: new Date().toISOString(),
            questions: standardQuestions
        };

        const outPath = path.join(targetCleanDir, `${lawKey}.json`);
        fs.writeFileSync(outPath, JSON.stringify(cleanJson, null, 2), 'utf-8');
        totalQuestions += standardQuestions.length;
        console.log(`Saved: ${lawKey}.json (${standardQuestions.length} questions)`);
    });

    // Replace original 주관식 directory with the clean consolidated version (keeping backup)
    buildMasterFile(targetCleanDir, '관계법규', 'short');
    console.log(`\nConsolidated 관계법규 주관식: Total ${totalQuestions} questions across 14 laws!`);
}

// Master Main Runner
async function main() {
    console.log('######################################################');
    console.log('#   HOUSING EXAM QUESTION BANK BATCH PIPELINE       #');
    console.log('######################################################');

    // 1. 관계법규 주관식 정리 & 병합 (기존 28개 파일 -> 14개 통합)
    consolidateExistingLawSubjective();

    // 2. 관리실무 주관식 일괄 변환 (13개 파일)
    const gwanriSaDir = path.join(BASE_EXAM_DIR, 'txt문제', '관리실무', '주관식');
    const gwanriSaOut = path.join(BASE_EXAM_DIR, '관리실무', '주관식');
    await convertFolder(gwanriSaDir, gwanriSaOut, '관리실무', 'short');

    // 3. 관계법규 객관식 일괄 변환 (15개 파일)
    const lawMcDir = path.join(BASE_EXAM_DIR, 'txt문제', '관계법규');
    const lawMcOut = path.join(BASE_EXAM_DIR, '관계법규', '객관식');
    await convertFolder(lawMcDir, lawMcOut, '관계법규', 'choice');

    console.log('\n======================================================');
    console.log('🎉 ALL EXAM DATASETS HAVE BEEN CONVERTED & CONSOLIDATED!');
    console.log('======================================================\n');
}

main().catch(err => {
    console.error('Fatal batch pipeline error:', err);
    process.exit(1);
});
