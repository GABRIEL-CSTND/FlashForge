// Makes the desk's textures (public/textures), the same bytes on every run:
//   node scripts/make-textures.cjs public/textures
// Writes two seamless 256x256 grayscale PNG tiles into the folder given as argv[2]:
//   leather.png - mid-gray (128) leather grain, meant for background-blend-mode: soft-light
//   paper.png   - near-white paper grain, meant for background-blend-mode: multiply
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node make-textures.cjs <out-dir>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodeGray(gray, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0; // filter: none
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = gray[y * w + x];
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Small seeded random number generator (mulberry32), so the tiles are the same on every run.
function seeded(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

// Leather: tileable cellular (Worley) noise. Thin dark creases where two pebbles meet,
// a faint dome on each pebble, and a little fine grain on top.
function leather() {
  const rand = seeded(7);
  const G = 22; // pebbles per side, about 11.6 px each
  const cell = SIZE / G;
  const pts = [];
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      pts.push([(gx + 0.15 + rand() * 0.7) * cell, (gy + 0.15 + rand() * 0.7) * cell]);
    }
  }
  const gray = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      let f1 = 1e9;
      let f2 = 1e9;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          const gx = (nx + G) % G;
          const gy = (ny + G) % G;
          const ox = nx < 0 ? -SIZE : nx >= G ? SIZE : 0;
          const oy = ny < 0 ? -SIZE : ny >= G ? SIZE : 0;
          const p = pts[gy * G + gx];
          const ddx = p[0] + ox - x;
          const ddy = p[1] + oy - y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) {
            f2 = d;
          }
        }
      }
      const inside = Math.min(1, (f2 - f1) / (cell * 0.35));
      const crease = 1 - inside;
      const dome = 1 - Math.min(1, f1 / (cell * 0.75));
      const v = 128 + (-crease * crease * 0.9 + dome * 0.35) * 38 + (rand() - 0.5) * 10;
      gray[y * SIZE + x] = clamp(v);
    }
  }
  return gray;
}

// Paper: soft tileable blotches plus fine speckle, all close to white.
function paper() {
  const rand = seeded(11);
  const N = 16;
  const grid = [];
  for (let i = 0; i < N * N; i++) grid.push(rand());
  const at = (i, j) => grid[(((j % N) + N) % N) * N + (((i % N) + N) % N)];
  const gray = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const fx = (x / SIZE) * N;
      const fy = (y / SIZE) * N;
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = fx - i;
      const ty = fy - j;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(i, j) * (1 - sx) + at(i + 1, j) * sx;
      const b = at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx;
      const blotch = a * (1 - sy) + b * sy;
      gray[y * SIZE + x] = clamp(255 - blotch * 7 - rand() * 9);
    }
  }
  return gray;
}

const files = [
  ['leather.png', leather()],
  ['paper.png', paper()],
];
for (const [name, gray] of files) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, encodeGray(gray, SIZE, SIZE));
  let min = 255;
  let max = 0;
  let sum = 0;
  for (const v of gray) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  console.log(name, fs.statSync(file).size + ' bytes', 'min ' + min, 'max ' + max, 'mean ' + (sum / gray.length).toFixed(1));
}
