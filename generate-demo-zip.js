/**
 * generate-demo-zip.js
 * Packs demo-zip-source/ into demo-metadata.zip
 * Run: node generate-demo-zip.js
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Install archiver if needed
try { require.resolve('archiver'); }
catch {
    console.log('Installing archiver...');
    execSync('npm install archiver', { stdio: 'inherit' });
}

const archiver = require('archiver');

const SOURCE = path.join(__dirname, 'demo-zip-source');
const OUTPUT = path.join(__dirname, 'demo-metadata.zip');

const output  = fs.createWriteStream(OUTPUT);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    const kb = (archive.pointer() / 1024).toFixed(1);
    console.log(`✅  demo-metadata.zip created — ${kb} KB`);
    console.log(`📦  Contents:`);
    listDir(SOURCE, '    ');
});

archive.on('error', err => { throw err; });
archive.pipe(output);
archive.directory(SOURCE, false);
archive.finalize();

function listDir(dir, indent) {
    fs.readdirSync(dir).forEach(f => {
        const full = path.join(dir, f);
        const rel  = path.relative(SOURCE, full);
        if (fs.statSync(full).isDirectory()) {
            console.log(`${indent}📁 ${f}/`);
            listDir(full, indent + '    ');
        } else {
            console.log(`${indent}📄 ${f}`);
        }
    });
}
