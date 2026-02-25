#!/usr/bin/env node
// 生成 PWA 圖標 (使用 Canvas API via @napi-rs/canvas 或純色 PNG 替代)
// 若 canvas 套件不可用，生成最小有效 PNG

const fs = require('fs');
const path = require('path');

const iconsDir = '/home/node/.openclaw/workspace/dashboard-pwa/icons';

// 最小有效的 1x1 綠色 PNG（base64）
// 我們用程式生成指定尺寸的純色 PNG

function generateMinimalPNG(size, r, g, b) {
    // PNG 結構：Signature + IHDR + IDAT + IEND
    const crc32 = (() => {
        const table = [];
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            }
            table[i] = c;
        }
        return (buf) => {
            let crc = 0xFFFFFFFF;
            for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
            return (crc ^ 0xFFFFFFFF) >>> 0;
        };
    })();

    function uint32BE(n) {
        return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF];
    }

    function chunk(type, data) {
        const typeBytes = [...type].map(c => c.charCodeAt(0));
        const all = [...typeBytes, ...data];
        const crc = crc32(all);
        return [...uint32BE(data.length), ...typeBytes, ...data, ...uint32BE(crc)];
    }

    // IHDR
    const ihdrData = [
        ...uint32BE(size), ...uint32BE(size),
        8, 2, 0, 0, 0  // bit depth=8, color type=2 (RGB)
    ];

    // IDAT: uncompressed scanlines
    // zlib 包裝的原始數據
    const scanline = [0, ...Array(size).fill([r, g, b]).flat()]; // filter byte + RGB pixels
    const rawData = [];
    for (let i = 0; i < size; i++) rawData.push(...scanline);

    // 使用 zlib deflate
    const zlib = require('zlib');
    const compressed = zlib.deflateSync(Buffer.from(rawData));

    // PNG signature
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    const ihdr = chunk('IHDR', ihdrData);
    const idat = chunk('IDAT', [...compressed]);
    const iend = chunk('IEND', []);

    return Buffer.from([...sig, ...ihdr, ...idat, ...iend]);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// 霓虹綠背景 (#050505 深色背景)，圖標用 #00ffcc 綠色
// 生成純色圖標作為預設值
for (const size of sizes) {
    try {
        const png = generateMinimalPNG(size, 0, 20, 15); // 深綠色
        fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), png);
        console.log(`✓ icon-${size}x${size}.png (${png.length} bytes)`);
    } catch (e) {
        console.error(`✗ icon-${size}x${size}.png:`, e.message);
    }
}

console.log('\nAll icons generated.');
