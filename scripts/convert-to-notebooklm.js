const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const NOTES_DIR = path.join(ROOT_DIR, "notes");
const OUTPUT_DIR = path.join(ROOT_DIR, "notebooklm_sources");

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function convertLectureHtmlToMarkdown(html, filename) {
    let text = html;

    // Remove head, style, script
    text = text.replace(/<head[\s\S]*?<\/head>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");

    // Convert highlights, bolds, answers
    text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
    text = text.replace(/<span[^>]*class="[^"]*highlight[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "**$1**");
    text = text.replace(/<span[^>]*class="[^"]*blank-answer[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "**[정답: $1]**");

    // Convert explanation box
    text = text.replace(/<div[^>]*class="[^"]*explanation[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, (m, content) => {
        let clean = content.replace(/<[^>]+>/g, "\n");
        const lines = clean.split("\n").map(l => l.trim()).filter(Boolean);
        return "\n\n> [!NOTE]\n" + lines.map(l => "> " + l).join("\n") + "\n\n";
    });

    // Convert Tables to GFM Markdown Tables
    text = text.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
        const rows = [];
        const trRegex = /<tr[\s\S]*?<\/tr>/gi;
        let trMatch;
        while ((trMatch = trRegex.exec(tableHtml)) !== null) {
            const rowHtml = trMatch[0];
            const cells = [];
            const cellRegex = /<(th|td)[\s\S]*?<\/\1>/gi;
            let cellMatch;
            while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
                let cellRaw = cellMatch[0]
                    .replace(/^<(th|td)[^>]*>/i, "")
                    .replace(/<\/(th|td)>$/i, "");
                
                let cellText = cellRaw
                    .replace(/<br\s*\/?>/gi, " ")
                    .replace(/<[^>]+>/g, "")
                    .replace(/[\r\n\t]+/g, " ")
                    .replace(/\|/g, "\\|")
                    .replace(/&nbsp;/g, " ")
                    .replace(/&lt;/g, "<")
                    .replace(/&gt;/g, ">")
                    .replace(/&amp;/g, "&")
                    .trim();
                cells.push(cellText || "-");
            }
            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length === 0) return "";

        const maxCols = Math.max(...rows.map(r => r.length));
        const paddedRows = rows.map(r => {
            while (r.length < maxCols) r.push("-");
            return r;
        });

        let mdTable = "\n\n";
        mdTable += "| " + paddedRows[0].join(" | ") + " |\n";
        mdTable += "| " + Array(maxCols).fill("---").join(" | ") + " |\n";
        for (let i = 1; i < paddedRows.length; i++) {
            mdTable += "| " + paddedRows[i].join(" | ") + " |\n";
        }
        mdTable += "\n\n";
        return mdTable;
    });

    // Convert Headings
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (m, c) => {
        const clean = c.replace(/<[^>]+>/g, "").replace(/^[\s\-•·]+/g, "").trim();
        return "\n\n# " + clean + "\n\n";
    });
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, c) => {
        const clean = c.replace(/<[^>]+>/g, "").replace(/^[\s\-•·]+/g, "").trim();
        return "\n\n## " + clean + "\n\n";
    });
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, c) => {
        const clean = c.replace(/<[^>]+>/g, "").replace(/^[\s\-•·]+/g, "").trim();
        return "\n\n### " + clean + "\n\n";
    });
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (m, c) => {
        const clean = c.replace(/<[^>]+>/g, "").replace(/^[\s\-•·]+/g, "").trim();
        return "\n\n#### " + clean + "\n\n";
    });

    // Convert Lists
    text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
    text = text.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

    // Clean remaining tags
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
    text = text.replace(/<hr[^>]*>/gi, "\n---\n");
    text = text.replace(/<[^>]+>/g, "");

    // HTML entities
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&quot;/g, "\"");
    text = text.replace(/&#39;/g, "'");

    // Normalize spacing
    text = text.replace(/[ \t]+\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");

    return text.trim();
}

function processDirectory(subRelDir, outSubDir) {
    const srcDir = path.join(NOTES_DIR, subRelDir);
    const targetDir = path.join(OUTPUT_DIR, outSubDir);
    ensureDir(targetDir);

    if (!fs.existsSync(srcDir)) {
        console.log("Directory not found: " + srcDir);
        return { files: [], contents: [] };
    }

    const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".html")).sort();
    const convertedFiles = [];
    const fullContents = [];

    files.forEach(file => {
        const fullSrcPath = path.join(srcDir, file);
        const html = fs.readFileSync(fullSrcPath, "utf8");
        const mdContent = convertLectureHtmlToMarkdown(html, file);

        const outFileName = file.replace(/\.html$/i, ".md");
        const outFilePath = path.join(targetDir, outFileName);
        fs.writeFileSync(outFilePath, mdContent, "utf8");
        convertedFiles.push(outFilePath);
        fullContents.push(mdContent);
        console.log("  ✓ Converted: " + outSubDir + "/" + outFileName);
    });

    return { files: convertedFiles, contents: fullContents };
}

console.log("🚀 Converting pure lecture notes for NotebookLM...");
ensureDir(OUTPUT_DIR);

// 1. 관계법규 강의노트
console.log("\n[1/2] Processing 관계법규 강의노트 (76개)...");
const resLaw = processDirectory("관계법규", "1_관계법규_강의노트");

// 2. 관리실무 강의노트
console.log("\n[2/2] Processing 관리실무 강의노트 (71개)...");
const resGwanri = processDirectory("관리실무", "2_관리실무_강의노트");

// Master Combined Files
console.log("\n[Master] Creating Unified Markdown Files...");
const masterLawMd = "# 📘 주택관리사보 2차 [관계법규] 전체 강의노트 통합본\n\n총 " + resLaw.contents.length + "개 강의 수록\n\n---\n\n" + resLaw.contents.join("\n\n\n---\n\n\n");
fs.writeFileSync(path.join(OUTPUT_DIR, "통합본_관계법규_전체강의노트.md"), masterLawMd, "utf8");

const masterGwanriMd = "# 📗 주택관리사보 2차 [관리실무] 전체 강의노트 통합본\n\n총 " + resGwanri.contents.length + "개 강의 수록\n\n---\n\n" + resGwanri.contents.join("\n\n\n---\n\n\n");
fs.writeFileSync(path.join(OUTPUT_DIR, "통합본_관리실무_전체강의노트.md"), masterGwanriMd, "utf8");

const totalCount = resLaw.files.length + resGwanri.files.length;
console.log("\n🎉 Clean lecture notes ready! Total " + totalCount + " individual markdown files in: " + OUTPUT_DIR);
