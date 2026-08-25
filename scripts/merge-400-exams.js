const fs = require('fs');
const path = require('path');

const PARSED_DIR = path.join(__dirname, '..', 'exam_data', '추가문제_parsed');
const EXAM_BANK_PATH = path.join(__dirname, '..', 'housing_exam_hell', 'data', 'exam_bank.js');
const MASTER_JS_PATH = path.join(__dirname, '..', 'exam_data', '전체_문제은행_마스터.js');
const MASTER_JSON_PATH = path.join(__dirname, '..', 'exam_data', '전체_문제은행_마스터.json');

// Chapter Normalizer Map
function normalizeChapter(rawChapter, subject) {
    const text = (rawChapter || '').trim();

    if (subject === '관계법규') {
        if (/주택법/i.test(text)) return 'CHAPTER 01 주택법';
        if (/공동주택관리법/i.test(text)) return 'CHAPTER 02 공동주택관리법';
        if (/민간임대/i.test(text)) return 'CHAPTER 03 민간임대주택에 관한 특별법';
        if (/공공주택/i.test(text)) return 'CHAPTER 04 공공주택 특별법';
        if (/건축법/i.test(text)) return 'CHAPTER 05 건축법';
        if (/도시.*주거환경정비/i.test(text)) return 'CHAPTER 06 도시 및 주거환경정비법';
        if (/도시재정비/i.test(text)) return 'CHAPTER 07 도시재정비 촉진을 위한 특별법';
        if (/시설물의.*안전/i.test(text)) return 'CHAPTER 08 시설물의 안전 및 유지관리에 관한 특별법';
        if (/소방기본/i.test(text)) return 'CHAPTER 09 소방기본법';
        if (/화재의.*예방/i.test(text)) return 'CHAPTER 10 화재의 예방 및 안전관리에 관한 법률';
        if (/소방시설/i.test(text)) return 'CHAPTER 11 소방시설 설치 및 관리에 관한 법률';
        if (/전기사업/i.test(text)) return 'CHAPTER 12 전기사업법';
        if (/승강기/i.test(text)) return 'CHAPTER 13 승강기 안전관리법';
        if (/집합건물/i.test(text)) return 'CHAPTER 14 집합건물의 소유 및 관리에 관한 법률';
        return 'CHAPTER 01 주택법';
    } else {
        // 관리실무
        if (/주택의.*정의|용어/i.test(text)) return 'CHAPTER 01 주택의 정의 및 종류';
        if (/총칙|관리기준/i.test(text)) return 'CHAPTER 02 총칙 및 관리기준';
        if (/관리방법/i.test(text)) return 'CHAPTER 03 공동주택의 관리방법';
        if (/관리조직|입주자대표회의/i.test(text)) return 'CHAPTER 04 관리조직 및 입주자대표회의';
        if (/주택관리사/i.test(text)) return 'CHAPTER 05 주택관리사 제도';
        if (/입주자관리|규약/i.test(text)) return 'CHAPTER 07 입주자관리 및 규약';
        if (/사무|인사/i.test(text)) return 'CHAPTER 08 사무 및 인사관리';
        if (/대외업무|리모델링/i.test(text)) return 'CHAPTER 09 대외업무 및 리모델링';
        if (/회계관리/i.test(text)) return 'CHAPTER 10 회계관리';
        if (/시설관리/i.test(text)) return 'CHAPTER 11 시설관리';
        if (/환경|안전관리|방재/i.test(text)) return 'CHAPTER 12 환경 및 안전관리';
        return 'CHAPTER 11 시설관리';
    }
}

function mergeAll() {
    console.log('🔄 Loading existing exam bank...');
    const bankFileContent = fs.readFileSync(EXAM_BANK_PATH, 'utf-8');
    const jsonMatch = bankFileContent.replace(/^window\.HOUSING_EXAM_BANK\s*=\s*/, '').replace(/;\s*$/, '');
    const examBank = JSON.parse(jsonMatch);

    // Read all *_ALL.json files from PARSED_DIR
    const files = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('_ALL.json'));
    if (files.length === 0) {
        console.warn('No *_ALL.json files found in', PARSED_DIR);
        return;
    }

    // 1. Remove previous '특강_' questions to ensure 100% clean idempotent merge
    Object.keys(examBank.datasets).forEach(k => {
        const ds = examBank.datasets[k];
        ds.chapters.forEach(c => {
            c.questions = c.questions.filter(q => !String(q.id).startsWith('특강_'));
            c.total_count = c.questions.length;
        });
    });

    let addedCount = 0;

    files.forEach(file => {
        const fullPath = path.join(PARSED_DIR, file);
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const subject = data.subject;
        const teacher = data.teacher;
        const questions = data.questions || [];

        console.log(`\nMerging ${questions.length} questions from ${file} (${subject} / ${teacher})...`);

        questions.forEach((q, qIndex) => {
            const isChoice = q.type === 'choice' || (Array.isArray(q.options) && q.options.length >= 2);
            const datasetKey = subject === '관리실무'
                ? (isChoice ? 'gwanri_mc' : 'gwanri_sa')
                : (isChoice ? 'law_mc' : 'law_sa');

            const dataset = examBank.datasets[datasetKey];
            if (!dataset) return;

            const normalizedChapterName = normalizeChapter(q.chapter || q.category, subject);

            let chapterObj = dataset.chapters.find(c => c.chapter === normalizedChapterName);
            if (!chapterObj) {
                chapterObj = {
                    chapter: normalizedChapterName,
                    subject,
                    category: `${subject} - ${normalizedChapterName}`,
                    total_count: 0,
                    source_file: `${teacher} 100선 특강`,
                    updated_at: new Date().toISOString(),
                    questions: []
                };
                dataset.chapters.push(chapterObj);
            }

            // Generate clean unique ID with MC/SA tags within chapter
            const typeTag = isChoice ? 'MC' : 'SA';
            const cleanQId = String(q.id || (qIndex + 1)).replace(/^0+/, '') || String(qIndex + 1);
            let newId = `특강_${teacher}_${typeTag}_${cleanQId.padStart(2, '0')}`;
            let dupCount = 1;
            while (chapterObj.questions.some(item => item.id === newId)) {
                dupCount++;
                newId = `특강_${teacher}_${typeTag}_${cleanQId.padStart(2, '0')}_${dupCount}`;
            }

            const formattedQ = {
                id: newId,
                exam_info: `${teacher} 100선 마무리특강`,
                title: q.title || '100선 핵심 엄선 문제',
                question: q.question,
                passage: q.passage || '',
                options: isChoice ? (q.options || []) : [],
                answer: isChoice ? (parseInt(q.answer, 10) || 1) : 0,
                answers: !isChoice ? (q.answers || {}) : {},
                explanation: q.explanation || '',
                tip: q.tip || ''
            };

            chapterObj.questions.push(formattedQ);
            chapterObj.total_count = chapterObj.questions.length;
            addedCount++;
        });
    });

    // Recalculate summary totals
    let totalQuestions = 0;
    Object.keys(examBank.datasets).forEach(k => {
        const ds = examBank.datasets[k];
        let dsCount = 0;
        ds.chapters.forEach(c => {
            c.total_count = c.questions.length;
            dsCount += c.questions.length;
        });
        ds.totalQuestions = dsCount;
        ds.totalChapters = ds.chapters.length;
        ds.updatedAt = new Date().toISOString();

        examBank.summary[k].count = dsCount;
        examBank.summary[k].chapters = ds.chapters.length;
        totalQuestions += dsCount;
    });

    examBank.totalQuestions = totalQuestions;
    examBank.updatedAt = new Date().toISOString();

    console.log(`\n======================================================`);
    console.log(`✅ Merge Complete! Added ${addedCount} new questions.`);
    console.log(`📊 Grand Total in Question Bank: ${totalQuestions} questions.`);
    console.log(`======================================================`);

    const outputJs = `window.HOUSING_EXAM_BANK = ${JSON.stringify(examBank, null, 2)};\n`;
    fs.writeFileSync(EXAM_BANK_PATH, outputJs, 'utf-8');
    fs.writeFileSync(MASTER_JS_PATH, outputJs, 'utf-8');
    fs.writeFileSync(MASTER_JSON_PATH, JSON.stringify(examBank, null, 2), 'utf-8');
    console.log(`Saved updated exam bank to ${EXAM_BANK_PATH}`);
}

module.exports = { mergeAll };

if (require.main === module) {
    mergeAll();
}
