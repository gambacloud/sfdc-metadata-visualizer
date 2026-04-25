/**
 * generate-icons.js
 * Generates electron/icon.png and electron/icon.ico using pure Node.js.
 * No external dependencies — uses only built-in modules.
 *
 * Run: node generate-icons.js
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'electron');
fs.mkdirSync(OUT, { recursive: true });

// ── PNG builder ───────────────────────────────────────────────────────────────

function makePng(size) {
    const BG  = [8,  13,  24,  255];  // #080d18
    const ACC = [0,  212, 255, 255];  // #00d4ff

    const pixels = [];
    const cx = size / 2, cy = size / 2 + size * 0.04;
    const r  = size * 0.30;

    for (let y = 0; y < size; y++) {
        const row = [];
        for (let x = 0; x < size; x++) {
            const dx = x - cx, dy = y - cy;
            const inCloud =
                (dx*dx + dy*dy < r*r) ||
                ((dx - r*0.55)**2 + (dy + r*0.08)**2 < (r*0.70)**2) ||
                ((dx + r*0.55)**2 + (dy + r*0.08)**2 < (r*0.70)**2) ||
                (Math.abs(dx) < r*0.58 && dy > -r*0.18 && dy < r*0.48);
            row.push(inCloud ? ACC : BG);
        }
        pixels.push(row);
    }

    // Raw scanlines with filter byte 0
    let raw = Buffer.alloc(size * (size * 4 + 1));
    let pos = 0;
    for (const row of pixels) {
        raw[pos++] = 0;
        for (const [r2,g,b,a] of row) {
            raw[pos++] = r2; raw[pos++] = g; raw[pos++] = b; raw[pos++] = a;
        }
    }

    const compressed = zlib.deflateSync(raw, { level: 9 });

    function chunk(type, data) {
        const typeBuf = Buffer.from(type);
        const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
        const crcBuf  = Buffer.alloc(4);
        const crcData = Buffer.concat([typeBuf, data]);
        crcBuf.writeInt32BE(crc32(crcData));
        return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
    }

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, RGBA

    const sig = Buffer.from([137,80,78,71,13,10,26,10]);
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// CRC32 table
const crcTable = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
    return c ^ -1;
}

// ── ICO builder ───────────────────────────────────────────────────────────────
// ICO format: header + directory + PNG/BMP image data
// Easiest approach: embed PNG data directly (supported since Windows Vista)

function makeIco(pngBuffers) {
    // pngBuffers = [ { size, buf } ]
    const count = pngBuffers.length;

    // ICO header: 6 bytes
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);     // reserved
    header.writeUInt16LE(1, 2);     // type: 1=ICO
    header.writeUInt16LE(count, 4); // image count

    // Directory: 16 bytes per image
    const dirSize   = count * 16;
    let   dataOffset = 6 + dirSize;
    const dirs = [];
    for (const { size, buf } of pngBuffers) {
        const dir = Buffer.alloc(16);
        dir[0] = size >= 256 ? 0 : size;   // width  (0 = 256)
        dir[1] = size >= 256 ? 0 : size;   // height
        dir[2] = 0;                          // color count
        dir[3] = 0;                          // reserved
        dir.writeUInt16LE(1, 4);             // planes
        dir.writeUInt16LE(32, 6);            // bits per pixel
        dir.writeUInt32LE(buf.length, 8);    // size of image data
        dir.writeUInt32LE(dataOffset, 12);   // offset
        dataOffset += buf.length;
        dirs.push(dir);
    }

    return Buffer.concat([header, ...dirs, ...pngBuffers.map(p => p.buf)]);
}

// ── Generate ──────────────────────────────────────────────────────────────────
console.log('Generating icons...');

// PNG for Linux / Electron
const png256 = makePng(256);
fs.writeFileSync(path.join(OUT, 'icon.png'), png256);
console.log(`  ✅  electron/icon.png  (${png256.length} bytes)`);

// ICO for Windows (multi-size: 16, 32, 48, 256)
const icoSizes = [16, 32, 48, 256];
const icoBufs  = icoSizes.map(s => ({ size: s, buf: makePng(s) }));
const ico      = makeIco(icoBufs);
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
console.log(`  ✅  electron/icon.ico  (${ico.length} bytes, sizes: ${icoSizes.join(',')})`);

// ICNS for macOS — electron-builder accepts PNG renamed to .icns for basic builds
// For production, use iconutil or @electron/notarize. For now PNG is sufficient.
fs.copyFileSync(path.join(OUT, 'icon.png'), path.join(OUT, 'icon.icns'));
console.log(`  ✅  electron/icon.icns (PNG copy — sufficient for dev builds)`);

console.log('\nDone. Run npm run build:electron again.');
