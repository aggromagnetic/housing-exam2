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
        
        // Extract lecture number and title from <h1>
        const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        if (!h1Match) return;

        const h1Text = h1Match[1].replace(/<[^>]+>/g, '').trim();

        // Pattern A: 제XX강. 타이틀 / Pattern B: [XX강] 타이틀 / Pattern C: XX강. 타이틀
        const numMatch = h1Text.match(/제\s*(\d+)\s*강|\[\s*(\d+)\s*강\s*\]|^(\d+)\s*강/);
        if (!numMatch) return;

        const lecNumInt = parseInt(numMatch[1] || numMatch[2] || numMatch[3], 10);
        const padNum = String(lecNumInt).padStart(2, '0');

        // Extract title body
        let cleanTitle = h1Text.replace(/^제\s*\d+\s*강[\.\s]*|^\[\s*\d+\s*강\s*\][\.\s]*/, '').trim();
        cleanTitle = cleanTitle.replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');

        if (cleanTitle.length > 30) {
            cleanTitle = cleanTitle.slice(0, 30);
        }

        const newFileName = `${padNum}강_${cleanTitle}.html`;
        const newPath = path.join(fileObj.dirPath, newFileName);

        if (fileObj.fileName !== newFileName && !fs.existsSync(newPath)) {
            console.log(`Renaming: "${fileObj.fileName}" -> "${newFileName}"`);
            fs.renameSync(fileObj.fullPath, newPath);
            renamedCount++;
        }
    });

    console.log(`Renamed ${renamedCount} files cleanly.`);
}

autoRenameNotes();
