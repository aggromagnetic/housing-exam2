const fs = require('fs');
const path = require('path');

const NOTES_DIR = path.join(__dirname, '..', 'notes');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'study_data.json');

function cleanText(str) {
    if (!str) return '';
    return str
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

// Find all HTML files recursively in NOTES_DIR
function getAllHtmlFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllHtmlFiles(fullPath, arrayOfFiles);
        } else if (file.endsWith('.html')) {
            arrayOfFiles.push({
                fullPath,
                relativePath: path.relative(NOTES_DIR, fullPath),
                fileName: file,
                folderName: path.basename(dirPath)
            });
        }
    });

    return arrayOfFiles;
}

function parseHtmlNote(fileObj) {
    const content = fs.readFileSync(fileObj.fullPath, 'utf-8');
    
    // Subject detection by full relative path or title
    const relPathNorm = fileObj.relativePath.replace(/\\/g, '/');
    let subject = '기타';

    if (relPathNorm.includes('단원별문제/관계법규')) {
        subject = '관계법규(문제)';
    } else if (relPathNorm.includes('단원별문제/관리실무')) {
        subject = '관리실무(문제)';
    } else if (relPathNorm.startsWith('관계법규') || fileObj.fileName.includes('관계법규')) {
        subject = '관계법규';
    } else if (relPathNorm.startsWith('관리실무') || fileObj.fileName.includes('관리실무')) {
        subject = '관리실무';
    } else if (relPathNorm.includes('단원별문제')) {
        subject = '단원별문제';
    }

    // Main Title (h1 or title)
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim() : fileObj.fileName;

    const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h1Text = h1Match ? cleanText(h1Match[1]) : rawTitle;

    // Extract lecture number
    const lectureMatch = h1Text.match(/제\s*(\d+)\s*강/);
    const lectureNum = lectureMatch ? parseInt(lectureMatch[1], 10) : 0;

    // Subheadings (h2)
    const h2Matches = [...content.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    const subHeadings = h2Matches.map(m => cleanText(m[1])).filter(t => !t.includes('주관식'));

    // Quizzes inside HTML
    const quizzes = [];
    const olMatch = content.match(/<ol[^>]*>([\s\S]*?)<\/ol>/i);
    const answerGridMatch = content.match(/<div\s+class="answer-grid"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                          content.match(/\[.*?정답.*\][\s\S]*?<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);

    if (olMatch && answerGridMatch) {
        const liMatches = [...olMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        const answerDivMatches = [...answerGridMatch[1].matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];

        const answersMap = {};
        answerDivMatches.forEach(m => {
            const txt = cleanText(m[1]);
            const numMatch = txt.match(/^(\d+)\.\s*(.*)/);
            if (numMatch) {
                answersMap[parseInt(numMatch[1], 10)] = numMatch[2].trim();
            }
        });

        liMatches.forEach((liMatch, idx) => {
            const qNum = idx + 1;
            const qText = cleanText(liMatch[1]);
            const ansText = answersMap[qNum] || '';

            if (qText && ansText) {
                quizzes.push({
                    id: `${fileObj.fileName.replace(/\.html$/i, '')}_q${qNum}`,
                    num: qNum,
                    question: qText,
                    answerRaw: ansText,
                    subject: subject,
                    lectureNum: lectureNum,
                    lectureTitle: h1Text,
                    noteFileName: fileObj.relativePath,
                    anchorId: `quiz-${qNum}`
                });
            }
        });
    }

    return {
        relativePath: fileObj.relativePath,
        fileName: fileObj.fileName,
        subject,
        lectureNum,
        title: h1Text,
        subHeadings,
        quizCount: quizzes.length,
        quizzes
    };
}

function main() {
    if (!fs.existsSync(NOTES_DIR)) {
        console.error('Notes directory not found!');
        process.exit(1);
    }

    const fileObjs = getAllHtmlFiles(NOTES_DIR);
    console.log(`Found ${fileObjs.length} HTML note files in subdirectories.`);

    const lectures = [];
    let allQuizzes = [];

    fileObjs.forEach(fileObj => {
        try {
            const result = parseHtmlNote(fileObj);
            lectures.push({
                relativePath: result.relativePath,
                fileName: result.fileName,
                subject: result.subject,
                lectureNum: result.lectureNum,
                title: result.title,
                subHeadings: result.subHeadings,
                quizCount: result.quizCount
            });
            allQuizzes = allQuizzes.concat(result.quizzes);
        } catch (err) {
            console.error(`Error parsing ${fileObj.relativePath}:`, err);
        }
    });

    lectures.sort((a, b) => {
        if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
        return a.lectureNum - b.lectureNum;
    });

    const outputData = {
        updatedAt: new Date().toISOString(),
        totalLectures: lectures.length,
        totalQuizzes: allQuizzes.length,
        lectures,
        quizzes: allQuizzes
    };

    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`Successfully generated ${OUTPUT_FILE} with ${lectures.length} lectures and ${allQuizzes.length} quizzes.`);
}

main();
