const fs = require('fs');

const filePath = '/Volumes/Temp/Work/home_test_2/notes/관리실무/21강_근로기준법상_통상임금_및_임금지급_원칙,_휴업수당,_근.html';
const content = fs.readFileSync(filePath, 'utf-8');

function cleanText(html) {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
}

let answerGridMatch = content.match(/<div[^>]*class=["'][^"']*answer-(?:container|grid)[^"']*["'][^>]*>([\s\S]*?)(?:<\/body>|$)/i);

const answersMap = {};
if (answerGridMatch) {
    const rawAnsBlock = answerGridMatch[1];
    const divItems = [...rawAnsBlock.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)];
    
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

console.log('Parsed answersMap count:', Object.keys(answersMap).length);
console.log('Parsed answersMap:', answersMap);
