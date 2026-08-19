// generate_icons.js - Generates simple PNG icons for the extension
// Run with: node generate_icons.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Use the built-in zlib module for proper PNG compression
const canvasAvailable = false;

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function createIconPNG(size) {
  if (canvasAvailable) {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Draw a document shape
    const docWidth = size * 0.5;
    const docHeight = size * 0.65;
    const docX = (size - docWidth) / 2;
    const docY = size * 0.15;

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.roundRect(docX, docY, docWidth, docHeight, size * 0.05);
    ctx.fill();

    // Draw text lines
    ctx.fillStyle = '#667eea';
    const lineHeight = docHeight * 0.12;
    const lineStartY = docY + docHeight * 0.2;
    const lineWidth = docWidth * 0.6;
    const lineX = docX + docWidth * 0.2;

    for (let i = 0; i < 4; i++) {
      const y = lineStartY + i * lineHeight;
      ctx.fillRect(lineX, y, lineWidth, size * 0.03);
    }

    // Draw a download arrow
    const arrowY = size * 0.75;
    ctx.fillStyle = '#764ba2';
    ctx.beginPath();
    ctx.moveTo(size * 0.5, arrowY + size * 0.1);
    ctx.lineTo(size * 0.35, arrowY - size * 0.05);
    ctx.lineTo(size * 0.65, arrowY - size * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(size * 0.45, arrowY - size * 0.2, size * 0.1, size * 0.2);

    return canvas.toBuffer('image/png');
  } else {
    // Fallback: create a simple solid color PNG manually
    return createSimplePNG(size);
  }
}

function createSimplePNG(size) {
  // Create a minimal valid PNG file (solid color with simple pattern)
  // This is a very basic PNG encoder
  const width = size;
  const height = size;

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk - raw image data
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset] = 0; // filter type 0
    offset++;
    for (let x = 0; x < width; x++) {
      // Gradient from #667eea to #764ba2
      const t = (x + y) / (width + height);
      const r = Math.round(0x66 + (0x76 - 0x66) * t);
      const g = Math.round(0x7e + (0x4b - 0x7e) * t);
      const b = Math.round(0xea + (0xa2 - 0xea) * t);
      rawData[offset] = r;
      rawData[offset + 1] = g;
      rawData[offset + 2] = b;
      rawData[offset + 3] = 255;
      offset += 4;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  // CRC32
  const crcBuffer = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

// Simple CRC32 implementation
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const sizes = [16, 32, 48, 128];
sizes.forEach(size => {
  const png = createIconPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated ${filePath} (${png.length} bytes)`);
});

console.log('Icons generated successfully!');