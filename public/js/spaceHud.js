// Space RPG HUD pieces: radar, target brackets, damage direction, hit markers, boss bar,
// big sector banners, toasts and a scan progress bar. Everything is plain DOM over the game.
//
//   hud.radar(blips, { pos, yaw, range })   blips: [{ p: Vector3, kind, size? }]
//   hud.target(info | null)                 { p: Vector3, name, hp, shield, locked, color }
//   hud.damageFrom(worldPos)                red wedge pointing at whoever hit you
//   hud.hit(crit) · hud.boss(name, frac, sub) · hud.boss(null) · hud.banner(title, sub, color)
//   hud.toast(text, color) · hud.scan(frac, label) · hud.show(bool)

import * as THREE from 'three';

const BLIP = {
  enemy: '#ff4a3a', boss: '#ff2a6a', ore: '#5fe8ff', loot: '#ffd23d', objective: '#ffe14d',
  player: '#6bff8a', station: '#ffffff', gate: '#c58bff', friendly: '#5fb8ff', neutral: '#d8b45a',
};

export function createSpaceHud(game) {
  const { camera } = game;
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 4, display: 'none' });
  document.getElementById('hud').appendChild(root);
  const el = (css, html = '') => {
    const d = document.createElement('div');
    d.style.cssText = css;
    d.innerHTML = html;
    root.appendChild(d);
    return d;
  };

  // ---------- Radar ----------
  const R = 180;
  const radarWrap = el(`position:absolute;right:12px;bottom:12px;width:${R}px;height:${R}px;border-radius:50%;
    background:radial-gradient(circle,rgba(10,30,50,0.75),rgba(4,10,20,0.85));border:1px solid rgba(95,212,255,0.45);
    box-shadow:0 0 20px rgba(0,0,0,0.5);overflow:hidden`);
  const radarCanvas = document.createElement('canvas');
  radarCanvas.width = radarCanvas.height = R * 2;
  radarCanvas.style.cssText = `width:${R}px;height:${R}px`;
  radarWrap.appendChild(radarCanvas);
  const rc = radarCanvas.getContext('2d');
  const radarLabel = el(`position:absolute;right:12px;bottom:${R + 16}px;width:${R}px;text-align:center;
    font:600 11px system-ui,sans-serif;color:#9fd8ff;text-shadow:0 1px 3px #000`);
  let sweep = 0;
  const _rel = new THREE.Vector3();
  function radar(blips, { pos, yaw, range = 600, label = '' }) {
    sweep += 0.03;
    const c = rc, S = R * 2, mid = S / 2;
    c.clearRect(0, 0, S, S);
    // Range rings and sweep
    c.strokeStyle = 'rgba(95,212,255,0.18)';
    c.lineWidth = 2;
    for (const f of [0.33, 0.66, 0.98]) {
      c.beginPath();
      c.arc(mid, mid, mid * f, 0, Math.PI * 2);
      c.stroke();
    }
    const g = c.createConicGradient ? c.createConicGradient(sweep, mid, mid) : null;
    if (g) {
      g.addColorStop(0, 'rgba(95,212,255,0.25)');
      g.addColorStop(0.15, 'rgba(95,212,255,0)');
      g.addColorStop(1, 'rgba(95,212,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(mid, mid, mid, 0, Math.PI * 2);
      c.fill();
    }
    // You, pointing up
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(mid, mid - 10);
    c.lineTo(mid - 7, mid + 8);
    c.lineTo(mid + 7, mid + 8);
    c.closePath();
    c.fill();
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const b of blips) {
      _rel.copy(b.p).sub(pos);
      // Rotate into ship space: forward (-Z in world at yaw) is up on the radar
      const x = _rel.x * cos - _rel.z * sin;
      const z = _rel.x * sin + _rel.z * cos;
      let d = Math.hypot(x, z);
      let px = x, pz = z;
      const edge = d > range;
      if (edge) {
        if (!b.sticky) continue;
        px = (x / d) * range;
        pz = (z / d) * range;
        d = range;
      }
      const sx = mid + (px / range) * mid * 0.96;
      const sy = mid + (pz / range) * mid * 0.96;
      const col = BLIP[b.kind] || '#ffffff';
      c.fillStyle = col;
      c.globalAlpha = edge ? 0.6 : 1;
      const s = (b.size || 1) * 5;
      const above = _rel.y > 25 ? 1 : _rel.y < -25 ? -1 : 0;
      if (b.kind === 'station' || b.kind === 'gate') {
        c.fillRect(sx - s, sy - s, s * 2, s * 2);
      } else if (b.kind === 'objective') {
        c.beginPath();
        c.moveTo(sx, sy - s * 1.4);
        c.lineTo(sx + s * 1.1, sy);
        c.lineTo(sx, sy + s * 1.4);
        c.lineTo(sx - s * 1.1, sy);
        c.closePath();
        c.fill();
      } else {
        c.beginPath();
        c.arc(sx, sy, s, 0, Math.PI * 2);
        c.fill();
      }
      // Little tick: above or below you
      if (above && !edge) {
        c.fillRect(sx - 1, above > 0 ? sy - s - 7 : sy + s, 2, 7);
      }
      c.globalAlpha = 1;
    }
    radarLabel.textContent = label || `${Math.round(range)} m`;
  }

  // ---------- Target brackets ----------
  const tgt = el('position:absolute;display:none;transform:translate(-50%,-50%)');
  tgt.innerHTML = `<div class="tb" style="position:absolute;inset:0;
      background:
        linear-gradient(currentColor,currentColor) 0 0/12px 2px no-repeat,
        linear-gradient(currentColor,currentColor) 0 0/2px 12px no-repeat,
        linear-gradient(currentColor,currentColor) 100% 0/12px 2px no-repeat,
        linear-gradient(currentColor,currentColor) 100% 0/2px 12px no-repeat,
        linear-gradient(currentColor,currentColor) 0 100%/12px 2px no-repeat,
        linear-gradient(currentColor,currentColor) 0 100%/2px 12px no-repeat,
        linear-gradient(currentColor,currentColor) 100% 100%/12px 2px no-repeat,
        linear-gradient(currentColor,currentColor) 100% 100%/2px 12px no-repeat"></div>
    <div class="tl" style="position:absolute;inset:-10px;border:2px dashed currentColor;border-radius:50%;display:none;animation:spLockSpin 1.2s linear infinite"></div>
    <div class="tn" style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:6px;white-space:nowrap;
      font:700 12px system-ui,sans-serif;text-shadow:0 1px 3px #000"></div>
    <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:22px;width:70px;height:4px;background:rgba(0,0,0,0.5)">
      <div class="ts" style="height:100%;width:0;background:#5fd4ff"></div></div>
    <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:27px;width:70px;height:4px;background:rgba(0,0,0,0.5)">
      <div class="th" style="height:100%;width:100%;background:#ff5a4a"></div></div>`;
  const style = document.createElement('style');
  style.textContent = '@keyframes spLockSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
  const tLock = tgt.querySelector('.tl'), tName = tgt.querySelector('.tn'), tHp = tgt.querySelector('.th'), tSh = tgt.querySelector('.ts');
  const _p = new THREE.Vector3();
  function target(info) {
    if (!info) {
      tgt.style.display = 'none';
      return;
    }
    _p.copy(info.p).project(camera);
    if (_p.z > 1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) {
      tgt.style.display = 'none';
      return;
    }
    const dist = camera.position.distanceTo(info.p);
    const size = Math.max(28, Math.min(160, (info.radius || 2) * 900 / Math.max(1, dist)));
    tgt.style.display = 'block';
    tgt.style.left = `${(_p.x * 0.5 + 0.5) * window.innerWidth}px`;
    tgt.style.top = `${(-_p.y * 0.5 + 0.5) * window.innerHeight}px`;
    tgt.style.width = tgt.style.height = `${size}px`;
    tgt.style.color = info.locked ? '#ff4a3a' : info.color || '#ffd23d';
    tLock.style.display = info.locked ? 'block' : 'none';
    tName.textContent = `${info.name || 'Target'} · ${Math.round(dist)}m${info.locked ? ' · LOCKED' : ''}`;
    tHp.style.width = `${Math.max(0, Math.min(1, info.hp ?? 1)) * 100}%`;
    tSh.parentElement.style.display = info.shield != null ? 'block' : 'none';
    tSh.style.width = `${Math.max(0, Math.min(1, info.shield ?? 0)) * 100}%`;
  }

  // ---------- Damage direction ----------
  function damageFrom(worldPos) {
    if (!worldPos) return;
    _p.copy(worldPos).applyMatrix4(camera.matrixWorldInverse); // camera space: -Z forward, +Y up
    let x = _p.x, y = _p.y;
    if (_p.z > 0 && Math.hypot(x, y) < _p.z * 0.3) {
      x = 0; // straight behind you: point down
      y = -1;
    }
    const angle = Math.atan2(x, y); // 0 = up on screen, clockwise
    const w = el(`position:absolute;left:50%;top:50%;width:0;height:0;transition:opacity 0.8s;opacity:1`);
    w.innerHTML = `<div style="position:absolute;left:-90px;top:-230px;width:180px;height:60px;
      background:radial-gradient(ellipse at 50% 100%,rgba(255,40,30,0.85),rgba(255,40,30,0) 70%);
      transform-origin:90px 230px;transform:rotate(${angle}rad)"></div>`;
    requestAnimationFrame(() => (w.style.opacity = '0'));
    setTimeout(() => w.remove(), 900);
  }

  // ---------- Hit marker ----------
  const hm = el('position:absolute;left:50%;top:50%;width:26px;height:26px;transform:translate(-50%,-50%) rotate(45deg);opacity:0');
  hm.innerHTML = `<div style="position:absolute;left:12px;top:0;width:2px;height:8px;background:currentColor"></div>
    <div style="position:absolute;left:12px;bottom:0;width:2px;height:8px;background:currentColor"></div>
    <div style="position:absolute;top:12px;left:0;height:2px;width:8px;background:currentColor"></div>
    <div style="position:absolute;top:12px;right:0;height:2px;width:8px;background:currentColor"></div>`;
  let hmT = 0;
  function hit(crit) {
    hmT = crit ? 0.3 : 0.15;
    hm.style.color = crit ? '#ffd23d' : '#ffffff';
    hm.style.transform = `translate(-50%,-50%) rotate(45deg) scale(${crit ? 1.5 : 1})`;
  }

  // ---------- Boss bar ----------
  const bossEl = el(`position:absolute;top:54px;left:50%;transform:translateX(-50%);width:min(520px,70vw);display:none;text-align:center;
    font:800 14px system-ui,sans-serif;color:#ffd0d0;text-shadow:0 1px 4px #000;letter-spacing:1px`,
  `<div class="bn"></div><div style="height:12px;margin-top:4px;background:rgba(0,0,0,0.6);border:1px solid rgba(255,90,90,0.6);border-radius:6px;overflow:hidden">
    <div class="bf" style="height:100%;width:100%;background:linear-gradient(90deg,#ff2a4a,#ff8a3a)"></div></div>
    <div class="bs" style="font:600 11px system-ui,sans-serif;margin-top:3px;color:#ffb0a0"></div>`);
  const bName = bossEl.querySelector('.bn'), bFill = bossEl.querySelector('.bf'), bSub = bossEl.querySelector('.bs');
  function boss(name, frac, sub = '') {
    if (!name) {
      bossEl.style.display = 'none';
      return;
    }
    bossEl.style.display = 'block';
    bName.textContent = name;
    bFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    bSub.textContent = sub;
  }

  // ---------- Banner + toasts (these show even outside space) ----------
  const banners = document.createElement('div');
  Object.assign(banners.style, { position: 'fixed', left: '0', right: '0', top: '22%', textAlign: 'center', pointerEvents: 'none', zIndex: 6 });
  document.getElementById('hud').appendChild(banners);
  function banner(title, sub = '', color = '#bfe8ff') {
    const b = document.createElement('div');
    b.style.cssText = `transition:opacity 0.8s, transform 0.8s;opacity:0;transform:scale(0.9)`;
    b.innerHTML = `<div style="font:900 44px system-ui,sans-serif;letter-spacing:3px;color:${color};text-shadow:0 0 24px ${color}88,0 2px 6px #000"></div>
      <div style="font:600 16px system-ui,sans-serif;color:#e6f2ff;text-shadow:0 1px 4px #000;margin-top:4px"></div>`;
    b.children[0].textContent = title;
    b.children[1].textContent = sub;
    banners.replaceChildren(b);
    requestAnimationFrame(() => {
      b.style.opacity = '1';
      b.style.transform = 'scale(1)';
    });
    setTimeout(() => (b.style.opacity = '0'), 3200);
    setTimeout(() => b.remove(), 4200);
  }
  const toasts = document.createElement('div');
  Object.assign(toasts.style, { position: 'fixed', left: '50%', top: '96px', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', pointerEvents: 'none', zIndex: 6 });
  document.getElementById('hud').appendChild(toasts);
  function toast(text, color = '#ffd23d') {
    const t = document.createElement('div');
    t.style.cssText = `padding:6px 14px;border-radius:8px;background:rgba(8,14,26,0.88);border:1px solid ${color}88;color:${color};
      font:700 14px system-ui,sans-serif;transition:opacity 0.6s;box-shadow:0 6px 20px rgba(0,0,0,0.4)`;
    t.textContent = text;
    toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => (t.style.opacity = '0'), 2600);
    setTimeout(() => t.remove(), 3300);
  }

  // ---------- Scan bar ----------
  const scanEl = el(`position:absolute;left:50%;top:calc(50% + 34px);transform:translateX(-50%);width:160px;display:none;text-align:center;
    font:700 11px system-ui,sans-serif;color:#7affc8;text-shadow:0 1px 3px #000`,
  `<div class="sl"></div><div style="height:5px;margin-top:3px;background:rgba(0,0,0,0.6);border-radius:3px;overflow:hidden">
    <div class="sf" style="height:100%;width:0;background:#7affc8"></div></div>`);
  const sLabel = scanEl.querySelector('.sl'), sFill = scanEl.querySelector('.sf');
  function scan(frac, label = 'Scanning') {
    if (frac == null) {
      scanEl.style.display = 'none';
      return;
    }
    scanEl.style.display = 'block';
    sLabel.textContent = label;
    sFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  game.addSystem((dt) => {
    hmT = Math.max(0, hmT - dt);
    hm.style.opacity = hmT > 0 ? '1' : '0';
  });

  return {
    radar, target, damageFrom, hit, boss, banner, toast, scan,
    show(on) {
      root.style.display = on ? 'block' : 'none';
    },
  };
}
