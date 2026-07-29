const fs = require('fs');

const filePath = '/Volumes/Temp/Work/home_test_2/notes/관리실무/29강_산업재해보상보험법상_관장·용어정의·보험급여_종류_및_급.html';
const content = fs.readFileSync(filePath, 'utf-8');

function cleanText(html) {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
}

let answerGridMatch = content.match(/<div[^>]*class=["'][^"']*answer-(?:container|grid)[^"']*["'][^>]*>([\s\S]*?)(?:<\/body>|$)/i);
console.log('answerGridMatch:', answerGridMatch ? answerGridMatch[1].slice(0, 300) : 'null');

const answersMap = {};
if (answerGridMatch) {
    const rawAnsBlock = answerGridMatch[1];
    const divItems = [...rawAnsBlock.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
    
    divItems.forEach(item => {
        const txt = cleanText(item[1]);
        const numMatch = txt.match(/^(\d+)(?:번\s*문항|번|\.)\s*(.*)/);
        if (numMatch) {
            const qNum = parseInt(numMatch[1], 10);
            const ansText = numMatch[2].trim();
            if (qNum && ansText) {
                answersMap[qNum] = ansText;
            }
        }
    });
}

console.log('Parsed answersMap count:', Object.keys(answersMap).length);
console.log('Parsed answersMap:', answersMap);
