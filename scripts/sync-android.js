const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const targetAssetsDir = path.join(rootDir, 'android_app', 'app', 'src', 'main', 'assets', 'www');

console.log('🔄 Syncing web assets to Android assets folder...');
console.log('Source:', rootDir);
console.log('Target:', targetAssetsDir);

// 1. Ensure target directory exists
fs.mkdirSync(targetAssetsDir, { recursive: true });

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();

    if (isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Copy essential files
const filesToCopy = ['index.html', 'app.js', 'styles.css'];
filesToCopy.forEach(file => {
    const srcFile = path.join(rootDir, file);
    const destFile = path.join(targetAssetsDir, file);
    if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, destFile);
        console.log(`  ✓ Copied ${file}`);
    }
});

// Copy directories
const dirsToCopy = ['data', 'notes'];
dirsToCopy.forEach(dir => {
    const srcDir = path.join(rootDir, dir);
    const destDir = path.join(targetAssetsDir, dir);
    if (fs.existsSync(srcDir)) {
        copyRecursiveSync(srcDir, destDir);
        console.log(`  ✓ Copied ${dir}/ directory recursively`);
    }
});

console.log('✅ Android assets synchronization complete!');
