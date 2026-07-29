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
    
    // Normalize NFD unicode characters (Mac OS Hangul fix)
    const relPathNorm = fileObj.relativePath.normalize('NFC').replace(/\\/g, '/');
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
    const lectureMatch = h1Text.match(/제\s*(\d+)\s*강|\[\s*(\d+)\s*강\s*\]|^(\d+)\s*강/);
    const lectureNum = lectureMatch ? parseInt(lectureMatch[1] || lectureMatch[2] || lectureMatch[3], 10) : 0;

    // Subheadings (h2)
    const h2Matches = [...content.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    const subHeadings = h2Matches.map(m => cleanText(m[1])).filter(t => !t.includes('주관식'));

    // 4. Parse Quiz & Answers inside HTML
    const quizzes = [];

    // Remove explanation/callout boxes to prevent counting lecture explanation lists as quiz items
    let quizSearchArea = content.replace(/<div[^>]*class=["'][^"']*explanation[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

    // Locate true Quiz Section starting from the FIRST quiz heading in the document
    const hMatches = [...quizSearchArea.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
    let quizStartIndex = -1;
    for (let i = 0; i < hMatches.length; i++) {
        const text = cleanText(hMatches[i][1]);
        if (text.match(/주관식|빈칸|단답형|실전\s*훈련|핵심\s*용어|확인\s*문제|실전\s*출제/i)) {
            quizStartIndex = hMatches[i].index;
            break;
        }
    }

    const quizScopeHtml = quizStartIndex !== -1 ? quizSearchArea.slice(quizStartIndex) : quizSearchArea;
    
    // Enhanced answer block detector: matches class="answer-grid" / "answer-container" until </body> or section end
    let answerGridMatch = content.match(/<div[^>]*class=["'][^"']*answer-(?:container|grid)[^"']*["'][^>]*>([\s\S]*?)(?:<\/body>|$)/i);
    if (!answerGridMatch) {
        const divMatches = [...content.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
        for (const m of divMatches) {
            if (m[0].includes('explanation')) continue;

            if (m[1].includes('정답') && m[1].match(/\d+\./)) {
                answerGridMatch = m;
                break;
            }
        }
    }

    const answersMap = {};
    if (answerGridMatch) {
        const rawAnsBlock = answerGridMatch[1];

        // 1) Match class="answer-item" specifically if available
        const itemMatches = [...rawAnsBlock.matchAll(/<div[^>]*class=["'][^"']*answer-item[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
        if (itemMatches.length > 0) {
            itemMatches.forEach(m => {
                const txt = cleanText(m[1]);
                const numMatch = txt.match(/^(\d+)\./);
                if (numMatch) {
                    const qNum = parseInt(numMatch[1], 10);
                    const ansText = txt.replace(/^\d+\.\s*/, '').trim();
                    if (qNum && ansText) {
                        answersMap[qNum] = ansText;
                    }
                }
            });
        }

        // 2) Match div elements with inner content (e.g. <div><strong>1번 문항</strong><br> ㉠ 직접</div>)
        if (Object.keys(answersMap).length === 0) {
            const divItems = [...rawAnsBlock.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
            if (divItems.length > 0) {
                divItems.forEach(item => {
                    const txt = cleanText(item[1]);
                    const numMatch = txt.match(/(\d+)(?:번\s*문항|번|\.)\s*([\s\S]*)/);
                    if (numMatch) {
                        const qNum = parseInt(numMatch[1], 10);
                        const ansText = numMatch[2].trim();
                        if (qNum && ansText) {
                            answersMap[qNum] = ansText;
                        }
                    }
                });
            }
        }
        
        // 3) Universal Global Single-line / Multi-line Pattern Matcher (1. ans1  2. ans2  3. ans3)
        if (Object.keys(answersMap).length === 0) {
            const cleanAnsBlock = cleanText(rawAnsBlock).replace(/\s+/g, ' ');
            const globalMatches = [...cleanAnsBlock.matchAll(/(\d+)\.\s*(.*?)(?=(?:\s+\d+\.|$))/g)];
            globalMatches.forEach(m => {
                const qNum = parseInt(m[1], 10);
                const ansContent = m[2].trim().replace(/^[\s,·]+|[\s,·]+$/g, '');
                if (qNum && ansContent) {
                    answersMap[qNum] = ansContent;
                }
            });
        }
    }

    // Collect ALL <li> items from <ol> or <ul> inside the true quiz scope area
    const allListMatches = [...quizScopeHtml.matchAll(/<(?:ol|ul)[^>]*>([\s\S]*?)<\/(?:ol|ul)>/gi)];
    
    let quizIndex = 0;
    const symbols = ['㉠', '㉡', '㉢', '㉣', '㉤'];

    allListMatches.forEach(listMatch => {
        const listHtml = listMatch[1];
        
        // Ignore lists that are located inside/after answerGrid
        const absoluteListIndex = (quizStartIndex !== -1 ? quizStartIndex : 0) + listMatch.index;
        if (answerGridMatch && absoluteListIndex >= answerGridMatch.index) return;

        const liMatches = [...listHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
        
        liMatches.forEach(liMatch => {
            let rawLiHtml = liMatch[1].replace(/&nbsp;/gi, ' ');
            let qText = cleanText(rawLiHtml);

            // Check if this LI is a quiz item (contains '㉠', '㉡', '(', or 'blank-answer')
            const isQuizCandidate = qText.includes('㉠') || 
                                    qText.includes('㉡') || 
                                    qText.includes('(') || 
                                    rawLiHtml.includes('blank-answer');

            if (!isQuizCandidate) return;

            let inlineAnswers = [];

            // Pattern 1: Inline answer inside span.blank-answer like <span class="blank-answer">( 정답 )</span>
            const parenMatches = [...rawLiHtml.matchAll(/\(\s*([^)]*)\s*\)/g)];
            parenMatches.forEach(pm => {
                const innerTxt = cleanText(pm[1]);
                const cleanAns = innerTxt.replace(/^[㉠㉡㉢㉣㉤]\s*/, '').trim();
                if (cleanAns.length > 0 && !cleanAns.match(/^[㉠㉡㉢㉣㉤\s]*$/) && !/^(?:가|나|다|라|마|이|은|는|을|를|과|와|으로|로)$/i.test(cleanAns)) {
                    inlineAnswers.push(cleanAns);
                }
            });

            // Standardize ONLY true blank parentheses while preserving Korean particle parentheses like (가), (나), (이), (은), (는)
            let blankCount = 0;
            let standardizedHtml = rawLiHtml.replace(/<span\s+class="blank-answer"[^>]*>[\s\S]*?<\/span>/gi, () => {
                const sym = symbols[blankCount] || '㉠';
                blankCount++;
                return `( ${sym} )`;
            }).replace(/\(\s*(?:&nbsp;|\s)*[㉠㉡㉢㉣㉤가나다라마]?\s*(?:&nbsp;|\s)*\)/gi, (m) => {
                const rawInside = m.replace(/[()]/g, '').replace(/&nbsp;/gi, '').replace(/\s+/g, '');
                // If it is a particle choice like (가), (나), (이), (은), (는), (을), (를), (와), (과) without spaces, do NOT turn into blank!
                if (/^(?:가|나|다|라|마|이|은|는|을|를|과|와|으로|로)$/i.test(rawInside)) {
                    return m;
                }
                const sym = symbols[blankCount] || '㉠';
                blankCount++;
                return `( ${sym} )`;
            });

            qText = cleanText(standardizedHtml);
            quizIndex++;

            // Determine answer: use answersMap if available, else inlineAnswers
            let ansText = '';
            if (answersMap[quizIndex]) {
                ansText = answersMap[quizIndex];
            } else if (inlineAnswers.length > 0) {
                ansText = inlineAnswers.map((ans, idx) => {
                    const sym = symbols[idx] || '㉠';
                    return inlineAnswers.length > 1 ? `${sym} ${ans}` : ans;
                }).join(', ');
            }

            if (qText && ansText) {
                quizzes.push({
                    id: `${fileObj.fileName.replace(/\.html$/i, '')}_q${quizIndex}`,
                    num: quizIndex,
                    question: qText,
                    answerRaw: ansText,
                    subject: subject,
                    lectureNum: lectureNum,
                    lectureTitle: h1Text,
                    noteFileName: fileObj.relativePath,
                    anchorId: `quiz-${quizIndex}`
                });
            }
        });
    });

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
