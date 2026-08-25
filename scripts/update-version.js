const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");

function getAutoVersion() {
    // Generate version based on Korea Standard Time (UTC+9)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstDate = new Date(utc + (9 * 3600000));

    const yy = String(kstDate.getFullYear()).slice(-2);
    const mm = String(kstDate.getMonth() + 1).padStart(2, "0");
    const dd = String(kstDate.getDate()).padStart(2, "0");
    const hh = String(kstDate.getHours()).padStart(2, "0");
    const min = String(kstDate.getMinutes()).padStart(2, "0");

    const dateStr = `${yy}${mm}${dd}`;
    const timeStr = `${hh}${min}`;
    const verString = `v.0.${dateStr}.${timeStr}`;
    const cacheVer = `${dateStr}${timeStr}`;

    return { verString, cacheVer };
}

function updateVersions() {
    const { verString, cacheVer } = getAutoVersion();
    console.log(`\n🚀 Auto-Updating Version & Cache Busters to [${verString}] (cacheVer: ${cacheVer})...`);

    // 1. Update housing_exam_hell/index.html
    const hellHtmlPath = path.join(rootDir, "housing_exam_hell", "index.html");
    if (fs.existsSync(hellHtmlPath)) {
        let content = fs.readFileSync(hellHtmlPath, "utf8");

        // Update CSS cache busters
        content = content.replace(/(href="css\/[^"]+?\.css)(?:\?v=\d+)?(")/g, `$1?v=${cacheVer}$2`);

        // Update JS cache busters
        content = content.replace(/(src="(?:data\/exam_bank\.js|data\/core_keywords_db\.js|js\/cloud-sync\.js|js\/app\.js))(?:\?v=\d+)?(")/g, `$1?v=${cacheVer}$2`);

        // Update version tag in header
        content = content.replace(/v\.0\.\d{6}\.\d{4}/g, verString);

        // Remove version tag from home hero h1 (as requested: "메인화면엔 버전 표시 필요없어")
        content = content.replace(/<h1>주관사 2차 <span>문제지옥<\/span> 🔥\s*(?:<span[^>]*>.*?<\/span>)?\s*<\/h1>/g, "<h1>주관사 2차 <span>문제지옥</span> 🔥</h1>");

        fs.writeFileSync(hellHtmlPath, content, "utf8");
        console.log(`  ✓ Updated housing_exam_hell/index.html (Version: ${verString}, Hero badge removed, Cache busted)`);
    }

    // 2. Update housing_exam_hell/js/app.js
    const hellAppJsPath = path.join(rootDir, "housing_exam_hell", "js", "app.js");
    if (fs.existsSync(hellAppJsPath)) {
        let content = fs.readFileSync(hellAppJsPath, "utf8");
        content = content.replace(/v\.0\.\d{6}\.\d{4}/g, verString);
        fs.writeFileSync(hellAppJsPath, content, "utf8");
        console.log(`  ✓ Updated housing_exam_hell/js/app.js (Version: ${verString})`);
    }

    // 3. Update housing_exam_hell/js/exam-engine.js
    const hellEngineJsPath = path.join(rootDir, "housing_exam_hell", "js", "exam-engine.js");
    if (fs.existsSync(hellEngineJsPath)) {
        let content = fs.readFileSync(hellEngineJsPath, "utf8");
        content = content.replace(/v\.0\.\d{6}\.\d{4}/g, verString);
        fs.writeFileSync(hellEngineJsPath, content, "utf8");
        console.log(`  ✓ Updated housing_exam_hell/js/exam-engine.js (Version: ${verString})`);
    }

    // 4. Update root index.html
    const rootHtmlPath = path.join(rootDir, "index.html");
    if (fs.existsSync(rootHtmlPath)) {
        let content = fs.readFileSync(rootHtmlPath, "utf8");
        content = content.replace(/(href="styles\.css)(?:\?v=[^"]+)?(")/g, `$1?v=${cacheVer}$2`);
        content = content.replace(/(src="app\.js)(?:\?v=[^"]+)?(")/g, `$1?v=${cacheVer}$2`);
        fs.writeFileSync(rootHtmlPath, content, "utf8");
        console.log(`  ✓ Updated root index.html (Cache busted styles.css & app.js)`);
    }

    return { verString, cacheVer };
}

module.exports = { updateVersions, getAutoVersion };

if (require.main === module) {
    updateVersions();
}
