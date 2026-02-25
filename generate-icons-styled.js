#!/usr/bin/env node
// 生成賽博龐克霓虹綠風格 SVG + PNG 圖標
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const iconsDir = '/home/node/.openclaw/workspace/dashboard-pwa/icons';

// 生成帶設計的 PNG（黑底 + 霓虹綠框 + T字符）
function generateStyledPNG(size) {
    const crc32 = (() => {
        const table = [];
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[i] = c;
        }
        return (buf) => {
            let crc = 0xFFFFFFFF;
            for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
            return (crc ^ 0xFFFFFFFF) >>> 0;
        };
    })();

    const u32 = n => [(n>>>24)&0xFF,(n>>>16)&0xFF,(n>>>8)&0xFF,n&0xFF];
    const chunk = (type, data) => {
        const tb = [...type].map(c => c.charCodeAt(0));
        const all = [...tb, ...data];
        return [...u32(data.length), ...tb, ...data, ...u32(crc32(all))];
    };

    // RGBA 像素陣列
    const pixels = new Uint8Array(size * size * 4);

    const border = Math.max(2, Math.round(size * 0.06));
    const center = size / 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            let r = 5, g = 5, b = 5, a = 255; // 深黑背景

            // 外框（霓虹綠邊框）
            const onBorder = x < border || x >= size - border || y < border || y >= size - border;
            if (onBorder) { r = 0; g = 255; b = 200; }

            // 中間繪製 "T" 字母
            const pad = Math.round(size * 0.2);
            const barH = Math.round(size * 0.12); // 橫槓高度
            const stemW = Math.round(size * 0.12); // 豎槓寬度

            const inHBar = x >= pad && x < size - pad && y >= pad && y < pad + barH;
            const inVBar = x >= center - stemW/2 && x < center + stemW/2 && y >= pad && y < size - pad;

            if (inHBar || inVBar) {
                r = 0; g = 255; b = 200; // 霓虹綠
            }

            pixels[idx]   = r;
            pixels[idx+1] = g;
            pixels[idx+2] = b;
            pixels[idx+3] = a;
        }
    }

    // 轉為 PNG 格式 (RGBA)
    const rawData = [];
    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter byte
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            rawData.push(pixels[idx], pixels[idx+1], pixels[idx+2], pixels[idx+3]);
        }
    }

    const compressed = zlib.deflateSync(Buffer.from(rawData));
    const ihdrData = [...u32(size), ...u32(size), 8, 6, 0, 0, 0]; // 8bit RGBA

    const sig = [137,80,78,71,13,10,26,10];
    return Buffer.from([
        ...sig,
        ...chunk('IHDR', ihdrData),
        ...chunk('IDAT', [...compressed]),
        ...chunk('IEND', [])
    ]);
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const size of sizes) {
    const png = generateStyledPNG(size);
    fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), png);
    console.log(`✓ icon-${size}x${size}.png - styled (${png.length} bytes)`);
}

// 同時生成 SVG 版本（備用）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#050505"/>
  <rect x="0" y="0" width="512" height="32" fill="#00ffcc"/>
  <rect x="0" y="480" width="512" height="32" fill="#00ffcc"/>
  <rect x="0" y="0" width="32" height="512" fill="#00ffcc"/>
  <rect x="480" y="0" width="32" height="512" fill="#00ffcc"/>
  <rect x="100" y="100" width="312" height="60" fill="#00ffcc"/>
  <rect x="216" y="100" width="80" height="312" fill="#00ffcc"/>
  <text x="256" y="470" font-family="monospace" font-size="32" fill="#00331a" text-anchor="middle" letter-spacing="2">NERV</text>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svg);
console.log('✓ icon.svg generated');
console.log('\nAll styled icons complete!');
