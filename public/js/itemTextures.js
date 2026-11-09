import * as THREE from 'three';

// Procedural textures for item models (no image files). Every item model gets surface
// detail automatically: createItemModel() in itemModels.js runs decorateMaterial() on each
// material. Metal gets brushed streaks, wood gets grain, everything else a fine grit.
// Glowing, see-through or already-textured materials are left alone.
//
// You can also use the textures directly: itemTexture('hazard'), itemTexture('carbon'), ...

const cache = new Map();

function canvasTexture(key, size, draw, { color = false, repeat = 1 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// Tiny deterministic RNG so textures look the same for everyone
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DRAW = {
  // Fine grit (bump/roughness for plastic, rubber, cloth, stone...)
  grit(ctx, s) {
    const r = rng(1);
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = 150 + r() * 105;
      img.data.set([v, v, v, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  },
  // Light speckle used as a color map so flat colors get subtle variation
  tint(ctx, s) {
    const r = rng(2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const g = 215 + r() * 40;
      ctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
      ctx.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3);
    }
  },
  // Brushed metal streaks
  brushed(ctx, s) {
    const r = rng(3);
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const g = 120 + r() * 135;
      ctx.strokeStyle = `rgba(${g},${g},${g},0.55)`;
      ctx.lineWidth = r() * 1.5;
      const y = r() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (r() - 0.5) * 2);
      ctx.stroke();
    }
    // A few scratches
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.6;
      const x = r() * s, y = r() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20);
      ctx.stroke();
    }
  },
  // Wood grain (white-ish so the material color shows through)
  wood(ctx, s) {
    const r = rng(4);
    ctx.fillStyle = '#f2e6d8';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const x0 = r() * s;
      const g = 150 + r() * 60;
      ctx.strokeStyle = `rgba(${g},${g * 0.8},${g * 0.6},0.6)`;
      ctx.lineWidth = 0.8 + r() * 2.2;
      ctx.beginPath();
      for (let y = 0; y <= s; y += 8) ctx.lineTo(x0 + Math.sin(y * 0.05 + i) * (3 + r() * 4), y);
      ctx.stroke();
    }
    // Knots
    for (let i = 0; i < 3; i++) {
      const x = r() * s, y = r() * s;
      for (let k = 6; k > 0; k--) {
        ctx.strokeStyle = 'rgba(120,80,50,0.35)';
        ctx.beginPath();
        ctx.ellipse(x, y, k * 2.2, k * 1.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },
  // Yellow/black hazard stripes
  hazard(ctx, s) {
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1c1c';
    for (let x = -s; x < s * 2; x += s / 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + s / 8, 0);
      ctx.lineTo(x + s / 8 - s, s);
      ctx.lineTo(x - s, s);
      ctx.fill();
    }
  },
  // Carbon fiber weave
  carbon(ctx, s) {
    const cell = s / 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const g = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
        const flip = (x + y) % 2;
        g.addColorStop(0, flip ? '#3a3d44' : '#16181c');
        g.addColorStop(1, flip ? '#16181c' : '#3a3d44');
        ctx.fillStyle = g;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  },
  // Glowing circuit traces (use as emissiveMap)
  circuit(ctx, s) {
    const r = rng(5);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      let x = Math.round(r() * 16) * (s / 16), y = Math.round(r() * 16) * (s / 16);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (r() > 0.5) x += (r() > 0.5 ? 1 : -1) * (s / 8);
        else y += (r() > 0.5 ? 1 : -1) * (s / 8);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  // Scales (dragon-ish, fish-ish): use as bump
  scales(ctx, s) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    const step = s / 8;
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const cx = x * step + (y % 2 ? step / 2 : 0), cy = y * step * 0.8;
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, step * 0.6);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, '#404040');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, step * 0.55, 0, Math.PI);
        ctx.fill();
      }
    }
  },
};

const OPTS = {
  tint: { color: true },
  wood: { color: true },
  hazard: { color: true, repeat: 1 },
  carbon: { color: true, repeat: 2 },
};

export function itemTexture(name) {
  return canvasTexture(name, 256, DRAW[name], OPTS[name]);
}

// Add surface detail to a material that doesn't have any yet
export function decorateMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.decorated) return;
  m.userData.decorated = true;
  if (m.map || m.bumpMap || m.transparent || m.emissiveIntensity > 0.6) return;

  const hsl = m.color.getHSL({});
  const metal = m.metalness >= 0.3;
  const woody = !metal && hsl.h > 0.03 && hsl.h < 0.13 && hsl.s > 0.25 && hsl.l > 0.15 && hsl.l < 0.6;

  if (metal) {
    m.bumpMap = itemTexture('brushed');
    m.bumpScale = 0.6;
    m.roughnessMap = itemTexture('brushed');
  } else if (woody) {
    m.map = itemTexture('wood');
    m.bumpMap = itemTexture('wood');
    m.bumpScale = 0.8;
  } else {
    m.map = itemTexture('tint');
    m.bumpMap = itemTexture('grit');
    m.bumpScale = 0.35;
    m.roughnessMap = itemTexture('grit');
  }
  m.needsUpdate = true;
}
