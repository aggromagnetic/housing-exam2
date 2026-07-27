const fs = require('fs');
const path = require('path');

const NOTES_DIR = path.join(__dirname, '..', 'notes');

function cleanFileName(str) {
    return str
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '_')
        .trim();
}

function getAllHtmlFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllHtmlFiles(fullPath, arrayOfFiles);
        } else if (file.endsWith('.html')) {
            arrayOfFiles.push({
                fullPath,
                fileName: file,
                dirPath
            });
        }
    });

    return arrayOfFiles;
}

function autoRenameNotes() {
    const fileObjs = getAllHtmlFiles(NOTES_DIR);
    console.log(`Checking ${fileObjs.length} files for renaming...`);

    let renamedCount = 0;

    fileObjs.forEach(fileObj => {
        const content = fs.readFileSync(fileObj.fullPath, 'utf-8');
        
        // Match <h1> (e.g. 제29강. 하자보수보증금...)
        const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (!h1Match) return;

        const h1Text = h1Match[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
        const lectureMatch = h1Text.match(/제\s*(\d+)\s*강/);
        
        if (lectureMatch) {
            const num = parseInt(lectureMatch[1], 10);
            const numStr = num < 10 ? `0${num}` : `${num}`;
            
            // Extract clean title part after "제XX강."
            const titlePart = h1Text.replace(/^제\s*\d+\s*강[\.\s]*/, '').trim();
            const cleanTitle = cleanFileName(titlePart).slice(0, 30);

            const newFileName = `${numStr}강_${cleanTitle}.html`;
            const newPath = path.join(fileObj.dirPath, newFileName);

            if (fileObj.fileName !== newFileName && !fs.existsSync(newPath)) {
                console.log(`Renaming: "${fileObj.fileName}" -> "${newFileName}"`);
                fs.renameSync(fileObj.fullPath, newPath);
                renamedCount++;
            }
        }
    });

    console.log(`Renamed ${renamedCount} files cleanly.`);
}

autoRenameNotes();
