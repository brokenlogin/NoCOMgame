// The Black Hole Cantina, on Station NoCOM (walk east past the east landing pad).
//   Ozzy        bartender: drinks give 5-minute buffs (speed, damage, armor, loot luck)
//   Pix         cosmetics: ship paint, engine trails, hats
//   Lucky Lou   holo-dice: roll two dice against the house and bet credits
//   Jukebox     pick the music (E)
// Patrons wander around and chat. They use the same character models as players.

import * as THREE from 'three';
import { createCapsuleMesh, animateCharacter } from './capsule.js';
import { DRINKS } from './spaceData.js';
import { TRACKS } from './spaceMusic.js';
import { makeLabel } from './spaceRpg.js';
import { itemTexture } from './itemTextures.js';

export function setupCantina(api) {
  const { game, fx, hud, LOC } = api;
  const { scene, world } = game;
  const S = LOC.station;
  const C = { x: S.x + 52, y: S.y, z: S.z, w: 24, d: 20 };
  const x0 = C.x - C.w / 2, x1 = C.x + C.w / 2, z0 = C.z - C.d / 2, z1 = C.z + C.d / 2;
  const root = new THREE.Group();
  scene.add(root);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.7, metalness: 0.3, bumpMap: itemTexture('brushed'), bumpScale: 0.4 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.5, metalness: 0.4, map: itemTexture('carbon') });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a3a20, roughness: 0.6, map: itemTexture('wood') });
  const glow = (c, i = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });

  function box(x, top, z, w, h, d, mat, { walk = true, wall = false, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, top - h / 2, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    root.add(m);
    m.updateMatrixWorld();
    if (walk) world.colliders.push(m);
    if (wall) world.solidBoxes.push(new THREE.Box3().setFromObject(m));
    return m;
  }
  // Clear any of the station's floating asteroids out of the way
  for (let i = world.colliders.length - 1; i >= 0; i--) {
    const m = world.colliders[i];
    if (m.geometry?.type !== 'IcosahedronGeometry') continue;
    const p = m.getWorldPosition(new THREE.Vector3());
    if (p.x > x0 - 14 && p.x < x1 + 8 && p.z > z0 - 8 && p.z < z1 + 8 && p.y > C.y - 12 && p.y < C.y + 14) {
      m.visible = false;
      world.colliders.splice(i, 1);
    }
  }
  const H = 6;
  // Walkway from the east landing pad, floor, walls (door on the west), glass roof
  box(S.x + 36.5, S.y, S.z, 7, 1, 4, floorMat);
  box(C.x, C.y, C.z, C.w, 1, C.d, floorMat);
  box(C.x, C.y + H, z0, C.w, H, 0.6, wallMat, { walk: false, wall: true });
  box(C.x, C.y + H, z1, C.w, H, 0.6, wallMat, { walk: false, wall: true });
  box(x1, C.y + H, C.z, 0.6, H, C.d, wallMat, { walk: false, wall: true });
  box(x0, C.y + H, (z0 + C.z - 2) / 2, 0.6, H, C.z - 2 - z0, wallMat, { walk: false, wall: true });
  box(x0, C.y + H, (z1 + C.z + 2) / 2, 0.6, H, z1 - C.z - 2, wallMat, { walk: false, wall: true });
  box(x0, C.y + H, C.z, 0.6, H - 3, 4, wallMat, { walk: false });
  const roof = box(C.x, C.y + H + 0.3, C.z, C.w + 1, 0.3, C.d + 1, new THREE.MeshStandardMaterial({ color: 0x3a4a6a, transparent: true, opacity: 0.3, roughness: 0.1 }), { walk: false, shadow: false });
  roof.receiveShadow = false;
  // Neon trim along the walls
  for (const z of [z0 + 0.35, z1 - 0.35]) box(C.x, C.y + H - 0.4, z, C.w - 1, 0.12, 0.05, glow(0xff4ad0), { walk: false });
  box(x1 - 0.35, C.y + H - 0.4, C.z, 0.05, 0.12, C.d - 1, glow(0x4ad8ff), { walk: false });
  // The bar, shelves of glowing bottles, a little black hole over the bar
  box(x1 - 3.5, C.y + 1.1, C.z, 1.6, 1.1, 11, woodMat, { wall: true });
  box(x1 - 3.5, C.y + 1.15, C.z, 1.8, 0.08, 11.2, glow(0xffb03a, 0.6), { walk: false });
  for (let k = 0; k < 18; k++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 8), glow([0xff4ad0, 0x4ad8ff, 0x7aff6a, 0xffd23d][k % 4], 1.2));
    b.position.set(x1 - 0.6, C.y + 2.3 + Math.floor(k / 9) * 0.7, C.z - 4 + (k % 9));
    root.add(b);
  }
  const hole = new THREE.Group();
  hole.position.set(x1 - 3.5, C.y + 4.6, C.z);
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const disk = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 8, 40), glow(0xffa030, 2));
  disk.rotation.x = Math.PI / 2 + 0.3;
  hole.add(disk);
  root.add(hole);
  // Tables and stools
  for (const [tx, tz] of [[C.x - 4, C.z - 5], [C.x + 1, C.z + 5], [C.x - 6, C.z + 4]]) {
    box(tx, C.y + 1.05, tz, 1.6, 0.1, 1.6, woodMat);
    box(tx, C.y + 1, tz, 0.2, 1, 0.2, wallMat, { walk: false, wall: true });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      box(tx + Math.cos(a) * 1.3, C.y + 0.6, tz + Math.sin(a) * 1.3, 0.5, 0.6, 0.5, glow(0x6a4aff, 0.3), { walk: true });
    }
  }
  // Holo-dice table
  const DT = new THREE.Vector3(C.x + 3, C.y, C.z - 5);
  box(DT.x, C.y + 1.05, DT.z, 2.4, 0.1, 1.6, glow(0x2affd0, 0.8));
  box(DT.x, C.y + 1, DT.z, 0.3, 1, 0.3, wallMat, { walk: false, wall: true });
  const dice = [0, 1].map((k) => {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2affd0, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 }));
    d.position.set(DT.x - 0.4 + k * 0.8, C.y + 1.45, DT.z);
    root.add(d);
    return d;
  });
  // Jukebox
  const JB = new THREE.Vector3(x0 + 2, C.y, z0 + 1.6);
  box(JB.x, C.y + 1.8, JB.z, 1.2, 1.8, 0.8, wallMat, { wall: true });
  const jbFront = box(JB.x, C.y + 1.6, JB.z + 0.42, 1, 1.2, 0.05, glow(0xff4ad0, 1.2), { walk: false });
  // Sign outside
  const sign = makeLabel([{ text: '🍸 THE BLACK HOLE CANTINA', size: 56, color: '#ff8ae0', bold: true }, { text: 'Drinks · Holo-dice · Jukebox · Style', size: 32, color: '#ffe0f8' }], { scale: 0.025 });
  sign.position.set(x0 - 0.5, C.y + H + 0.6, C.z);
  root.add(sign);

  // ---------- Crew ----------
  api.addNpc({ id: 'ozzy', name: 'Ozzy', role: 'Bartender', sector: 'home', faction: 'command', color: 0xff8a3a, pos: new THREE.Vector3(x1 - 2, C.y, C.z - 1), face: -Math.PI / 2, services: ['bar'],
    lines: ['What\'ll it be, flyboy?', 'Nova Fizz is on special. It\'s always on special.', 'No fighting in my bar. Outside, in the Crucible, go nuts.'] });
  api.addNpc({ id: 'pix', name: 'Pix', role: 'Cosmetics', sector: 'home', faction: 'command', color: 0xff4ad0, pos: new THREE.Vector3(C.x + 6, C.y, z1 - 2), face: 0, services: ['cosmetics'],
    lines: ['Darling, that paint job is a crime.', 'Hats are the soul of the pilot. Everyone sees them.'] });
  api.addNpc({ id: 'lou', name: 'Lucky Lou', role: 'Holo-dice', sector: 'home', faction: 'command', color: 0x7aff6a, pos: new THREE.Vector3(DT.x, C.y, DT.z - 1.6), face: Math.PI, services: ['dice'],
    lines: ['Roll the bones, pilot. The house is very fair. Mostly.', 'Two dice, highest total wins. Easy money!'] });

  // ---------- Bar ----------
  api.services.bar = {
    label: '🍸 Order a drink',
    open(n, note = '') {
      const st = api.st;
      const opts = DRINKS.map((d) => {
        const left = st.buffs[d.id] ? Math.max(0, Math.ceil((st.buffs[d.id] - Date.now()) / 60000)) : 0;
        return [`${d.name}: ${d.cost} cr · ${d.desc}${left ? ` (active, ${left} min left)` : ''}`, () => {
          if (st.credits < d.cost) return;
          st.credits -= d.cost;
          st.buffs[d.id] = Date.now() + 5 * 60000;
          fx.sfx('coin');
          hud.toast(`🍸 ${d.name}! ${d.desc}`, '#ff8ae0');
          api.applyStats();
          api.save();
          api.services.bar.open(n, `"${d.name}, coming right up."`);
        }, st.credits < d.cost];
      });
      api.openDialog(`${n.name} · Bar`, `${note ? `${note}\n` : ''}Drinks last 5 minutes and stack with each other. You have ${api.st.credits} credits.`, [...opts, ['Back', () => api.talk(n)]]);
    },
  };

  // ---------- Holo-dice ----------
  let rolling = false;
  const pips = (n) => ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][n - 1];
  api.services.dice = {
    label: '🎲 Play holo-dice',
    open(n, note = '') {
      const st = api.st;
      const bets = [50, 100, 250, 500, 1000].map((b) => [`Bet ${b} credits`, () => roll(n, b), st.credits < b || rolling]);
      api.openDialog(`${n.name} · Holo-dice`, `${note ? `${note}\n\n` : ''}You and the house each roll two dice. Higher total wins double your bet; a tie gives it back.\nYou have ${st.credits} credits · won so far: ${st.stats.diceWon}`, [...bets, ['Back', () => api.talk(n)]]);
    },
  };
  function roll(n, bet) {
    const st = api.st;
    if (rolling || st.credits < bet) return;
    rolling = true;
    st.credits -= bet;
    const you = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const house = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    fx.sfx('dice');
    api.openDialog(`${n.name} · Holo-dice`, 'Rolling…', []);
    let t = 0;
    fx.addEffect((dt) => {
      t += dt;
      for (const d of dice) {
        d.rotation.x += dt * 14;
        d.rotation.y += dt * 11;
        d.position.y = C.y + 1.45 + Math.abs(Math.sin(t * 9)) * 0.4 * Math.max(0, 1 - t);
      }
      if (t < 1.3) return true;
      rolling = false;
      const a = you[0] + you[1], b = house[0] + house[1];
      let msg;
      if (a > b) {
        st.credits += bet * 2;
        st.stats.diceWon += bet;
        if (st.stats.diceWon >= 1000) api.achieve('gambler');
        fx.sfx('coin');
        msg = `You win ${bet * 2}! 🎉`;
      } else if (a === b) {
        st.credits += bet;
        msg = 'A tie. You get your bet back.';
      } else {
        msg = 'The house wins. Better luck next roll!';
      }
      api.save();
      api.services.dice.open(n, `You: ${pips(you[0])} ${pips(you[1])} = ${a}\nHouse: ${pips(house[0])} ${pips(house[1])} = ${b}\n${msg}`);
      return false;
    });
  }

  // ---------- Jukebox ----------
  let pick = null; // track id, or 'off'
  api.actions.push((p) => {
    if (api.ship.piloting || JB.distanceTo(p) > 2.6) return null;
    return {
      text: 'E: Jukebox',
      fn: () => api.openDialog('📻 Jukebox', `Now playing: ${pick === 'off' ? 'nothing' : TRACKS[pick || 'cantina'].name}. Music follows you around space; M mutes it anywhere.`, [
        ...Object.entries(TRACKS).map(([id, t]) => [`♪ ${t.name}`, () => {
          pick = id;
          api.closeDialog();
          hud.toast(`📻 ${t.name}`, '#ff8ae0');
        }]),
        ['■ Silence, please', () => {
          pick = 'off';
          api.closeDialog();
        }],
        ['Back', api.closeDialog],
      ]),
    };
  });

  // ---------- Patrons ----------
  const LINES = ['Did you see the Leviathan last night?', 'I lost a whole hauler in the debris field.', 'The Crucible is where reputations go to die.', 'Ozzy waters down the Nova Fizz. Don\'t tell him I said that.', 'My cousin swears the Wyrm talks.', 'Who keeps playing Rift Dread on the jukebox?', 'I\'m not a pirate. I\'m a freelance redistributor.', 'Never trust a scav with a smile.'];
  const spots = [];
  for (let i = 0; i < 12; i++) spots.push(new THREE.Vector3(x0 + 2 + Math.random() * (C.w - 8), C.y, z0 + 2 + Math.random() * (C.d - 4)));
  const patrons = ['Zed', 'Marlo', 'Kit', 'Brannoc'].map((name, i) => {
    const g = createCapsuleMesh([0x8a5aff, 0x5ab8ff, 0xffb03a, 0x6aff9a][i], `Patron ${name}`, { tag: false });
    g.position.copy(spots[i]);
    root.add(g);
    return { g, name, goal: spots[(i + 3) % spots.length].clone(), wait: Math.random() * 3, bubble: null, talkT: 5 + Math.random() * 15 };
  });

  api.frame.push((dt, ctx) => {
    const on = ctx.inSpace && ctx.sector === 'home';
    root.visible = on;
    if (!on) return;
    hole.rotation.y += dt * 0.8;
    disk.rotation.z += dt * 2;
    jbFront.material.color.setHSL((performance.now() / 4000) % 1, 0.8, 0.55);
    jbFront.material.emissive.copy(jbFront.material.color);
    if (!rolling) for (const d of dice) d.rotation.y += dt * 0.6;
    const near = ctx.player.position.distanceTo(new THREE.Vector3(C.x, C.y, C.z)) < 60;
    for (const p of patrons) {
      let speed = 0;
      if (p.wait > 0) p.wait -= dt;
      else {
        const to = p.goal.clone().sub(p.g.position).setY(0);
        if (to.length() < 0.2) {
          p.wait = 2 + Math.random() * 5;
          p.goal = spots[Math.floor(Math.random() * spots.length)].clone();
        } else {
          to.setLength(Math.min(to.length(), 1.4 * dt));
          p.g.position.add(to);
          p.g.rotation.y = Math.atan2(-to.x, -to.z);
          speed = 1.4;
        }
      }
      if (near) animateCharacter(p.g, speed, true, dt, 0);
      p.talkT -= dt;
      if (p.talkT <= 0 && near) {
        p.talkT = 12 + Math.random() * 20;
        if (p.bubble) p.g.remove(p.bubble);
        p.bubble = makeLabel([{ text: LINES[Math.floor(Math.random() * LINES.length)], size: 30, color: '#ffffff' }], { scale: 0.0045 });
        p.bubble.position.y = 2.5;
        p.g.add(p.bubble);
        setTimeout(() => {
          if (p.bubble) p.g.remove(p.bubble);
          p.bubble = null;
        }, 4500);
      }
    }
  });

  const inside = (p) => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1 && p.y > C.y - 1 && p.y < C.y + H;
  return { inside, get jukebox() { return pick; } };
}
