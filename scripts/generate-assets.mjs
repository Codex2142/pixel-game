import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve(process.cwd(), 'public/assets');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ============================================================================
// 1. MASTER 32-COLOR HIGH-FANTASY MEDIEVAL PIXEL-ART PALETTE
// ============================================================================
const PAL = {
  outline: [18, 16, 26, 255],
  shadow: [12, 10, 20, 115],

  // Grass & Foliage
  grassDeep: [26, 56, 40, 255],
  grassDark: [38, 82, 51, 255],
  grassMid: [58, 114, 64, 255],
  grassLight: [88, 150, 76, 255],
  grassSun: [132, 186, 92, 255],

  // Bark, Wood & Earth
  earthDeep: [48, 34, 28, 255],
  earthDark: [74, 52, 40, 255],
  earthMid: [104, 74, 54, 255],
  earthLight: [138, 102, 74, 255],
  woodPlank: [164, 122, 84, 255],

  // Stone & Ruins
  stoneDeep: [44, 48, 60, 255],
  stoneDark: [68, 74, 90, 255],
  stoneMid: [98, 106, 124, 255],
  stoneLight: [138, 148, 166, 255],
  stoneHigh: [184, 194, 210, 255],

  // Water & Arcane
  waterDeep: [24, 54, 92, 255],
  waterMid: [38, 88, 138, 255],
  waterLight: [68, 138, 188, 255],
  waterFoam: [176, 228, 248, 255],
  arcaneCyan: [84, 232, 255, 255],
  arcaneViolet: [162, 104, 246, 255],

  // Metals, Gold & Fire
  goldDark: [146, 96, 28, 255],
  goldMid: [212, 156, 48, 255],
  goldBright: [252, 218, 102, 255],
  emberRed: [198, 52, 44, 255],
  flameOrange: [244, 126, 44, 255],

  // Characters (Cobalt Knight & Goblin)
  cobaltDark: [32, 56, 116, 255],
  cobaltBright: [62, 106, 192, 255],
  skinWarm: [228, 178, 142, 255],
  goblinGreen: [110, 156, 62, 255],
};

// ============================================================================
// 2. ZERO-DEPENDENCY RGBA PNG ENCODER & PIXEL SURFACE
// ============================================================================
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

class Surface {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4, 0);
  }

  set(x, y, color) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h || !color) return;
    const idx = (iy * this.w + ix) * 4;
    const a = color[3] ?? 255;
    if (a === 255 || this.data[idx + 3] === 0) {
      this.data[idx] = color[0];
      this.data[idx + 1] = color[1];
      this.data[idx + 2] = color[2];
      this.data[idx + 3] = a;
    } else if (a > 0) {
      // Alpha blend
      const inv = 255 - a;
      this.data[idx] = Math.round((color[0] * a + this.data[idx] * inv) / 255);
      this.data[idx + 1] = Math.round((color[1] * a + this.data[idx + 1] * inv) / 255);
      this.data[idx + 2] = Math.round((color[2] * a + this.data[idx + 2] * inv) / 255);
      this.data[idx + 3] = Math.min(255, this.data[idx + 3] + a);
    }
  }

  getAlpha(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  fillRect(x, y, w, h, color) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.set(px, py, color);
      }
    }
  }

  fillEllipse(cx, cy, rx, ry, color) {
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
      for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) {
          this.set(px, py, color);
        }
      }
    }
  }

  fillCircle(cx, cy, r, color) {
    this.fillEllipse(cx, cy, r, r, color);
  }

  drawLine(x0, y0, x1, y1, color, thickness = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      if (thickness <= 1) {
        this.set(x, y, color);
      } else {
        this.fillCircle(x, y, thickness / 2, color);
      }
    }
  }

  // Adds a crisp 1px dark outline around opaque pixels (ignoring translucent ground shadows)
  applyOutline(outlineColor = PAL.outline, minAlpha = 200) {
    const copy = Buffer.from(this.data);
    const isSolid = (x, y) => {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
      return copy[(y * this.w + x) * 4 + 3] >= minAlpha;
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const idx = (y * this.w + x) * 4;
        if (copy[idx + 3] < minAlpha) {
          if (isSolid(x - 1, y) || isSolid(x + 1, y) || isSolid(x, y - 1) || isSolid(x, y + 1)) {
            this.data[idx] = outlineColor[0];
            this.data[idx + 1] = outlineColor[1];
            this.data[idx + 2] = outlineColor[2];
            this.data[idx + 3] = outlineColor[3];
          }
        }
      }
    }
  }

  blit(src, dstX, dstY) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const idx = (y * src.w + x) * 4;
        const a = src.data[idx + 3];
        if (a > 0) {
          this.set(dstX + x, dstY + y, [
            src.data[idx],
            src.data[idx + 1],
            src.data[idx + 2],
            a,
          ]);
        }
      }
    }
  }
}

// Deterministic hash for pixel texture noise
function hash2d(x, y, seed = 1) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

// Draws a 64x32 isometric diamond on a 64x40 canvas + 8px 3D depth cliff bevel
function drawIsoTile(surf, topColors, leftSkirtColor, rightSkirtColor, seed = 1, patternFn = null) {
  const cx = 31.5;
  const cy = 15.5;
  for (let y = 0; y < 32; y++) {
    const dy = Math.abs(y - cy);
    const halfW = Math.floor((1 - dy / 16) * 32);
    const minX = Math.max(0, Math.floor(cx - halfW));
    const maxX = Math.min(63, Math.ceil(cx + halfW));
    for (let x = minX; x <= maxX; x++) {
      const n = hash2d(x, y, seed);
      // Directional top-left sunlit gradient + ordered Bayer dither
      const lightBias = (32 - x) * 0.006 + (16 - y) * 0.01;
      const bayer = ((x & 1) ^ (y & 1)) * 0.08;
      const val = n * 0.75 + lightBias + bayer;
      let col = topColors[1];
      if (val < 0.28) col = topColors[0];
      else if (val > 0.68) col = topColors[2];
      if (topColors[3] && val > 0.86) col = topColors[3];
      if (patternFn) {
        const override = patternFn(x, y, n);
        if (override) col = override;
      }
      surf.set(x, y, col);
    }
    // Lower skirt bevel (rows 16..31 drop 7px down)
    if (y >= 16) {
      for (let x = minX; x <= maxX; x++) {
        // Only draw skirt along the lower outer rim
        if (x <= minX + 1 || x >= maxX - 1 || y >= 30) {
          for (let sy = 1; sy <= 7; sy++) {
            const isLeft = x < 32;
            const skirtCol = sy === 7 ? PAL.outline : (isLeft ? leftSkirtColor : rightSkirtColor);
            surf.set(x, y + sy, skirtCol);
          }
        }
      }
    }
  }
  // Subtle top diamond highlight edge
  for (let x = 8; x < 56; x++) {
    const yTop = Math.floor(Math.abs(x - 31.5) * 0.5);
    if (x < 32) {
      surf.set(x, yTop, topColors[2]);
    }
  }
}

// ============================================================================
// 3. GENERATE TERRAIN TILES (64x40)
// ============================================================================
const manifestAssets = [];
const savedSurfaces = new Map();

function saveAsset(filename, surf, category, role) {
  savedSurfaces.set(filename, surf);
  const fullPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(fullPath, encodePNG(surf.w, surf.h, surf.data));

  // Raster QA check (per create-game-assets skill)
  let transparentPixels = 0;
  let opaquePixels = 0;
  const colorSet = new Set();
  for (let i = 0; i < surf.data.length; i += 4) {
    const a = surf.data[i + 3];
    if (a === 0) {
      transparentPixels++;
    } else {
      if (a >= 250) opaquePixels++;
      colorSet.add(`${surf.data[i]},${surf.data[i + 1]},${surf.data[i + 2]}`);
    }
  }
  if (transparentPixels === 0 || opaquePixels === 0) {
    throw new Error(`QA Failed for ${filename}: invalid alpha transparency`);
  }
  if (colorSet.size > 32) {
    throw new Error(`QA Failed for ${filename}: palette count ${colorSet.size} exceeds 32 colors`);
  }

  manifestAssets.push({
    file: filename,
    category,
    role,
    width: surf.w,
    height: surf.h,
    uniqueColors: colorSet.size,
    hasAlpha: transparentPixels > 0,
    source: { kind: 'deterministic-pixel-pipeline', license: 'CC0-Original' },
    technical_checks_passed: true,
  });
}

// Grass variants (0 = lush blade tuples, 1 = wildflowers, 2 = mossy clover)
for (let variant = 0; variant < 3; variant++) {
  const s = new Surface(64, 40);
  drawIsoTile(
    s,
    [PAL.grassDark, PAL.grassMid, PAL.grassLight, PAL.grassSun],
    PAL.earthDark,
    PAL.earthDeep,
    10 + variant * 17,
    (x, y, n) => {
      // Grass blade clusters
      if (n > 0.92 && y > 4 && y < 27) return PAL.grassSun;
      if (variant === 1 && n < 0.035 && x > 14 && x < 50 && y > 7 && y < 24) {
        return (x + y) % 2 === 0 ? PAL.goldBright : PAL.waterFoam;
      }
      if (variant === 2 && ((x * 3 + y * 5) % 19 === 0)) {
        return PAL.grassDeep;
      }
      return null;
    }
  );
  saveAsset(`tile-grass-${variant}.png`, s, 'terrain', `Lush isometric forest grass v${variant}`);
}

// Dirt Path
{
  const s = new Surface(64, 40);
  drawIsoTile(
    s,
    [PAL.earthDark, PAL.earthMid, PAL.earthLight, PAL.woodPlank],
    PAL.earthDeep,
    PAL.outline,
    77,
    (x, y, n) => {
      if (n > 0.93) return PAL.stoneMid;
      if (n < 0.08) return PAL.earthDeep;
      return null;
    }
  );
  saveAsset('tile-dirt-path.png', s, 'terrain', 'Worn forest dirt trail');
}

// Cobblestone Path
{
  const s = new Surface(64, 40);
  drawIsoTile(
    s,
    [PAL.stoneDark, PAL.stoneMid, PAL.stoneLight, PAL.stoneHigh],
    PAL.stoneDeep,
    PAL.outline,
    105,
    (x, y, n) => {
      // Isometric cobble grid mortar & mossy joints
      const u = Math.floor((x + y * 2) / 7);
      const v = Math.floor((y * 2 - x + 64) / 7);
      const inEdge = ((x + y * 2) % 7 === 0) || ((y * 2 - x + 64) % 7 === 0);
      if (inEdge) return n > 0.55 ? PAL.grassDark : PAL.stoneDeep;
      const cellHash = hash2d(u, v, 303);
      return cellHash > 0.65 ? PAL.stoneLight : cellHash < 0.25 ? PAL.stoneDark : PAL.stoneMid;
    }
  );
  saveAsset('tile-cobble.png', s, 'terrain', 'Ancient mossy cobblestone path');
}

// Ruin Flagstone Floor
{
  const s = new Surface(64, 40);
  drawIsoTile(
    s,
    [PAL.stoneDeep, PAL.stoneDark, PAL.stoneMid, PAL.stoneLight],
    PAL.stoneDeep,
    PAL.outline,
    210,
    (x, y, n) => {
      const diag1 = (x + y * 2) % 16;
      const diag2 = (y * 2 - x + 64) % 16;
      if (diag1 === 0 || diag2 === 0) return n > 0.4 ? PAL.grassDark : PAL.outline;
      if (diag1 === 1 || diag2 === 1) return PAL.stoneLight;
      return null;
    }
  );
  saveAsset('tile-ruin-floor.png', s, 'terrain', 'Sunken temple carved flagstones');
}

// Hidden Vault Floor (Gilded Sunstone)
{
  const s = new Surface(64, 40);
  drawIsoTile(
    s,
    [PAL.stoneDark, PAL.stoneMid, PAL.goldMid, PAL.goldBright],
    PAL.stoneDeep,
    PAL.goldDark,
    312,
    (x, y) => {
      const dx = Math.abs(x - 31.5);
      const dy = Math.abs(y - 15.5) * 2;
      const dist = dx + dy;
      if (Math.abs(dist - 18) < 2.2 || Math.abs(dist - 8) < 1.8) return PAL.goldMid;
      return null;
    }
  );
  saveAsset('tile-vault-floor.png', s, 'terrain', 'Ornamented hidden vault sunstone tile');
}

// Timber Bridge Tile
{
  const s = new Surface(64, 40);
  drawIsoTile(
    s,
    [PAL.earthDark, PAL.earthMid, PAL.earthLight, PAL.woodPlank],
    PAL.earthDeep,
    PAL.outline,
    410,
    (x, y) => {
      const plank = (x + y * 2) % 6;
      if (plank === 0) return PAL.earthDeep;
      if (plank === 1) return PAL.woodPlank;
      if (y < 5 || y > 26) return PAL.earthDark; // guard beam
      return PAL.earthLight;
    }
  );
  saveAsset('tile-bridge.png', s, 'terrain', 'Isometric wooden bridge planks');
}

// Animated River Water Sheet (3 frames of 64x40 = 192x40)
{
  const sheet = new Surface(192, 40);
  for (let f = 0; f < 3; f++) {
    const frame = new Surface(64, 40);
    drawIsoTile(
      frame,
      [PAL.waterDeep, PAL.waterMid, PAL.waterLight, PAL.waterFoam],
      PAL.waterDeep,
      PAL.outline,
      500 + f * 31,
      (x, y) => {
        const wave = Math.sin((x * 0.22) + (y * 0.35) + f * 2.1);
        if (wave > 0.84) return PAL.waterFoam;
        if (wave > 0.45) return PAL.waterLight;
        if (wave < -0.55) return PAL.waterDeep;
        return PAL.waterMid;
      }
    );
    sheet.blit(frame, f * 64, 0);
  }
  saveAsset('tile-water-sheet.png', sheet, 'terrain', 'Animated 3-frame crystal river water');
}

// ============================================================================
// 4. GENERATE ENVIRONMENTAL PROPS (Y-Sorted Isometric Objects)
// ============================================================================

// Helper: Oak Tree (2 variants, 96x112)
for (let v = 0; v < 2; v++) {
  const s = new Surface(96, 112);
  // Contact shadow at base (48, 98)
  s.fillEllipse(48, 98, 28, 11, PAL.shadow);

  // Gnarled trunk & roots
  for (let y = 58; y <= 98; y++) {
    const spread = y > 86 ? (y - 86) * 0.9 : 0;
    const halfW = 7 + spread;
    for (let x = Math.floor(48 - halfW); x <= Math.ceil(48 + halfW); x++) {
      const nx = x - 48;
      let col = PAL.earthMid;
      if (nx < -2) col = PAL.earthLight;
      else if (nx > 3 || (x + y) % 5 === 0) col = PAL.earthDark;
      if (nx > 6) col = PAL.earthDeep;
      s.set(x, y, col);
    }
  }

  // Multi-layered pixel canopy clusters
  const blobs = v === 0
    ? [
        { x: 32, y: 54, rx: 22, ry: 16 },
        { x: 64, y: 56, rx: 22, ry: 16 },
        { x: 48, y: 46, rx: 28, ry: 20 },
        { x: 36, y: 34, rx: 22, ry: 16 },
        { x: 58, y: 36, rx: 22, ry: 16 },
        { x: 48, y: 26, rx: 22, ry: 15 },
      ]
    : [
        { x: 30, y: 52, rx: 21, ry: 17 },
        { x: 65, y: 52, rx: 21, ry: 17 },
        { x: 48, y: 42, rx: 27, ry: 19 },
        { x: 48, y: 24, rx: 23, ry: 16 },
      ];

  // Base deep shadow foliage
  for (const b of blobs) {
    s.fillEllipse(b.x, b.y + 4, b.rx, b.ry, PAL.grassDeep);
  }
  // Mid foliage with leafy texture
  for (const b of blobs) {
    for (let py = Math.floor(b.y - b.ry); py <= Math.ceil(b.y + b.ry); py++) {
      for (let px = Math.floor(b.x - b.rx); px <= Math.ceil(b.x + b.rx); px++) {
        const dx = (px - b.x) / b.rx;
        const dy = (py - b.y) / b.ry;
        if (dx * dx + dy * dy <= 0.95) {
          const n = hash2d(px, py, 90 + v);
          let col = PAL.grassMid;
          if (dy > 0.35 || dx > 0.45) col = PAL.grassDark;
          else if (dy < -0.25 && dx < 0.25) col = n > 0.4 ? PAL.grassSun : PAL.grassLight;
          else if (n > 0.65) col = PAL.grassLight;
          s.set(px, py, col);
        }
      }
    }
  }
  s.applyOutline(PAL.outline);
  saveAsset(`prop-oak-${v}.png`, s, 'prop', `Ancient forest oak tree v${v}`);
}

// Tall Pine / Evergreen Tree (72x108)
{
  const s = new Surface(72, 108);
  s.fillEllipse(36, 96, 20, 9, PAL.shadow);
  s.fillRect(32, 74, 8, 22, PAL.earthDark);
  s.fillRect(33, 74, 3, 22, PAL.earthMid);

  const tiers = [
    { yBase: 80, yTop: 48, halfW: 26 },
    { yBase: 62, yTop: 30, halfW: 21 },
    { yBase: 44, yTop: 12, halfW: 15 },
  ];
  for (const t of tiers) {
    for (let y = t.yTop; y <= t.yBase; y++) {
      const ratio = (y - t.yTop) / (t.yBase - t.yTop);
      const hw = Math.floor(ratio * t.halfW);
      for (let x = 36 - hw; x <= 36 + hw; x++) {
        const n = hash2d(x, y, 711);
        let col = PAL.grassDark;
        if (x < 36 - 2 && n > 0.35) col = PAL.grassMid;
        if (x < 36 - 6 && n > 0.65) col = PAL.grassLight;
        if (x > 36 + 5 || y > t.yBase - 3) col = PAL.grassDeep;
        s.set(x, y, col);
      }
    }
  }
  s.applyOutline(PAL.outline);
  saveAsset('prop-pine.png', s, 'prop', 'Tall whispering pine tree');
}

// Flowering Forest Bush (44x36)
{
  const s = new Surface(44, 36);
  s.fillEllipse(22, 30, 17, 6, PAL.shadow);
  s.fillEllipse(16, 20, 11, 9, PAL.grassDark);
  s.fillEllipse(28, 21, 11, 9, PAL.grassDeep);
  s.fillEllipse(22, 17, 13, 10, PAL.grassMid);
  s.fillEllipse(19, 14, 8, 6, PAL.grassLight);
  // Berries / blossoms
  s.fillRect(15, 16, 2, 2, PAL.emberRed);
  s.fillRect(25, 14, 2, 2, PAL.goldBright);
  s.fillRect(21, 21, 2, 2, PAL.emberRed);
  s.applyOutline(PAL.outline);
  saveAsset('prop-bush.png', s, 'prop', 'Flowering forest shrub');
}

// Mossy Boulder (48x36)
{
  const s = new Surface(48, 36);
  s.fillEllipse(24, 29, 18, 6, PAL.shadow);
  for (let y = 10; y <= 28; y++) {
    const hw = Math.floor(Math.sin(((y - 8) / 22) * Math.PI) * 18);
    for (let x = 24 - hw; x <= 24 + hw; x++) {
      let col = PAL.stoneMid;
      if (y < 16 && x < 26) col = PAL.stoneLight;
      if (x > 27 || y > 23) col = PAL.stoneDark;
      if (y < 15 && hash2d(x, y, 55) > 0.45) col = PAL.grassMid; // moss cap
      s.set(x, y, col);
    }
  }
  s.applyOutline(PAL.outline);
  saveAsset('prop-rock.png', s, 'prop', 'Moss-covered forest boulder');
}

// Broken Ruin Pillar (48x80)
{
  const s = new Surface(48, 80);
  s.fillEllipse(24, 71, 16, 7, PAL.shadow);
  // Plinth base
  s.fillRect(12, 60, 24, 10, PAL.stoneDark);
  s.fillRect(12, 58, 24, 4, PAL.stoneLight);
  // Fluted shaft with diagonal fracture at top
  for (let y = 24; y < 58; y++) {
    for (let x = 15; x < 33; x++) {
      if (y < 28 + (x - 15) * 0.45) continue;
      let col = PAL.stoneMid;
      if (x < 20) col = PAL.stoneLight;
      else if (x > 28) col = PAL.stoneDark;
      if (x % 4 === 0) col = PAL.stoneDeep;
      // Creeping vine
      if (Math.abs((y - 25) - (x - 15) * 1.6) < 2.2) col = PAL.grassMid;
      s.set(x, y, col);
    }
  }
  s.applyOutline(PAL.outline);
  saveAsset('prop-ruin-pillar-broken.png', s, 'prop', 'Weathered broken temple column');
}

// Ancient Ruin Archway (96x96)
{
  const s = new Surface(96, 96);
  s.fillEllipse(22, 86, 14, 6, PAL.shadow);
  s.fillEllipse(74, 86, 14, 6, PAL.shadow);
  // Left & Right columns
  for (const cx of [22, 74]) {
    s.fillRect(cx - 9, 32, 18, 54, PAL.stoneMid);
    s.fillRect(cx - 9, 32, 5, 54, PAL.stoneLight);
    s.fillRect(cx + 4, 32, 5, 54, PAL.stoneDark);
    s.fillRect(cx - 11, 78, 22, 8, PAL.stoneDark);
  }
  // Lintel arch beam
  s.fillRect(10, 18, 76, 16, PAL.stoneMid);
  s.fillRect(10, 16, 76, 4, PAL.stoneHigh);
  s.fillRect(12, 30, 72, 4, PAL.stoneDeep);
  // Moss patches on top
  s.fillEllipse(28, 18, 12, 4, PAL.grassMid);
  s.fillEllipse(66, 19, 14, 5, PAL.grassDark);
  s.applyOutline(PAL.outline);
  saveAsset('prop-ruin-arch.png', s, 'prop', 'Ivy-draped stone temple archway');
}

// Abandoned Outpost Tent & Crate (88x72)
{
  const s = new Surface(88, 72);
  s.fillEllipse(44, 60, 36, 10, PAL.shadow);
  // A-frame canvas tent
  for (let y = 18; y <= 58; y++) {
    const spread = Math.floor(((y - 18) / 40) * 28);
    for (let x = 40 - spread; x <= 44 + spread; x++) {
      let col = x < 42 ? PAL.earthLight : PAL.earthMid;
      if ((x + y) % 9 === 0) col = PAL.earthDark;
      // Dark interior opening
      if (y > 36 && Math.abs(x - 42) < (y - 36) * 0.45) col = PAL.outline;
      s.set(x, y, col);
    }
  }
  // Supply crate next to tent
  s.fillRect(62, 44, 16, 14, PAL.woodPlank);
  s.fillRect(62, 44, 16, 2, PAL.earthDark);
  s.fillRect(62, 56, 16, 2, PAL.earthDeep);
  s.drawLine(62, 44, 77, 57, PAL.earthDark);
  s.applyOutline(PAL.outline);
  saveAsset('prop-outpost-tent.png', s, 'prop', 'Abandoned ranger outpost shelter');
}

// Animated Campfire Sheet (4 frames of 48x48 = 192x48)
{
  const sheet = new Surface(192, 48);
  for (let f = 0; f < 4; f++) {
    const s = new Surface(48, 48);
    s.fillEllipse(24, 38, 16, 7, PAL.shadow);
    // Crossed charred logs & stone ring
    s.drawLine(13, 38, 35, 32, PAL.earthDeep, 3);
    s.drawLine(14, 32, 34, 38, PAL.earthDark, 3);
    for (let a = 0; a < 7; a++) {
      const ang = (a / 7) * Math.PI * 2;
      s.fillCircle(24 + Math.cos(ang) * 12, 36 + Math.sin(ang) * 4, 3, PAL.stoneMid);
    }
    // Flickering flame tongues
    const shift = (f % 2 === 0 ? -1 : 1) * (f > 1 ? 2 : 1);
    s.fillEllipse(24, 28, 8, 9, PAL.emberRed);
    s.fillEllipse(24 + shift, 25, 6, 8, PAL.flameOrange);
    s.fillEllipse(24 - shift * 0.5, 23 - (f % 2), 3, 6, PAL.goldBright);
    // Rising spark
    s.set(22 + f * 2, 13 - (f % 3) * 2, PAL.goldBright);
    s.applyOutline(PAL.outline);
    sheet.blit(s, f * 48, 0);
  }
  saveAsset('prop-campfire-sheet.png', sheet, 'prop', 'Animated 4-frame ranger campfire');
}

// Waystone Shrine Checkpoint Sheet (4 frames of 64x88 = 256x88)
// Frame 0: Dormant, Frames 1..3: Activated glowing obelisk
{
  const sheet = new Surface(256, 88);
  for (let f = 0; f < 4; f++) {
    const s = new Surface(64, 88);
    s.fillEllipse(32, 76, 24, 9, PAL.shadow);
    // Octagonal stone dais
    s.fillEllipse(32, 73, 22, 7, PAL.stoneDark);
    s.fillEllipse(32, 70, 19, 6, PAL.stoneMid);
    // Tapered runic obelisk
    for (let y = 18; y <= 68; y++) {
      const hw = Math.floor(6 + ((y - 18) / 50) * 6);
      for (let x = 32 - hw; x <= 32 + hw; x++) {
        let col = x < 32 ? PAL.stoneLight : PAL.stoneDark;
        if (Math.abs(x - 32) <= 1) col = PAL.stoneMid;
        if (y < 26 && Math.abs(x - 32) > (y - 16) * 0.7) continue;
        s.set(x, y, col);
      }
    }
    // Carved center rune channel
    const active = f > 0;
    const glowCol = f === 2 ? PAL.waterFoam : PAL.arcaneCyan;
    const runeCol = active ? glowCol : PAL.stoneDeep;
    s.fillRect(31, 30, 3, 28, runeCol);
    s.fillRect(28, 38, 9, 2, runeCol);
    s.fillRect(29, 48, 7, 2, runeCol);
    if (active) {
      // Floating crystal flare & orbiting motes
      const floatY = 12 + (f === 2 ? -2 : f === 3 ? 1 : 0);
      s.fillCircle(32, floatY, 4, PAL.arcaneCyan);
      s.fillCircle(32, floatY, 2, PAL.waterFoam);
      s.set(22, 34 + f * 2, PAL.goldBright);
      s.set(42, 44 - f * 2, PAL.arcaneCyan);
    }
    s.applyOutline(PAL.outline);
    sheet.blit(s, f * 64, 0);
  }
  saveAsset('prop-waystone-sheet.png', sheet, 'prop', 'Waystone Shrine checkpoint (dormant & active)');
}

// Ancient Mechanism Rune Pillars Sheet (6 frames of 48x84 = 288x84)
// 0: Moon Unlit, 1: Moon Lit, 2: Sun Unlit, 3: Sun Lit, 4: Star Unlit, 5: Star Lit
{
  const sheet = new Surface(288, 84);
  for (let i = 0; i < 6; i++) {
    const kind = Math.floor(i / 2); // 0=Moon, 1=Sun, 2=Star
    const lit = i % 2 === 1;
    const s = new Surface(48, 84);
    s.fillEllipse(24, 74, 17, 6, PAL.shadow);

    // Base pedestal & stone pillar
    s.fillRect(11, 64, 26, 10, PAL.stoneDark);
    s.fillRect(14, 22, 20, 44, PAL.stoneMid);
    s.fillRect(14, 22, 5, 44, PAL.stoneLight);
    s.fillRect(29, 22, 5, 44, PAL.stoneDark);
    s.fillRect(12, 18, 24, 5, PAL.stoneHigh);

    const glyphCol = lit
      ? (kind === 0 ? PAL.arcaneCyan : kind === 1 ? PAL.goldBright : PAL.arcaneViolet)
      : PAL.stoneDeep;

    // Draw distinct celestial glyph on pillar face (center 24, 42)
    if (kind === 0) {
      // Crescent Moon glyph
      s.fillCircle(24, 42, 6, glyphCol);
      s.fillCircle(27, 41, 5, PAL.stoneMid);
    } else if (kind === 1) {
      // Radiant Sun glyph
      s.fillCircle(24, 42, 5, glyphCol);
      s.drawLine(24, 33, 24, 51, glyphCol);
      s.drawLine(16, 42, 32, 42, glyphCol);
    } else {
      // Four-pointed Star glyph
      s.drawLine(24, 33, 24, 51, glyphCol, 2);
      s.drawLine(16, 42, 32, 42, glyphCol, 2);
      s.drawLine(19, 37, 29, 47, glyphCol, 1);
      s.drawLine(29, 37, 19, 47, glyphCol, 1);
    }

    if (lit) {
      // Crown brazier flame on top of pillar
      s.fillCircle(24, 13, 5, glyphCol);
      s.fillCircle(24, 13, 2, PAL.waterFoam);
    }
    s.applyOutline(PAL.outline);
    sheet.blit(s, i * 48, 0);
  }
  saveAsset('prop-rune-pillar-sheet.png', sheet, 'prop', 'Ruined temple rune mechanism pillars (Moon/Sun/Star)');
}

// Hidden Vault Door Sheet (2 frames of 80x96 = 160x96: 0=Sealed, 1=Opened)
{
  const sheet = new Surface(160, 96);
  for (let open = 0; open < 2; open++) {
    const s = new Surface(80, 96);
    s.fillEllipse(40, 86, 34, 8, PAL.shadow);
    // Massive stone frame
    s.fillRect(10, 14, 60, 72, PAL.stoneDark);
    s.fillRect(10, 14, 8, 72, PAL.stoneLight);
    s.fillRect(62, 14, 8, 72, PAL.stoneDeep);
    s.fillRect(6, 10, 68, 8, PAL.stoneHigh);

    if (open === 0) {
      // Sealed stone double doors with 3 rune sockets
      s.fillRect(18, 20, 44, 64, PAL.stoneMid);
      s.drawLine(40, 20, 40, 84, PAL.outline, 2);
      s.fillCircle(28, 48, 3, PAL.goldDark);
      s.fillCircle(40, 38, 3, PAL.goldDark);
      s.fillCircle(52, 48, 3, PAL.goldDark);
    } else {
      // Open doorway revealing warm golden sanctuary glow
      s.fillRect(18, 20, 44, 64, PAL.outline);
      s.fillEllipse(40, 56, 18, 26, PAL.goldDark);
      s.fillEllipse(40, 58, 12, 18, PAL.goldMid);
      s.fillEllipse(40, 60, 6, 10, PAL.goldBright);
    }
    s.applyOutline(PAL.outline);
    sheet.blit(s, open * 80, 0);
  }
  saveAsset('prop-vault-door-sheet.png', sheet, 'prop', 'Ancient temple hidden vault gate (sealed & open)');
}

// Treasure Chest Sheet (2 frames of 48x44 = 96x44: 0=Closed, 1=Open)
{
  const sheet = new Surface(96, 44);
  for (let open = 0; open < 2; open++) {
    const s = new Surface(48, 44);
    s.fillEllipse(24, 36, 18, 6, PAL.shadow);
    // Chest body
    s.fillRect(11, 20, 26, 15, PAL.earthMid);
    s.fillRect(11, 20, 26, 3, PAL.goldMid);
    s.fillRect(11, 20, 3, 15, PAL.goldDark);
    s.fillRect(34, 20, 3, 15, PAL.goldDark);
    if (open === 0) {
      // Domed closed lid + gold clasp
      s.fillRect(11, 13, 26, 7, PAL.earthLight);
      s.fillRect(11, 13, 3, 7, PAL.goldMid);
      s.fillRect(34, 13, 3, 7, PAL.goldMid);
      s.fillRect(22, 18, 4, 5, PAL.goldBright);
    } else {
      // Open lid + glittering gold & gems inside
      s.fillRect(11, 8, 26, 6, PAL.earthDark);
      s.fillRect(14, 17, 20, 5, PAL.goldBright);
      s.fillCircle(20, 18, 2, PAL.arcaneCyan);
      s.fillCircle(28, 18, 2, PAL.emberRed);
    }
    s.applyOutline(PAL.outline);
    sheet.blit(s, open * 48, 0);
  }
  saveAsset('prop-chest-sheet.png', sheet, 'prop', 'Medieval iron-bound treasure chest');
}

// Carved Lore Tablet (40x52)
{
  const s = new Surface(40, 52);
  s.fillEllipse(20, 44, 14, 5, PAL.shadow);
  s.fillRect(11, 38, 18, 6, PAL.stoneDark);
  s.fillRect(13, 12, 14, 28, PAL.stoneMid);
  s.fillRect(13, 12, 3, 28, PAL.stoneLight);
  s.fillEllipse(20, 12, 7, 5, PAL.stoneLight);
  // Engraved glowing lines
  for (let ry = 18; ry <= 30; ry += 4) {
    s.fillRect(16, ry, 8, 2, PAL.arcaneCyan);
  }
  s.applyOutline(PAL.outline);
  saveAsset('prop-lore-tablet.png', s, 'prop', 'Carved ancient lore stele');
}

// Sealed Ancient Dungeon Entrance Gate (128x128)
{
  const s = new Surface(128, 128);
  s.fillEllipse(64, 114, 52, 11, PAL.shadow);
  // Twin monolithic towers & carved lintel
  s.fillRect(16, 26, 26, 88, PAL.stoneDark);
  s.fillRect(16, 26, 7, 88, PAL.stoneLight);
  s.fillRect(86, 26, 26, 88, PAL.stoneDark);
  s.fillRect(86, 26, 7, 88, PAL.stoneMid);
  s.fillRect(10, 14, 108, 18, PAL.stoneMid);
  s.fillRect(10, 12, 108, 5, PAL.stoneHigh);
  // Sealed abyss portal inside arch
  s.fillRect(42, 32, 44, 80, PAL.outline);
  s.fillEllipse(64, 72, 18, 32, PAL.stoneDeep);
  // Ominous runic seal rings
  s.fillCircle(64, 68, 12, PAL.arcaneViolet);
  s.fillCircle(64, 68, 9, PAL.outline);
  s.fillCircle(64, 68, 4, PAL.emberRed);
  // Creeping moss
  s.fillEllipse(28, 26, 14, 6, PAL.grassDark);
  s.fillEllipse(96, 28, 15, 7, PAL.grassMid);
  s.applyOutline(PAL.outline);
  saveAsset('prop-dungeon-gate.png', s, 'prop', 'Monumental sealed dungeon entrance');
}

// ============================================================================
// 5. GENERATE CHARACTER & ENEMY SPRITESHEETS
// ============================================================================

// PROTAGONIST: Sir Aldric (24 frames of 48x56 = 1152x56)
// 0..3 Idle | 4..9 Walk | 10..13 Sword Attack | 14..16 Dodge | 17..18 Hurt | 19..22 Death | 23 Magic Cast
{
  const FW = 48;
  const FH = 56;
  const TOTAL = 24;
  const sheet = new Surface(FW * TOTAL, FH);

  for (let f = 0; f < TOTAL; f++) {
    const s = new Surface(FW, FH);
    const isIdle = f <= 3;
    const isWalk = f >= 4 && f <= 9;
    const isAtk = f >= 10 && f <= 13;
    const isDodge = f >= 14 && f <= 16;
    const isHurt = f >= 17 && f <= 18;
    const isDead = f >= 19 && f <= 22;
    const isCast = f === 23;

    // Ground shadow
    s.fillEllipse(24, 49, 12, 5, PAL.shadow);

    const bob = isIdle
      ? (f % 2 === 1 ? 1 : 0)
      : isWalk
      ? Math.round(Math.sin(((f - 4) / 6) * Math.PI * 2) * 1.5)
      : isDodge
      ? 5
      : isDead
      ? Math.min(12, (f - 18) * 3)
      : 0;

    const tiltX = isDodge ? (f - 14) * 2 : isHurt ? -2 : isAtk && f === 11 ? 3 : 0;
    const cx = 24 + tiltX;
    const cy = 28 + bob;

    // Boots / Legs
    const stride = isWalk ? Math.round(Math.sin(((f - 4) / 6) * Math.PI * 2) * 4) : 0;
    if (!isDead || f < 21) {
      s.fillRect(cx - 5 - stride * 0.5, 40 + bob * 0.5, 4, 8, PAL.earthDark);
      s.fillRect(cx + 1 + stride * 0.5, 40 - stride * 0.3, 4, 8, PAL.earthMid);
    }

    // Cobalt Ranger Cloak & Steel Cuirass
    s.fillEllipse(cx - 1, cy + 4, 9, 11, PAL.cobaltDark);
    s.fillEllipse(cx + 1, cy + 3, 7, 9, PAL.stoneLight); // breastplate
    s.fillRect(cx - 2, cy - 1, 6, 4, PAL.stoneHigh); // chest highlight
    // Gold baldric belt
    s.drawLine(cx - 5, cy - 2, cx + 5, cy + 7, PAL.goldMid, 2);

    // Steel Pauldrons (shoulders)
    s.fillCircle(cx - 7, cy - 2, 4, PAL.stoneMid);
    s.fillCircle(cx + 7, cy - 2, 4, PAL.stoneLight);

    // Head: Hooded Knight with warm face & steel circlet
    const headY = cy - 11;
    s.fillCircle(cx, headY, 6, PAL.cobaltBright);
    s.fillCircle(cx + 1, headY + 1, 4, isHurt ? PAL.emberRed : PAL.skinWarm);
    s.fillRect(cx - 3, headY - 3, 8, 2, PAL.goldBright); // knight circlet
    s.set(cx + 3, headY + 1, PAL.outline); // eye

    // Broadsword (or Arcane Cast hand)
    if (isAtk) {
      const aStep = f - 10;
      if (aStep === 0) {
        // Windup raised behind shoulder
        s.drawLine(cx - 6, cy - 4, cx - 14, cy - 18, PAL.stoneHigh, 2);
      } else if (aStep === 1) {
        // Wide horizontal slash forward
        s.drawLine(cx + 6, cy, cx + 21, cy - 3, PAL.waterFoam, 3);
        s.drawLine(cx + 4, cy + 2, cx + 19, cy + 6, PAL.arcaneCyan, 1);
      } else if (aStep === 2) {
        // Follow-through low
        s.drawLine(cx + 5, cy + 3, cx + 18, cy + 11, PAL.stoneHigh, 2);
      } else {
        s.drawLine(cx + 6, cy + 1, cx + 14, cy - 7, PAL.stoneLight, 2);
      }
    } else if (isCast) {
      // Glowing arcane orb in outstretched hand
      s.fillCircle(cx + 12, cy - 3, 5, PAL.arcaneViolet);
      s.fillCircle(cx + 12, cy - 3, 3, PAL.arcaneCyan);
    } else if (!isDead) {
      // Ready broadsword at right side
      s.drawLine(cx + 7, cy + 2, cx + 16, cy - 10, PAL.stoneHigh, 2);
      s.fillRect(cx + 5, cy + 1, 4, 2, PAL.goldMid); // crossguard
    }

    s.applyOutline(PAL.outline);
    sheet.blit(s, f * FW, 0);
  }
  saveAsset('player-sheet.png', sheet, 'character', 'Sir Aldric 24-frame action spritesheet');
}

// BASIC ENEMY: Goblin Scout (16 frames of 40x44 = 640x44)
// 0..3 Idle | 4..7 Walk | 8..10 Attack | 11..12 Hurt | 13..15 Death
{
  const FW = 40;
  const FH = 44;
  const TOTAL = 16;
  const sheet = new Surface(FW * TOTAL, FH);

  for (let f = 0; f < TOTAL; f++) {
    const s = new Surface(FW, FH);
    const isWalk = f >= 4 && f <= 7;
    const isAtk = f >= 8 && f <= 10;
    const isHurt = f >= 11 && f <= 12;
    const isDead = f >= 13;

    s.fillEllipse(20, 38, 10, 4, PAL.shadow);

    const bob = isWalk
      ? Math.round(Math.sin(((f - 4) / 4) * Math.PI * 2) * 2)
      : isDead
      ? (f - 12) * 3
      : f % 2;
    const lunge = isAtk && f === 9 ? 4 : isHurt ? -3 : 0;
    const cx = 20 + lunge;
    const cy = 24 + bob;

    // Legs
    const step = isWalk ? (f % 2 === 0 ? 3 : -3) : 0;
    s.fillRect(cx - 4 + step, 31 + bob * 0.5, 3, 6, PAL.earthDark);
    s.fillRect(cx + 2 - step, 31 + bob * 0.5, 3, 6, PAL.earthMid);

    // Hunched leather torso
    s.fillEllipse(cx, cy + 2, 7, 8, PAL.earthMid);
    s.fillEllipse(cx + 1, cy + 2, 5, 6, PAL.earthDark);

    // Goblin Head + Pointed Ears + Glowing Red Eye
    const hy = cy - 7;
    s.fillEllipse(cx - 7, hy, 5, 2, PAL.goblinGreen); // left ear
    s.fillEllipse(cx + 7, hy - 1, 5, 2, PAL.goblinGreen); // right ear
    s.fillCircle(cx + 1, hy, 5, isHurt ? PAL.waterFoam : PAL.goblinGreen);
    s.set(cx + 3, hy, PAL.emberRed); // menacing red eye

    // Jagged Dagger
    if (isAtk && f === 9) {
      s.drawLine(cx + 5, cy, cx + 16, cy - 2, PAL.stoneHigh, 2);
      s.drawLine(cx + 6, cy + 2, cx + 15, cy + 2, PAL.emberRed, 1);
    } else if (!isDead) {
      s.drawLine(cx + 5, cy + 2, cx + 12, cy - 4, PAL.stoneLight, 2);
    }

    s.applyOutline(PAL.outline);
    sheet.blit(s, f * FW, 0);
  }
  saveAsset('goblin-sheet.png', sheet, 'enemy', 'Goblin Scout 16-frame spritesheet');
}

// ELITE ENEMY: Moss-Stone Sentinel (18 frames of 64x72 = 1152x72)
// 0..3 Idle | 4..7 Walk | 8..11 Ground Slam | 12..13 Hurt | 14..17 Death
{
  const FW = 64;
  const FH = 72;
  const TOTAL = 18;
  const sheet = new Surface(FW * TOTAL, FH);

  for (let f = 0; f < TOTAL; f++) {
    const s = new Surface(FW, FH);
    const isWalk = f >= 4 && f <= 7;
    const isSlam = f >= 8 && f <= 11;
    const isHurt = f >= 12 && f <= 13;
    const isDead = f >= 14;

    s.fillEllipse(32, 62, 22, 8, PAL.shadow);

    const stomp = isWalk ? Math.round(Math.sin(((f - 4) / 4) * Math.PI * 2) * 2) : 0;
    const drop = isDead ? (f - 13) * 4 : isSlam && f === 9 ? 4 : 0;
    const cx = 32 + (isHurt ? -2 : 0);
    const cy = 34 + stomp + drop;

    // Massive stone pillar legs
    s.fillRect(cx - 12, 46 + stomp, 9, 14, PAL.stoneDark);
    s.fillRect(cx + 3, 46 - stomp, 9, 14, PAL.stoneMid);

    // Hulking mossy monolith torso
    s.fillEllipse(cx, cy, 16, 16, PAL.stoneDark);
    s.fillEllipse(cx - 2, cy - 2, 13, 13, PAL.stoneMid);
    // Moss mantle across shoulders
    s.fillEllipse(cx - 8, cy - 11, 10, 6, PAL.grassDark);
    s.fillEllipse(cx + 7, cy - 11, 10, 6, PAL.grassMid);

    // Glowing Amber Runic Core in chest
    const coreCol = isDead
      ? PAL.stoneDeep
      : isSlam
      ? PAL.emberRed
      : f % 2 === 0
      ? PAL.goldBright
      : PAL.flameOrange;
    s.fillCircle(cx, cy, 5, coreCol);
    s.fillCircle(cx, cy, 2, PAL.waterFoam);

    // Horned Rune-Stone Head
    s.fillRect(cx - 7, cy - 21, 14, 10, PAL.stoneLight);
    s.fillRect(cx - 4, cy - 17, 3, 2, coreCol);
    s.fillRect(cx + 2, cy - 17, 3, 2, coreCol);

    // Giant Stone Fists
    const armOffsetY = isSlam
      ? (f === 8 ? -16 : f === 9 ? 14 : f === 10 ? 10 : 0)
      : stomp;
    s.fillEllipse(cx - 19, cy + 4 + armOffsetY, 7, 10, PAL.stoneMid);
    s.fillEllipse(cx + 19, cy + 4 + armOffsetY, 7, 10, PAL.stoneLight);

    // Ground Slam shockwave sparks on impact frame
    if (isSlam && (f === 9 || f === 10)) {
      s.drawLine(10, 60, 54, 60, PAL.goldBright, 2);
    }

    s.applyOutline(PAL.outline);
    sheet.blit(s, f * FW, 0);
  }
  saveAsset('sentinel-sheet.png', sheet, 'enemy', 'Moss-Stone Sentinel Elite 18-frame spritesheet');
}

// ============================================================================
// 6. GENERATE VFX & UI ITEM ICONS
// ============================================================================

// Sword Slash Arc VFX (4 frames of 64x64 = 256x64)
{
  const sheet = new Surface(256, 64);
  for (let f = 0; f < 4; f++) {
    const s = new Surface(64, 64);
    const startAng = -0.9 + f * 0.25;
    const endAng = 0.9 - f * 0.15;
    for (let r = 16; r <= 28 - f * 2; r++) {
      for (let a = startAng; a <= endAng; a += 0.04) {
        const px = 32 + Math.cos(a) * r;
        const py = 32 + Math.sin(a) * r;
        const col = r > 24 ? PAL.waterFoam : r > 20 ? PAL.arcaneCyan : PAL.cobaltBright;
        s.set(px, py, col);
      }
    }
    sheet.blit(s, f * 64, 0);
  }
  saveAsset('vfx-slash-sheet.png', sheet, 'vfx', '4-frame sword slash crescent arc');
}

// Arcane Bolt Projectile Sheet (4 frames of 32x32 = 128x32)
{
  const sheet = new Surface(128, 32);
  for (let f = 0; f < 4; f++) {
    const s = new Surface(32, 32);
    s.fillCircle(16, 16, 9, PAL.arcaneViolet);
    s.fillCircle(16, 16, 6, PAL.arcaneCyan);
    s.fillCircle(16, 16, 3, PAL.waterFoam);
    const ang = (f / 4) * Math.PI * 2;
    s.fillCircle(16 + Math.cos(ang) * 8, 16 + Math.sin(ang) * 8, 2, PAL.waterFoam);
    s.fillCircle(16 - Math.cos(ang) * 8, 16 - Math.sin(ang) * 8, 2, PAL.arcaneCyan);
    s.applyOutline(PAL.outline);
    sheet.blit(s, f * 32, 0);
  }
  saveAsset('vfx-arcane-sheet.png', sheet, 'vfx', '4-frame Arcane Bolt spell projectile');
}

// 32x32 RPG Item & Ability Icons
function makeIcon(filename, role, drawFn) {
  const s = new Surface(32, 32);
  drawFn(s);
  s.applyOutline(PAL.outline);
  saveAsset(filename, s, 'icon', role);
}

makeIcon('icon-hp-potion.png', 'Health Potion icon', (s) => {
  s.fillRect(13, 5, 6, 4, PAL.woodPlank);
  s.fillRect(12, 9, 8, 3, PAL.stoneLight);
  s.fillCircle(16, 20, 8, PAL.emberRed);
  s.fillCircle(14, 18, 3, PAL.flameOrange);
  s.fillRect(12, 16, 2, 3, PAL.waterFoam);
});

makeIcon('icon-stamina-potion.png', 'Stamina Potion icon', (s) => {
  s.fillRect(13, 5, 6, 4, PAL.woodPlank);
  s.fillRect(12, 9, 8, 3, PAL.stoneLight);
  s.fillCircle(16, 20, 8, PAL.grassMid);
  s.fillCircle(14, 18, 4, PAL.grassSun);
  s.fillRect(12, 16, 2, 3, PAL.waterFoam);
});

makeIcon('icon-seal.png', 'Wayfarer Seal quest item icon', (s) => {
  s.fillCircle(16, 16, 10, PAL.goldDark);
  s.fillCircle(16, 16, 8, PAL.goldMid);
  s.fillCircle(16, 16, 4, PAL.arcaneCyan);
  s.fillRect(15, 7, 2, 18, PAL.goldBright);
});

makeIcon('icon-sunstone.png', 'Sunstone Relic quest item icon', (s) => {
  s.fillCircle(16, 16, 9, PAL.goldBright);
  s.fillCircle(16, 16, 5, PAL.flameOrange);
  s.drawLine(16, 3, 16, 29, PAL.goldBright, 2);
  s.drawLine(3, 16, 29, 16, PAL.goldBright, 2);
});

makeIcon('icon-core.png', 'Sentinel Amber Core quest item icon', (s) => {
  s.fillCircle(16, 16, 10, PAL.stoneDark);
  s.fillCircle(16, 16, 7, PAL.flameOrange);
  s.fillCircle(15, 15, 4, PAL.goldBright);
});

makeIcon('icon-arcane.png', 'Arcane Bolt spell icon', (s) => {
  s.fillCircle(16, 16, 10, PAL.cobaltDark);
  s.fillCircle(16, 16, 7, PAL.arcaneViolet);
  s.fillCircle(16, 16, 4, PAL.arcaneCyan);
  s.fillCircle(15, 15, 2, PAL.waterFoam);
});

// Equipment Icons (32x32)
makeIcon('icon-head-hood.png', 'Cobalt Ranger Hood icon', (s) => {
  s.fillCircle(16, 16, 9, PAL.cobaltDark);
  s.fillCircle(16, 15, 7, PAL.cobaltBright);
  s.fillCircle(16, 17, 4, PAL.outline);
  s.fillRect(11, 11, 10, 2, PAL.goldBright);
});

makeIcon('icon-head-helm.png', 'Vanguard Greathelm icon', (s) => {
  s.fillRect(10, 9, 12, 15, PAL.stoneMid);
  s.fillRect(10, 9, 4, 15, PAL.stoneHigh);
  s.fillRect(11, 15, 10, 2, PAL.outline);
  s.fillRect(15, 7, 2, 16, PAL.goldBright);
});

makeIcon('icon-chest-surcoat.png', 'Wayfarer Cobalt Brigandine icon', (s) => {
  s.fillRect(9, 8, 14, 16, PAL.cobaltDark);
  s.fillRect(11, 8, 10, 14, PAL.cobaltBright);
  s.drawLine(10, 9, 21, 22, PAL.goldMid, 2);
});

makeIcon('icon-chest-plate.png', 'Aethelgard Plate Cuirass icon', (s) => {
  s.fillEllipse(16, 16, 9, 9, PAL.stoneMid);
  s.fillEllipse(15, 15, 6, 7, PAL.stoneHigh);
  s.fillCircle(8, 11, 4, PAL.stoneLight);
  s.fillCircle(24, 11, 4, PAL.stoneLight);
  s.fillRect(14, 12, 4, 6, PAL.goldBright);
});

makeIcon('icon-legs-greaves.png', 'Reinforced Tassets icon', (s) => {
  s.fillRect(10, 7, 12, 5, PAL.earthDark);
  s.fillRect(10, 12, 5, 13, PAL.stoneMid);
  s.fillRect(17, 12, 5, 13, PAL.stoneLight);
});

makeIcon('icon-gloves-gauntlets.png', 'Knightly Vambraces icon', (s) => {
  s.fillRect(8, 11, 6, 11, PAL.stoneMid);
  s.fillRect(18, 11, 6, 11, PAL.stoneLight);
  s.fillRect(8, 11, 6, 3, PAL.goldMid);
  s.fillRect(18, 11, 6, 3, PAL.goldMid);
});

makeIcon('icon-boots-leather.png', 'Strider Leather Boots icon', (s) => {
  s.fillRect(8, 9, 6, 14, PAL.earthDark);
  s.fillRect(7, 20, 8, 4, PAL.earthMid);
  s.fillRect(18, 9, 6, 14, PAL.earthMid);
  s.fillRect(18, 20, 8, 4, PAL.earthLight);
});

makeIcon('icon-weapon-dagger.png', 'Rondel Dagger icon', (s) => {
  s.drawLine(9, 23, 14, 18, PAL.earthLight, 2);
  s.drawLine(12, 16, 16, 20, PAL.goldBright, 2);
  s.drawLine(14, 18, 24, 8, PAL.waterFoam, 2);
});

makeIcon('icon-weapon-greatsword.png', 'Aethelgard Claymore Greatsword icon', (s) => {
  s.drawLine(6, 26, 11, 21, PAL.earthDark, 2);
  s.fillCircle(5, 27, 2, PAL.goldBright);
  s.drawLine(8, 17, 15, 24, PAL.goldBright, 2);
  s.drawLine(11, 21, 27, 5, PAL.stoneHigh, 3);
  s.drawLine(12, 20, 27, 5, PAL.waterFoam, 1);
});

makeIcon('icon-offhand-shield.png', 'Heraldic Kite Shield icon', (s) => {
  s.fillEllipse(16, 16, 8, 10, PAL.stoneHigh);
  s.fillEllipse(16, 16, 6, 8, PAL.cobaltDark);
  s.fillRect(15, 9, 2, 14, PAL.goldBright);
  s.fillRect(11, 15, 10, 2, PAL.goldBright);
});

makeIcon('icon-accessory-cloak.png', 'Wayfarer Cloak & Gold Baldric icon', (s) => {
  s.fillEllipse(16, 17, 8, 9, PAL.cobaltDark);
  s.fillEllipse(15, 17, 6, 7, PAL.cobaltBright);
  s.fillCircle(16, 10, 3, PAL.goldBright);
});

// ============================================================================
// 6B. GENERATE 8-DIRECTIONAL × 30-FRAME MODULAR EQUIPMENT LAYER SPRITESHEETS
// ============================================================================
// Directions (rows 0..7): 0:S, 1:SW, 2:W, 3:NW, 4:N, 5:NE, 6:E, 7:SE
// Frame Columns (0..29):
//   0..3: Idle (4) | 4..9: Walk (6) | 10..13: Attack (4) | 14..16: Dodge (3)
//   17..18: Block (2) | 19..20: Hurt (2) | 21..23: Stagger (3) | 24..25: Switch (2) | 26..29: Death (4)
{
  const FW = 48;
  const FH = 56;
  const COLS = 30;
  const ROWS = 8;

  // Direction vectors for 0:S, 1:SW, 2:W, 3:NW, 4:N, 5:NE, 6:E, 7:SE
  const DIR_VECS = [
    { dx: 0, dy: 1, faceFront: true, faceBack: false },
    { dx: -0.7, dy: 0.7, faceFront: true, faceBack: false },
    { dx: -1, dy: 0, faceFront: false, faceBack: false },
    { dx: -0.7, dy: -0.7, faceFront: false, faceBack: true },
    { dx: 0, dy: -1, faceFront: false, faceBack: true },
    { dx: 0.7, dy: -0.7, faceFront: false, faceBack: true },
    { dx: 1, dy: 0, faceFront: false, faceBack: false },
    { dx: 0.7, dy: 0.7, faceFront: true, faceBack: false },
  ];

  function generateModularLayer(filename, role, drawLayerFrame) {
    const sheet = new Surface(FW * COLS, FH * ROWS);
    for (let row = 0; row < ROWS; row++) {
      const dir = DIR_VECS[row];
      for (let col = 0; col < COLS; col++) {
        const s = new Surface(FW, FH);

        const isIdle = col <= 3;
        const isWalk = col >= 4 && col <= 9;
        const isAtk = col >= 10 && col <= 13;
        const isDodge = col >= 14 && col <= 16;
        const isBlock = col >= 17 && col <= 18;
        const isHurt = col >= 19 && col <= 20;
        const isStagger = col >= 21 && col <= 23;
        const isSwitch = col >= 24 && col <= 25;
        const isDead = col >= 26;

        const bob = isIdle
          ? (col % 2 === 1 ? 1 : 0)
          : isWalk
          ? Math.round(Math.sin(((col - 4) / 6) * Math.PI * 2) * 1.5)
          : isDodge
          ? 5
          : isStagger
          ? (col % 2 === 0 ? 2 : -1)
          : isDead
          ? Math.min(12, (col - 25) * 3)
          : 0;

        const lungeX = isAtk && col === 11
          ? Math.round(dir.dx * 4)
          : isDodge
          ? Math.round(dir.dx * (col - 13) * 2)
          : isHurt
          ? -Math.round(dir.dx * 2)
          : isStagger
          ? (col === 22 ? -3 : 2)
          : 0;

        const lungeY = isAtk && col === 11
          ? Math.round(dir.dy * 3)
          : isDodge
          ? Math.round(dir.dy * 2)
          : 0;

        const cx = 24 + lungeX;
        const cy = 28 + bob + lungeY;
        const stride = isWalk ? Math.round(Math.sin(((col - 4) / 6) * Math.PI * 2) * 4) : 0;

        drawLayerFrame(s, {
          row,
          col,
          dir,
          cx,
          cy,
          bob,
          stride,
          isIdle,
          isWalk,
          isAtk,
          isDodge,
          isBlock,
          isHurt,
          isStagger,
          isSwitch,
          isDead,
        });

        s.applyOutline(PAL.outline);
        sheet.blit(s, col * FW, row * FH);
      }
    }
    saveAsset(filename, sheet, 'modular-layer', role);
  }

  // 1. Base Character Body
  generateModularLayer('layer-body-base.png', 'Base character body 8-dir layer', (s, p) => {
    const { cx, cy, bob, stride, dir, isHurt, isStagger, isDead } = p;
    s.fillEllipse(24, 49, 12, 5, PAL.shadow);
    // Bare legs & arms under-tunic
    if (!isDead) {
      s.fillRect(cx - 5 - stride * 0.4, 38 + bob * 0.4, 4, 8, PAL.earthMid);
      s.fillRect(cx + 1 + stride * 0.4, 38 - stride * 0.3, 4, 8, PAL.earthLight);
    }
    // Linen under-tunic torso
    s.fillEllipse(cx, cy + 3, 7, 9, PAL.earthLight);
    // Head & Hair
    const headY = cy - 11;
    s.fillCircle(cx, headY, 5, isHurt ? PAL.emberRed : PAL.skinWarm);
    if (dir.faceBack) {
      s.fillCircle(cx, headY, 5, PAL.earthDark); // back of hair
    } else {
      s.fillEllipse(cx, headY - 3, 5, 2, PAL.earthDark); // hair top
      const eyeX = cx + Math.round(dir.dx * 2.5);
      s.set(eyeX - 1, headY + 1, PAL.outline);
      s.set(eyeX + 1, headY + 1, PAL.outline);
    }
    if (isStagger) {
      // Stagger daze spark above head
      s.set(cx - 5, headY - 8, PAL.goldBright);
      s.set(cx + 5, headY - 7, PAL.goldBright);
    }
  });

  // 2. Headgear: Cobalt Ranger Hood
  generateModularLayer('layer-head-hood.png', 'Cobalt Ranger Hood 8-dir layer', (s, p) => {
    const { cx, cy, dir } = p;
    const headY = cy - 11;
    s.fillCircle(cx, headY, 6, PAL.cobaltDark);
    s.fillCircle(cx - Math.round(dir.dx), headY - 1, 5, PAL.cobaltBright);
    if (!dir.faceBack) {
      s.fillCircle(cx + Math.round(dir.dx * 2), headY + 1, 3, PAL.skinWarm);
      s.set(cx + Math.round(dir.dx * 3), headY + 1, PAL.outline);
    }
    s.fillRect(cx - 4, headY - 3, 8, 2, PAL.goldBright);
  });

  // 3. Headgear: Vanguard Greathelm
  generateModularLayer('layer-head-helm.png', 'Vanguard Greathelm 8-dir layer', (s, p) => {
    const { cx, cy, dir } = p;
    const headY = cy - 11;
    s.fillRect(cx - 5, headY - 5, 10, 11, PAL.stoneMid);
    s.fillRect(cx - 5, headY - 5, 4, 11, PAL.stoneHigh);
    s.fillRect(cx - 1, headY - 7, 2, 12, PAL.goldBright);
    if (!dir.faceBack) {
      s.fillRect(cx - 3 + Math.round(dir.dx), headY, 6, 2, PAL.outline); // visor slit
    }
  });

  // 4. Chest: Wayfarer Cobalt Brigandine
  generateModularLayer('layer-chest-surcoat.png', 'Wayfarer Cobalt Brigandine 8-dir layer', (s, p) => {
    const { cx, cy } = p;
    s.fillEllipse(cx, cy + 3, 8, 10, PAL.cobaltDark);
    s.fillEllipse(cx, cy + 2, 6, 8, PAL.cobaltBright);
    s.fillRect(cx - 6, cy + 5, 12, 2, PAL.earthDark); // belt
    s.fillRect(cx - 1, cy + 5, 3, 2, PAL.goldBright); // buckle
  });

  // 5. Chest: Aethelgard Plate Cuirass
  generateModularLayer('layer-chest-plate.png', 'Aethelgard Plate Cuirass 8-dir layer', (s, p) => {
    const { cx, cy } = p;
    s.fillEllipse(cx, cy + 3, 8, 10, PAL.stoneMid);
    s.fillEllipse(cx - 1, cy + 1, 6, 7, PAL.stoneHigh);
    s.fillCircle(cx - 7, cy - 2, 4, PAL.stoneLight);
    s.fillCircle(cx + 7, cy - 2, 4, PAL.stoneHigh);
    s.fillRect(cx - 1, cy, 2, 6, PAL.goldBright);
  });

  // 6. Legs: Reinforced Tassets & Trousers
  generateModularLayer('layer-legs-greaves.png', 'Reinforced Tassets 8-dir layer', (s, p) => {
    const { cx, bob, stride, isDead } = p;
    if (isDead) return;
    s.fillRect(cx - 5 - stride * 0.4, 36 + bob * 0.4, 4, 6, PAL.stoneDark);
    s.fillRect(cx + 1 + stride * 0.4, 36 - stride * 0.3, 4, 6, PAL.stoneMid);
  });

  // 7. Gloves: Knightly Vambraces
  generateModularLayer('layer-gloves-gauntlets.png', 'Knightly Vambraces 8-dir layer', (s, p) => {
    const { cx, cy, isSwitch } = p;
    const offY = isSwitch ? -3 : 0;
    s.fillCircle(cx - 8, cy + 3 + offY, 3, PAL.stoneLight);
    s.fillCircle(cx + 8, cy + 3 - offY, 3, PAL.stoneHigh);
  });

  // 8. Boots: Strider Leather Boots
  generateModularLayer('layer-boots-leather.png', 'Strider Leather Boots 8-dir layer', (s, p) => {
    const { cx, bob, stride, isDead } = p;
    if (isDead) return;
    s.fillRect(cx - 5 - stride * 0.4, 42 + bob * 0.4, 4, 6, PAL.earthDeep);
    s.fillRect(cx + 1 + stride * 0.4, 42 - stride * 0.3, 4, 6, PAL.earthDark);
  });

  // 9. Accessory: Wayfarer Cloak & Gold Baldric
  generateModularLayer('layer-accessory-cloak.png', 'Wayfarer Cloak & Baldric 8-dir layer', (s, p) => {
    const { cx, cy, dir, stride } = p;
    const sway = Math.round(stride * 0.5);
    s.fillEllipse(cx - Math.round(dir.dx * 3) + sway, cy + 5, 9, 11, PAL.cobaltDark);
    s.drawLine(cx - 5, cy - 2, cx + 5, cy + 7, PAL.goldMid, 2);
  });

  // 10. Main-Hand Weapon: Rondel Dagger (Compact nimble blade)
  generateModularLayer('layer-weapon-dagger.png', 'Rondel Dagger 8-dir layer', (s, p) => {
    const { cx, cy, dir, col, isAtk, isSwitch, isDead } = p;
    if (isDead) return;
    const handX = cx + Math.round(dir.dx * 6) + (dir.dy >= 0 ? 5 : -5);
    const handY = cy + 2 + Math.round(dir.dy * 2);

    if (isSwitch) {
      // Reaching across belt to draw/sheathe dagger
      s.drawLine(cx - 3, cy + 4, cx + 4, cy - 1, PAL.waterFoam, 2);
      return;
    }

    if (isAtk) {
      const step = col - 10;
      const thrust = step === 1 ? 11 : step === 2 ? 7 : 3;
      const tipX = handX + Math.round(dir.dx * thrust) + (dir.dx === 0 ? 5 : 0);
      const tipY = handY + Math.round(dir.dy * thrust);
      s.drawLine(handX, handY, tipX, tipY, PAL.waterFoam, 2);
      s.fillCircle(handX, handY, 2, PAL.goldBright);
      if (step === 1) {
        s.drawLine(handX, handY + 2, tipX, tipY + 2, PAL.arcaneCyan, 1);
      }
    } else {
      const tipX = handX + Math.round(dir.dx * 6) + 3;
      const tipY = handY - 6 + Math.round(dir.dy * 3);
      s.drawLine(handX, handY, tipX, tipY, PAL.stoneHigh, 2);
      s.fillRect(handX - 1, handY - 1, 3, 2, PAL.goldMid);
    }
  });

  // 11. Main-Hand Weapon: Aethelgard Claymore (Greatsword — distinct large 2H scale & positioning)
  generateModularLayer('layer-weapon-greatsword.png', 'Aethelgard Greatsword 8-dir layer', (s, p) => {
    const { cx, cy, dir, col, isAtk, isSwitch, isDead } = p;
    if (isDead) return;
    const handX = cx + Math.round(dir.dx * 6) + (dir.dy >= 0 ? 6 : -6);
    const handY = cy + 1 + Math.round(dir.dy * 2);

    if (isSwitch) {
      // Slinging massive claymore across shoulder
      s.drawLine(cx - 8, cy + 8, cx + 10, cy - 14, PAL.stoneHigh, 3);
      s.fillCircle(cx - 8, cy + 8, 2, PAL.goldBright);
      return;
    }

    if (isAtk) {
      const step = col - 10;
      if (step === 0) {
        // High two-handed overhead windup
        s.drawLine(cx - 4, cy - 4, cx - 14, cy - 22, PAL.stoneHigh, 3);
        s.fillRect(cx - 6, cy - 6, 5, 2, PAL.goldBright);
      } else if (step === 1 || step === 2) {
        // Massive extended greatsword cleave
        const reach = step === 1 ? 20 : 16;
        const tipX = handX + Math.round(dir.dx * reach) + (dir.dx === 0 ? 12 : 0);
        const tipY = handY + Math.round(dir.dy * reach);
        s.drawLine(handX, handY, tipX, tipY, PAL.waterFoam, 4);
        s.drawLine(handX, handY, tipX, tipY, PAL.goldBright, 1);
        s.fillCircle(handX, handY, 3, PAL.goldBright);
      } else {
        s.drawLine(handX, handY, handX + 12, handY - 12, PAL.stoneHigh, 3);
      }
    } else {
      // Massive diagonal greatsword resting over shoulder
      const tipX = handX + Math.round(dir.dx * 8) + 9;
      const tipY = handY - 17;
      s.drawLine(handX, handY, tipX, tipY, PAL.stoneHigh, 3);
      s.drawLine(handX + 1, handY - 1, tipX, tipY, PAL.waterFoam, 1);
      s.drawLine(handX - 3, handY - 2, handX + 4, handY + 2, PAL.goldBright, 2); // wide crossguard
    }
  });

  // 12. Off-Hand Shield: Heraldic Kite Shield (Only active with Dagger!)
  generateModularLayer('layer-offhand-shield.png', 'Heraldic Kite Shield 8-dir layer', (s, p) => {
    const { cx, cy, dir, isBlock, isSwitch, isDead } = p;
    if (isDead) return;
    // Positioned on off-hand side; pulled front-and-center when Blocking!
    const blockShiftX = isBlock ? Math.round(dir.dx * 4) : 0;
    const blockShiftY = isBlock ? -3 : 0;
    const sx = cx - Math.round(dir.dx * 3) + (dir.dy >= 0 ? -7 : 7) + blockShiftX;
    const sy = cy + 3 + blockShiftY + (isSwitch ? 2 : 0);

    s.fillEllipse(sx, sy, 5, 7, PAL.stoneHigh);
    s.fillEllipse(sx, sy, 4, 5, PAL.cobaltDark);
    s.fillRect(sx - 1, sy - 4, 2, 8, PAL.goldBright);
    s.fillRect(sx - 3, sy - 1, 6, 2, PAL.goldBright);
  });
}

// ============================================================================
// 7. BUILD CONTACT SHEET PREVIEW, ISOMETRIC DIORAMA & ASSET MANIFEST
// ============================================================================
{
  const preview = new Surface(680, 380);
  // Checkerboard backdrop for transparent preview verification (per create-game-assets skill)
  for (let y = 0; y < preview.h; y++) {
    for (let x = 0; x < preview.w; x++) {
      const dark = ((x >> 3) ^ (y >> 3)) & 1;
      preview.set(x, y, dark ? [26, 29, 38, 255] : [36, 40, 52, 255]);
    }
  }

  // Row 1: Isometric Terrain Tiles (grass, dirt, cobble, ruin, vault, bridge, water)
  const tileKeys = [
    'tile-grass-0.png',
    'tile-grass-1.png',
    'tile-dirt-path.png',
    'tile-cobble.png',
    'tile-ruin-floor.png',
    'tile-vault-floor.png',
    'tile-bridge.png',
    'tile-water-sheet.png',
  ];
  tileKeys.forEach((k, idx) => {
    const s = savedSurfaces.get(k);
    if (s) preview.blit(s, 14 + idx * 74, 12);
  });

  // Row 2: Environmental Props (Oak, Pine, Waystone, Rune Pillars, Vault Door, Dungeon Gate)
  preview.blit(savedSurfaces.get('prop-oak-0.png'), 10, 62);
  preview.blit(savedSurfaces.get('prop-pine.png'), 106, 66);
  preview.blit(savedSurfaces.get('prop-waystone-sheet.png'), 182, 82);
  preview.blit(savedSurfaces.get('prop-rune-pillar-sheet.png'), 14, 180);
  preview.blit(savedSurfaces.get('prop-vault-door-sheet.png'), 315, 172);
  preview.blit(savedSurfaces.get('prop-dungeon-gate.png'), 490, 146);

  // Row 3: Character, Enemies, Chest, Campfire, Icons
  preview.blit(savedSurfaces.get('player-sheet.png'), 12, 272);
  preview.blit(savedSurfaces.get('goblin-sheet.png'), 12, 330);
  preview.blit(savedSurfaces.get('sentinel-sheet.png'), 280, 298);

  const iconKeys = [
    'icon-hp-potion.png',
    'icon-stamina-potion.png',
    'icon-seal.png',
    'icon-sunstone.png',
    'icon-core.png',
    'icon-arcane.png',
  ];
  iconKeys.forEach((k, idx) => {
    const s = savedSurfaces.get(k);
    if (s) preview.blit(s, 450 + idx * 36, 76);
  });

  const previewPath = path.join(OUT_DIR, 'preview-sheet.png');
  fs.writeFileSync(previewPath, encodePNG(preview.w, preview.h, preview.data));

  // Also render an Isometric Enchanted Forest Diorama Scene composite (640x360)
  const diorama = new Surface(640, 360);
  for (let y = 0; y < diorama.h; y++) {
    for (let x = 0; x < diorama.w; x++) {
      diorama.set(x, y, [17, 22, 27, 255]);
    }
  }
  const grass0 = savedSurfaces.get('tile-grass-0.png');
  const grass1 = savedSurfaces.get('tile-grass-1.png');
  const cobble = savedSurfaces.get('tile-cobble.png');
  const ruin = savedSurfaces.get('tile-ruin-floor.png');
  const bridge = savedSurfaces.get('tile-bridge.png');
  const waterSheet = savedSurfaces.get('tile-water-sheet.png');
  const water0 = new Surface(64, 40);
  water0.blit(waterSheet, 0, 0);

  for (let ty = 0; ty < 11; ty++) {
    for (let tx = 0; tx < 11; tx++) {
      const sx = 320 + (tx - ty) * 32 - 32;
      const sy = 44 + (tx + ty) * 16;
      let tile = (tx + ty) % 3 === 0 ? grass1 : grass0;
      if (tx === 5) tile = ty >= 4 && ty <= 6 ? bridge : water0;
      else if (ty === 5) tile = cobble;
      else if (tx >= 7 && ty <= 4) tile = ruin;
      diorama.blit(tile, sx, sy);
    }
  }

  // Place trees, Waystone, Rune Pillars, Chest, Player, Goblin, Sentinel in depth order
  const oak = savedSurfaces.get('prop-oak-0.png');
  const pine = savedSurfaces.get('prop-pine.png');
  diorama.blit(oak, 220, 12);
  diorama.blit(pine, 110, 74);
  diorama.blit(savedSurfaces.get('prop-dungeon-gate.png'), 430, 56);

  // Crop single frames for diorama actors
  const cropFrame = (sheet, fw, fh, frameIdx) => {
    const sub = new Surface(fw, fh);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const srcX = frameIdx * fw + x;
        const idx = (y * sheet.w + srcX) * 4;
        sub.set(x, y, [
          sheet.data[idx],
          sheet.data[idx + 1],
          sheet.data[idx + 2],
          sheet.data[idx + 3],
        ]);
      }
    }
    return sub;
  };

  const waystoneActive = cropFrame(savedSurfaces.get('prop-waystone-sheet.png'), 64, 88, 2);
  const pillarMoonLit = cropFrame(savedSurfaces.get('prop-rune-pillar-sheet.png'), 48, 84, 1);
  const pillarSunLit = cropFrame(savedSurfaces.get('prop-rune-pillar-sheet.png'), 48, 84, 3);
  const chestClosed = cropFrame(savedSurfaces.get('prop-chest-sheet.png'), 48, 44, 0);
  const playerAtk = cropFrame(savedSurfaces.get('player-sheet.png'), 48, 56, 11);
  const slashVfx = cropFrame(savedSurfaces.get('vfx-slash-sheet.png'), 64, 64, 1);
  const goblinIdle = cropFrame(savedSurfaces.get('goblin-sheet.png'), 40, 44, 1);
  const sentinelSlam = cropFrame(savedSurfaces.get('sentinel-sheet.png'), 64, 72, 9);

  diorama.blit(waystoneActive, 165, 136);
  diorama.blit(pillarMoonLit, 370, 96);
  diorama.blit(pillarSunLit, 430, 118);
  diorama.blit(chestClosed, 412, 162);
  diorama.blit(playerAtk, 268, 168);
  diorama.blit(slashVfx, 290, 164);
  diorama.blit(goblinIdle, 326, 178);
  diorama.blit(sentinelSlam, 468, 176);
  diorama.blit(oak, 70, 190);

  fs.writeFileSync(
    path.join(OUT_DIR, 'diorama-preview.png'),
    encodePNG(diorama.w, diorama.h, diorama.data)
  );

  const manifest = {
    project: 'Vale of Aethelgard — Isometric Action RPG Prototype',
    perspective: '2D Isometric (2:1 projection, 64x32 diamond tiles)',
    paletteSize: Object.keys(PAL).length,
    generatedAt: new Date().toISOString(),
    assets: manifestAssets,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'asset-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log(`Generated and QA-verified ${manifestAssets.length} pixel-art assets in public/assets/`);
}
