// Progression for the space RPG: the skill tree (J → Pilot), achievements and titles
// (J → Trophies), and cosmetics: ship paint, engine trails and hats (J → Style, bought at the
// cosmetics shop). Other players see your hat on your helmet and your title under your name
// (sent as extraState.hat / extraState.ttl).

import * as THREE from 'three';
import { SKILLS, ACHIEVEMENTS, PAINTS, TRAILS, HATS, MAX_LEVEL } from './spaceData.js';

export function setupProgress(api) {
  const { game, fx, hud } = api;
  const st = () => api.st;
  const ui = api.journal.ui;

  // ---------- Skills ----------
  const spent = () => Object.values(st().skills).reduce((a, b) => a + b, 0);
  const points = () => api.level() - 1 - spent();
  api.journal.addTab('pilot', '⭐ Pilot', (el) => {
    const s = st();
    const lvl = api.level();
    let html = ui.section(`Level ${lvl}${lvl >= MAX_LEVEL ? ' (max)' : ''} · ${points()} skill point${points() === 1 ? '' : 's'} to spend`);
    html += ui.h('div', 'opacity:0.7;margin-bottom:8px', 'You get one point per level, up to level 30. Every skill has 3 ranks.');
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">';
    for (const branch of ['Pilot', 'Gunner', 'Engineer', 'Explorer']) {
      html += `<div><div style="font:800 13px system-ui;color:#ffd23d;margin-bottom:6px">${branch}</div>`;
      for (const sk of SKILLS.filter((x) => x.branch === branch)) {
        const r = s.skills[sk.id] || 0;
        html += ui.card(`<b>${sk.name}</b> <span style="color:#ffd23d">${'★'.repeat(r)}${'☆'.repeat(sk.max - r)}</span>
          <div style="opacity:0.75;font-size:12px">${sk.desc} per rank</div>${ui.btn('learn', sk.id, '+ Learn', points() <= 0 || r >= sk.max)}`);
      }
      html += '</div>';
    }
    html += '</div>';
    const cost = 300 * lvl;
    html += ui.section('Respec');
    html += `${ui.btn('respec', '', `Reset all skills (${cost} cr)`, spent() === 0 || s.credits < cost)}`;
    el.innerHTML = html;
  }, (act, v) => {
    const s = st();
    if (act === 'learn' && points() > 0) {
      const sk = SKILLS.find((x) => x.id === v);
      if ((s.skills[v] || 0) < sk.max) {
        s.skills[v] = (s.skills[v] || 0) + 1;
        fx.sfx('levelUp');
      }
    }
    if (act === 'respec') {
      const cost = 300 * api.level();
      if (s.credits >= cost) {
        s.credits -= cost;
        s.skills = {};
        hud.toast('Skills reset. Spend your points again!', '#ffd23d');
      }
    }
    api.applyStats();
    api.save();
  });

  // ---------- Trophies and titles ----------
  api.journal.addTab('trophies', '🏆 Trophies', (el) => {
    const s = st();
    let html = ui.section(`Achievements · ${s.achievements.length} / ${ACHIEVEMENTS.length}`);
    html += ui.h('div', 'opacity:0.7;margin-bottom:8px', `Each one unlocks a title other players see under your name. Current title: <b>${ui.esc(s.title || 'none')}</b> ${s.title ? ui.btn('title', '', 'Clear') : ''}`);
    for (const a of ACHIEVEMENTS) {
      const have = s.achievements.includes(a.id);
      html += ui.card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div><b style="color:${have ? '#ffd23d' : '#8a95a5'}">${have ? '🏆' : '🔒'} ${a.name}</b> <span style="opacity:0.7">· ${a.desc}</span><div style="font-size:12px;opacity:0.7">Title: “${a.title}”</div></div>
        <div>${have ? ui.btn('title', a.title, s.title === a.title ? 'Wearing' : 'Wear title', s.title === a.title) : ''}</div></div>`, have ? '#ffd23d55' : undefined);
    }
    el.innerHTML = html;
  }, (act, v) => {
    if (act === 'title') {
      st().title = v || '';
      api.applyStats();
      api.save();
    }
  });

  // ---------- Cosmetics ----------
  const LISTS = { paints: PAINTS, trails: TRAILS, hats: HATS };
  const SLOT = { paints: 'paint', trails: 'trail', hats: 'hat' };
  const owns = (kind, item) => item.cost === 0 || st().owned[kind].includes(item.id) || (item.achievement && st().achievements.includes(item.achievement));
  function wear(kind, id) {
    st().cosmetics[SLOT[kind]] = id;
    api.applyStats();
    api.save();
  }
  api.services.cosmetics = {
    label: '🎨 Cosmetics shop',
    open(n, kind = 'paints') {
      const s = st();
      const opts = [['🎨 Ship paints', () => api.services.cosmetics.open(n, 'paints'), kind === 'paints'], ['✨ Engine trails', () => api.services.cosmetics.open(n, 'trails'), kind === 'trails'], ['🎩 Hats', () => api.services.cosmetics.open(n, 'hats'), kind === 'hats']];
      for (const item of LISTS[kind]) {
        const wearing = s.cosmetics[SLOT[kind]] === item.id;
        if (owns(kind, item)) {
          opts.push([`${wearing ? '✔ ' : ''}${item.name}${wearing ? ' (wearing)' : ': wear'}`, () => {
            wear(kind, item.id);
            api.services.cosmetics.open(n, kind);
          }, wearing]);
        } else if (item.achievement) {
          const a = ACHIEVEMENTS.find((x) => x.id === item.achievement);
          opts.push([`🔒 ${item.name} (achievement: ${a?.name})`, () => {}, true]);
        } else {
          opts.push([`${item.name}: ${item.cost} cr`, () => {
            if (s.credits < item.cost) return;
            s.credits -= item.cost;
            s.owned[kind].push(item.id);
            fx.sfx('coin');
            wear(kind, item.id);
            api.services.cosmetics.open(n, kind);
          }, s.credits < item.cost]);
        }
      }
      opts.push(['Back', () => api.talk(n)]);
      api.openDialog(`${n.name} · Cosmetics`, `Look good, fly good. You have ${s.credits} credits. Hats show on your helmet for everyone; paint and trails show on your ship.`, opts);
    },
  };
  api.npc('juno')?.services.push('cosmetics');
  api.journal.addTab('style', '🎨 Style', (el) => {
    let html = '';
    for (const kind of ['paints', 'trails', 'hats']) {
      html += ui.section({ paints: 'Ship paint', trails: 'Engine trail', hats: 'Hat' }[kind]);
      for (const item of LISTS[kind]) {
        if (!owns(kind, item)) continue;
        html += ui.btn(`wear:${kind}`, item.id, `${st().cosmetics[SLOT[kind]] === item.id ? '✔ ' : ''}${item.name}`, st().cosmetics[SLOT[kind]] === item.id);
      }
    }
    html += ui.h('div', 'opacity:0.6;margin-top:10px', 'Buy more at a cosmetics shop. Some only come from achievements.');
    el.innerHTML = html;
  }, (act, v) => {
    const [a, kind] = act.split(':');
    if (a === 'wear') wear(kind, v);
  });

  // ---------- Hats and titles on other players ----------
  const shown = new Map(); // player id -> { hat, ttl, hatObj, ttlObj }
  game.addSystem((dt) => {
    for (const [id, s] of shown) {
      if (!game.remotes.players.has(id)) shown.delete(id);
    }
    for (const rp of game.remotes.players.values()) {
      const rig = rp.mesh.userData.rig;
      if (!rig) continue;
      let s = shown.get(rp.id);
      if (!s) shown.set(rp.id, (s = {}));
      const hat = typeof rp.state?.hat === 'string' ? rp.state.hat : null;
      if (hat !== s.hat) {
        s.hatObj?.parent?.remove(s.hatObj);
        s.hatObj = hat ? makeHat(hat) : null;
        if (s.hatObj) rig.head.add(s.hatObj);
        s.hat = hat;
      }
      if (s.hatObj?.userData.spin) s.hatObj.userData.spin.rotation.y += dt * 12;
      if (s.hatObj?.userData.float) s.hatObj.userData.float.position.y = 0.2 + Math.sin(performance.now() / 400) * 0.03;
      const ttl = typeof rp.state?.ttl === 'string' ? rp.state.ttl.slice(0, 24) : null;
      if (ttl !== s.ttl) {
        if (s.ttlObj) rp.mesh.remove(s.ttlObj);
        s.ttlObj = ttl ? titleSprite(ttl) : null;
        if (s.ttlObj) {
          s.ttlObj.position.y = game.CONFIG.playerHeight + 1.1; // above the name tag and health bar
          rp.mesh.add(s.ttlObj);
        }
        s.ttl = ttl;
      }
    }
  });

  return { points, makeHat };
}

function titleSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 40;
  const x = c.getContext('2d');
  x.font = 'italic 700 24px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.lineWidth = 4;
  x.strokeStyle = 'rgba(0,0,0,0.7)';
  x.strokeText(`« ${text} »`, 128, 20);
  x.fillStyle = '#ffd23d';
  x.fillText(`« ${text} »`, 128, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(1.6, 0.25, 1);
  return s;
}

// Hats sit on top of the helmet (the head group's origin is the neck; the helmet top is ~0.43 up)
export function makeHat(id) {
  const g = new THREE.Group();
  const top = new THREE.Group();
  top.position.y = 0.42;
  g.add(top);
  const m = (geo, color, x = 0, y = 0, z = 0, extra = {}) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    top.add(mesh);
    return mesh;
  };
  if (id === 'party') {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    ['#ff4a8a', '#ffd23d', '#4ad8ff', '#7aff6a'].forEach((col, i) => {
      x.fillStyle = col;
      x.fillRect(0, i * 16, 64, 16);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m(new THREE.ConeGeometry(0.12, 0.32, 16), 0xffffff, 0, 0.14, 0, { map: tex }).rotation.z = 0.15;
    m(new THREE.SphereGeometry(0.045, 10, 8), 0xffffff, -0.03, 0.31, 0);
  } else if (id === 'chef') {
    m(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 20), 0xffffff, 0, 0.06, 0);
    for (let k = 0; k < 5; k++) m(new THREE.SphereGeometry(0.1, 12, 8), 0xffffff, Math.cos(k * 1.25) * 0.08, 0.2, Math.sin(k * 1.25) * 0.08);
  } else if (id === 'captain') {
    m(new THREE.CylinderGeometry(0.2, 0.19, 0.1, 24), 0x1a2a5a, 0, 0.03, 0);
    m(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), 0xffffff, 0, 0.1, 0);
    const brim = m(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20, 1, false, Math.PI * 0.75, Math.PI * 1.5), 0x111111, 0, -0.01, -0.1);
    brim.scale.z = 0.8;
    m(new THREE.SphereGeometry(0.035, 10, 8), 0xffc23a, 0, 0.06, -0.19, { metalness: 0.8, emissive: 0x6a4a00 });
  } else if (id === 'propeller') {
    const cap = m(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xff3a4a, 0, -0.04, 0);
    cap.scale.y = 0.7;
    m(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), 0x888888, 0, 0.1, 0);
    const spin = new THREE.Group();
    spin.position.y = 0.16;
    top.add(spin);
    for (const [col, r] of [[0x4ad8ff, 0], [0xffd23d, Math.PI / 2]]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 0.05), new THREE.MeshStandardMaterial({ color: col }));
      blade.rotation.y = r;
      spin.add(blade);
    }
    g.userData.spin = spin;
  } else if (id === 'horns') {
    for (const s of [-1, 1]) {
      const h = m(new THREE.ConeGeometry(0.05, 0.2, 10), 0xd81a1a, s * 0.13, -0.02, -0.04, { emissive: 0x400000 });
      h.rotation.z = -s * 0.5;
    }
  } else if (id === 'tophat') {
    m(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 20), 0x111111, 0, 0.13, 0);
    m(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 24), 0x111111, 0, -0.01, 0);
    m(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 20), 0xb01a2a, 0, 0.03, 0);
  } else if (id === 'crown') {
    m(new THREE.CylinderGeometry(0.17, 0.16, 0.09, 24, 1, true), 0xffc23a, 0, 0.02, 0, { metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      m(new THREE.ConeGeometry(0.035, 0.1, 6), 0xffc23a, Math.cos(a) * 0.16, 0.11, Math.sin(a) * 0.16, { metalness: 0.9, roughness: 0.25 });
      m(new THREE.SphereGeometry(0.02, 8, 6), [0xff2a4a, 0x2a8aff, 0x2aff7a][k % 3], Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17, { emissive: [0x600010, 0x102a60, 0x106030][k % 3] });
    }
  } else if (id === 'halo') {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 8, 32), new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffd23d, emissiveIntensity: 2 }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.2;
    top.add(halo);
    g.userData.float = halo;
  }
  return g;
}
