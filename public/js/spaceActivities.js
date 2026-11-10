// Things to do in the space RPG besides fighting (used by quests and on their own):
//
//   Time trials   ring courses in four sectors. Fly through the green start ring to begin.
//                 Bronze/silver/gold medals pay out once each; gold in all four = Speed Demon.
//   Scanning      hold your crosshair on an anomaly (📡 on the radar) while flying to scan it
//   Codex         data beacons (fly close) and data pads (walk up, E) with the history of the Reach
//   Escorts       api.startEscort(...) flies a freighter along a path while enemies go after it
//   Smuggling     Command patrol scanners sweep near some gates. Carry contraband through a beam
//                 and it's confiscated (and you're fined).
//   Quest crates  any pickup step with crate: true gets a glowing crate (or pod) at its spot

import * as THREE from 'three';
import { SECTORS } from './spaceData.js';
import { buildShip, setThrust } from './spaceShip.js';
import { makeLabel } from './spaceRpg.js';
import { rng } from './spaceQuests.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- Codex: the lore of the Reach ----------
// foot: true = a data pad you walk up to (E); otherwise a beacon you fly close to
export const CODEX = [
  { id: 'c1', sector: 'home', foot: true, at: [12, 30, -390], title: 'Station NoCOM', text: 'Built as a relay post, NoCOM got its name from the day its comms array failed for a year. The crew stayed anyway. They still do.' },
  { id: 'c2', sector: 'home', at: [-200, 75, -800], title: 'The Belt', text: 'The Belt is what remains of Kepler-b, a planet broken by something nobody likes to name. Its crystals still hum when the sun hits them.' },
  { id: 'c3', sector: 'home', foot: true, at: [356, 30, -1296], title: 'Outpost Kepler', text: 'Vega built Kepler with salvaged hull plates and stubbornness. The beacon on the antenna has never once been switched off.' },
  { id: 'c4', sector: 'home', foot: true, at: [-418, 25, -1550], title: 'Last log of the Erebus', text: '"Day 41. The engines are dead and the cold is coming in. The core holds everything. If you find this, finish what we started."' },
  { id: 'c5', sector: 'home', at: [180, 105, -1640], title: 'The Mothership', text: 'Red Talon built the Mothership from three stolen freighters welded together. Pirates called her "Mother" and meant it.' },
  { id: 'c6', sector: 'home', at: [520, 80, -1750], title: 'The Jump Gates', text: 'Nobody alive built the gates. They were simply there when the first ships arrived, waiting, warm to the touch.' },
  { id: 'c7', sector: 'nebula', foot: true, at: [-186, 30, -5314], title: 'Haven', text: 'Haven flies no flag. Mira Sol founded it for anyone who wanted out of the Talon, out of Command, out of everything.' },
  { id: 'c8', sector: 'nebula', at: [-400, 80, -5400], title: 'Plasma pockets', text: 'The Drift breathes. Every few hours the clouds pulse and pockets of raw plasma condense, glowing like trapped lightning.' },
  { id: 'c9', sector: 'nebula', at: [300, 30, -5300], title: 'Ion storms', text: 'Storms in the Drift strip shields in seconds. Old pilots say you can hear voices in the static. Old pilots say a lot of things.' },
  { id: 'c10', sector: 'nebula', at: [-100, 110, -6100], title: 'Red Talon', text: 'The Talon began as a miners\' union that got tired of asking nicely. Now they just take. Their claw is painted in blood-red on every hull.' },
  { id: 'c11', sector: 'nebula', foot: true, at: [262, 50, -5921], title: 'Captain Rook\'s orders', text: '"Sell everything to the Scrapyard buyer. Coordinates in the core of the King. Tell no one about the Rift. Not even me, if you can help it."' },
  { id: 'c12', sector: 'nebula', at: [100, 60, -5650], title: 'Cloakers', text: 'Talon cloakers bend light around their hulls. Shoot one and the cloak flickers. Fly close and you\'ll see the shimmer.' },
  { id: 'c13', sector: 'cryo', foot: true, at: [14, 0.6, -9786], title: 'Frostfall', text: 'Okoro\'s crew melts ice for water, splits it for fuel and fixes everything with tape. Frostfall is the warmest place in a frozen sector.' },
  { id: 'c14', sector: 'cryo', at: [-260, 6, -10140], title: 'The Ice Cave', text: 'The cave walls are full of perfectly round tunnels, each wide enough for a ship. They were not cut. They were chewed.' },
  { id: 'c15', sector: 'cryo', at: [150, 30, -10300], title: 'The Frost Wyrm', text: 'It sleeps under the crater and wakes when the ground shakes. Miners leave it offerings of scrap. It eats those too.' },
  { id: 'c16', sector: 'cryo', at: [-300, 40, -10450], title: 'Cryo-9', text: 'Cryo-9 was once a water world. Something drained its warmth all at once. The oceans froze mid-wave; you can still see them.' },
  { id: 'c17', sector: 'cryo', at: [0, 120, -10400], title: 'The Aurora', text: 'On Cryo-9 the aurora points toward the Rift, every night, no matter which way the moon is facing.' },
  { id: 'c18', sector: 'cryo', foot: true, at: [200, 0.3, -10000], title: 'Frozen footprints', text: 'Bootprints in the ice, preserved for a century, walking in a straight line toward the crater. They don\'t come back.' },
  { id: 'c19', sector: 'scrap', foot: true, at: [274, 30, -14314], title: 'Rustport', text: 'The Scavenger clans have one rule: everything is for sale. Rule two, which nobody admits to: Gizmo gets a cut.' },
  { id: 'c20', sector: 'scrap', at: [-150, 45, -14800], title: 'The debris field', text: 'A whole battle fleet died here, and its wreckage still circles the spot where the flagship went down. It never slows.' },
  { id: 'c21', sector: 'scrap', at: [-320, 110, -15050], title: 'The Scrap King', text: 'The King started as a salvage tug. Every wreck he ate made him bigger. Now he is mostly magnets and spite.' },
  { id: 'c22', sector: 'scrap', at: [400, 90, -14900], title: 'The Last Fleet', text: 'These wrecks were Command\'s Seventh Fleet, sent into the Rift a century ago. Most of them came back. Nobody aboard did.' },
  { id: 'c23', sector: 'scrap', at: [-400, 40, -14300], title: 'Contraband', text: 'Talon weapons, Hive samples, gate parts. If it\'s illegal in the Reach, it\'s on a shelf somewhere in Rustport.' },
  { id: 'c24', sector: 'scrap', at: [100, 120, -15100], title: 'Scavenger law', text: 'Shoot a scav and every scav knows. Pay a scav and every scav forgets. The clans keep long memories and short ledgers.' },
  { id: 'c25', sector: 'rift', foot: true, at: [-286, 30, -18714], title: 'Last Light', text: 'Dr. Varga has studied the Rift for nine years. Her notes get shorter every year. The last one just says: "It is listening."' },
  { id: 'c26', sector: 'rift', at: [300, 80, -18800], title: 'Gravity wells', text: 'Small wells drift around the Rift like moons. Varga thinks they are its children. She does not say that part out loud.' },
  { id: 'c27', sector: 'rift', at: [-400, 50, -19400], title: 'The Hive', text: 'The Hive isn\'t a species. It is one creature with many bodies, grown from the Rift itself. It wants the gates.' },
  { id: 'c28', sector: 'rift', at: [100, 150, -19300], title: 'The eye of the Rift', text: 'Look into the Rift long enough and the stars on the other side are different stars. Nobody has looked long enough to say which.' },
  { id: 'c29', sector: 'rift', at: [-50, 125, -19500], title: 'The Hive Queen', text: 'The Queen is the Hive\'s memory. Kill her and the Hive forgets how to be one thing. For a while.' },
  { id: 'c30', sector: 'rift', at: [400, 40, -19600], title: 'Who built the gates?', text: 'The gates and the Rift hum at the same frequency. Whoever built one built the other. Maybe to keep something in.' },
];

// ---------- Time trial courses ----------
function course(center, r, n, wobble, seed, extra = {}) {
  const rnd = rng(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + rnd() * 0.4);
    pts.push(V(center[0] + Math.cos(a) * rr, center[1] + Math.sin(a * 2) * wobble + (rnd() - 0.5) * wobble, center[2] + Math.sin(a) * rr));
  }
  pts.push(pts[0].clone()); // finish where you started
  return { pts, ...extra };
}
const COURSES = {
  home: { name: 'Station Sprint', sector: 'home', ...course([0, 50, -520], 150, 12, 25, 11) },
  nebula: { name: 'Nebula Needle', sector: 'nebula', ...course([-200, 60, -5550], 200, 12, 35, 22) },
  cryo: {
    name: 'Ice Run', sector: 'cryo',
    // Through the ice cave and back over the plain
    pts: [V(-260, 7, -10020), V(-260, 6, -10080), V(-260, 6, -10140), V(-260, 7, -10200), V(-260, 9, -10260), V(-180, 25, -10330), V(-60, 30, -10300), V(40, 20, -10180), V(-60, 15, -10060), V(-180, 12, -9990), V(-260, 7, -10020)],
  },
  scrap: { name: 'Junk Jumper', sector: 'scrap', ...course([-150, 45, -14800], 130, 12, 20, 44) },
};
for (const c of Object.values(COURSES)) {
  let len = 0;
  for (let i = 1; i < c.pts.length; i++) len += c.pts[i].distanceTo(c.pts[i - 1]);
  c.length = len;
  c.gold = Math.round(len / 68);
  c.silver = Math.round(len / 52);
  c.bronze = Math.round(len / 38);
}
export { COURSES };

export function setupActivities(api) {
  const { game, fx, hud, ship } = api;
  const { scene } = game;
  const root = new THREE.Group();
  scene.add(root);

  // ---------- Time trials ----------
  const ringGeo = new THREE.TorusGeometry(7, 0.45, 10, 40);
  const courseMeshes = {};
  for (const [id, c] of Object.entries(COURSES)) {
    const list = c.pts.map((p, i) => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x7affc8, emissive: 0x2aff9a, emissiveIntensity: 0.4, transparent: true, opacity: 0.7 }));
      m.position.copy(p);
      const next = c.pts[Math.min(i + 1, c.pts.length - 1)];
      const prev = c.pts[Math.max(i - 1, 0)];
      m.lookAt(i < c.pts.length - 1 ? next : p.clone().add(p.clone().sub(prev)));
      root.add(m);
      return m;
    });
    const tag = makeLabel([{ text: `🏁 ${c.name}`, size: 52, color: '#7affc8', bold: true }, { text: `Time trial · gold ${c.gold}s · fly through to start`, size: 32, color: '#d8ffe8' }], { scale: 0.03 });
    tag.position.copy(c.pts[0]).add(V(0, 10, 0));
    root.add(tag);
    courseMeshes[id] = { list, tag };
  }
  const timerEl = document.createElement('div');
  Object.assign(timerEl.style, {
    position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', padding: '6px 16px', borderRadius: '10px', display: 'none',
    background: 'rgba(8,14,26,0.8)', border: '1px solid #7affc8', color: '#7affc8', font: '800 20px system-ui,sans-serif', zIndex: 6, pointerEvents: 'none',
  });
  document.getElementById('hud').appendChild(timerEl);
  let race = null; // { id, next, t }
  let raceCool = 0; // the finish ring is also the start ring: don't restart right away
  function passed(p, ring, prevPos) {
    // Crossed the ring's plane close to its middle since last frame
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(ring.quaternion);
    const a = prevPos.clone().sub(ring.position).dot(n);
    const b = p.clone().sub(ring.position).dot(n);
    if (Math.sign(a) === Math.sign(b) && Math.abs(b) > 2.5) return false;
    const rel = p.clone().sub(ring.position);
    return rel.addScaledVector(n, -rel.dot(n)).length() < 7.5;
  }
  function finishRace() {
    const c = COURSES[race.id];
    const t = race.t;
    const st = api.st;
    const medal = t <= c.gold ? 'gold' : t <= c.silver ? 'silver' : t <= c.bronze ? 'bronze' : null;
    const best = st.times[race.id];
    if (!best || t < best) st.times[race.id] = Math.round(t * 100) / 100;
    fx.sfx('quest');
    hud.banner(medal ? `${medal.toUpperCase()}!` : 'FINISHED', `${c.name}: ${t.toFixed(2)}s${best ? ` (best ${Math.min(best, t).toFixed(2)}s)` : ''}`, medal === 'gold' ? '#ffd23d' : medal === 'silver' ? '#dfe6ee' : medal === 'bronze' ? '#d8945a' : '#7affc8');
    if (medal) {
      st.flags.medals ||= {};
      const have = st.flags.medals[race.id] || [];
      const pay = { gold: 600, silver: 300, bronze: 150 };
      for (const m of ['bronze', 'silver', 'gold']) {
        if (!have.includes(m) && (m === medal || (m === 'bronze' && medal !== 'bronze') || (m === 'silver' && medal === 'gold'))) {
          have.push(m);
          api.reward(pay[m], pay[m] / 3);
        }
      }
      st.flags.medals[race.id] = have;
      if (medal === 'gold') {
        st.stats.golds[race.id] = true;
        if (Object.keys(COURSES).every((id) => st.stats.golds[id])) api.achieve('racer');
      }
    }
    api.raceResult?.(race.id, t);
    if (t < 9999) api.announce(`🏁 ran ${c.name} in ${t.toFixed(2)}s${medal ? ` (${medal})` : ''}`);
    api.emit({ type: 'course', of: race.id, medal });
    api.save();
    race = null;
    raceCool = 4;
    timerEl.style.display = 'none';
  }

  // ---------- Anomalies to scan ----------
  const anomalies = [];
  function anomaly(id, kind, name, sector, pos, build) {
    const a = { id, kind, name, sector, pos };
    if (build) {
      const g = build();
      g.position.copy(typeof pos === 'function' ? pos() : pos);
      root.add(g);
      a.g = g;
    }
    anomalies.push(a);
    return a;
  }
  const glowM = (c, i = 1.5) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
  anomaly('satellite', 'relic', 'Ancient satellite', 'home', V(-480, 120, -600), () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 5), new THREE.MeshStandardMaterial({ color: 0x8a7a5a, metalness: 0.6 })));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(8, 0.1, 3), glowM(0x3a6aff, 0.6));
      p.position.x = s * 6;
      g.add(p);
    }
    return g;
  });
  anomaly('crystal', 'crystal', 'Singing crystal', 'nebula', V(420, 90, -6050), () => {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(4 + k, 0), glowM(0xd06bff, 1.2));
      c.position.set(Math.sin(k) * 6, k * 3, Math.cos(k) * 6);
      c.scale.y = 2.4;
      g.add(c);
    }
    return g;
  });
  for (let i = 0; i < 3; i++) anomaly(`storm${i}`, 'storm', 'Ion storm', 'nebula', () => api.storms?.[i]?.c);
  anomaly('frozenship', 'wreck', 'Frozen patrol ship', 'cryo', V(300, 3, -10320), () => {
    const g = buildShip(0x5fb8ff, 'gunship');
    g.scale.setScalar(2.2);
    g.rotation.set(0.3, 1.2, 0.5);
    g.traverse((o) => o.isMesh && o.material && (o.material = o.material.clone(), o.material.color?.lerp(new THREE.Color(0xdff4ff), 0.6)));
    return g;
  });
  anomaly('aurora', 'aurora', 'Aurora', 'cryo', V(0, 140, -10400), () => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 40, 20, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.35 + k * 0.08, 0.9, 0.5), transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(0, k * 12, k * 20);
      m.rotation.y = k * 0.2;
      g.add(m);
    }
    g.userData.wave = true;
    return g;
  });
  anomaly('titan', 'wreck', 'Derelict titan', 'scrap', V(450, 60, -15150), () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.9, metalness: 0.4 });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 140, 12, 1, true), mat);
    hull.rotation.z = Math.PI / 2 + 0.2;
    g.add(hull);
    const lit = new THREE.Mesh(new THREE.BoxGeometry(30, 1, 1), glowM(0xffb03a, 1));
    lit.position.y = 15;
    g.add(lit);
    return g;
  });
  anomaly('rifteye', 'rift', 'The eye of the Rift', 'rift', () => api.rift?.core);
  anomaly('spire', 'spire', 'Hive spire', 'rift', V(350, 40, -19500), () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.ConeGeometry(10, 90, 7), new THREE.MeshStandardMaterial({ color: 0x4a1048, emissive: 0x3a0a4a, emissiveIntensity: 0.6, roughness: 0.4 }));
    g.add(m);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), glowM(0xff5ad0, 2));
    tip.position.y = 46;
    g.add(tip);
    return g;
  });
  const apos = (a) => (typeof a.pos === 'function' ? a.pos() : a.pos);
  let scanT = 0, scanning = null;
  const scanCool = new Map();

  // ---------- Codex beacons and pads ----------
  const beaconGeo = new THREE.OctahedronGeometry(1.4, 0);
  const codexObjs = CODEX.map((c) => {
    const g = new THREE.Group();
    if (c.foot) {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 10), new THREE.MeshStandardMaterial({ color: 0x3a3e46 }));
      ped.position.y = 0.5;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.4), glowM(0x7affc8, 1.4));
      pad.position.y = 1.05;
      pad.rotation.x = -0.4;
      g.add(ped, pad);
    } else {
      g.add(new THREE.Mesh(beaconGeo, glowM(0x7affc8, 1.6)));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 6, 32), glowM(0x7affc8, 1));
      g.add(ring);
      g.userData.ring = ring;
    }
    g.position.set(...c.at);
    root.add(g);
    return { c, g };
  });
  function readCodex(c) {
    const st = api.st;
    if (st.codex.includes(c.id)) return;
    st.codex.push(c.id);
    fx.sfx('pickup');
    hud.toast(`📖 Codex: ${c.title} (${st.codex.length}/${CODEX.length})`, '#7affc8');
    game.chat(`📖 ${c.title}: ${c.text}`, true);
    api.reward(25, 40, true);
    if (st.codex.length >= 20) api.achieve('codex');
    api.save();
  }
  api.actions.push((p) => {
    if (ship.piloting) return null;
    for (const { c, g } of codexObjs) {
      if (c.foot && !api.st.codex.includes(c.id) && g.position.distanceTo(p) < 2.6) return { text: `E: Read data pad (${c.title})`, fn: () => readCodex(c) };
    }
    return null;
  });

  // ---------- Quest crates / pods ----------
  const crateGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
  const crateMat = glowM(0xffd23d, 0.8);
  const podGeo = new THREE.CapsuleGeometry(1.2, 2.5, 6, 12);
  const crates = [];
  function crateAt(i, p, kind) {
    if (!crates[i]) {
      crates[i] = { box: new THREE.Mesh(crateGeo, crateMat), pod: new THREE.Mesh(podGeo, new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.6, emissive: 0xff3a3a, emissiveIntensity: 0.3 })) };
      root.add(crates[i].box, crates[i].pod);
    }
    const c = crates[i];
    c.box.visible = kind !== 'pod';
    c.pod.visible = kind === 'pod';
    (kind === 'pod' ? c.pod : c.box).position.copy(p);
    (kind === 'pod' ? c.pod : c.box).rotation.y += 0.02;
  }

  // ---------- Escorts ----------
  let escort = null;
  function startEscort({ id, questId, path, speed = 20, hp = 700, waves = [], name = 'Freighter' }) {
    stopEscort();
    const obj = buildShip(0xffd23d, 'hauler');
    obj.scale.setScalar(1.6);
    obj.position.copy(path[0]);
    root.add(obj);
    const goal = {
      alive: true, pos: obj.position, vel: new THREE.Vector3(), hp, maxHp: hp,
      hurt(n, from) {
        goal.hp -= n;
        fx.sparks(obj.position, 0xffb03a, 6);
        if (from && Math.random() < 0.2) hud.toast(`📦 ${name} is under fire!`, '#ffb03a');
        if (goal.hp <= 0 && goal.alive) {
          goal.alive = false;
          fx.explode(obj.position, 3);
          hud.toast(`💥 The ${name} was destroyed! Mission failed.`, '#ff5a4a');
          api.fail(questId, `The ${name} was destroyed. Talk to the quest giver to try again.`);
          stopEscort();
        }
      },
    };
    escort = { id, questId, path, speed, obj, goal, seg: 0, waves: waves.map((w) => ({ ...w, done: false })), name, sector: api.sector() };
    hud.toast(`📦 Escort the ${name}! Keep enemies off it.`, '#ffd23d');
  }
  function stopEscort() {
    if (!escort) return;
    root.remove(escort.obj);
    api.enemies.clearTag('escort');
    escort.goal.alive = false;
    escort = null;
    hud.boss(null);
  }

  // ---------- Patrol scanners (smuggling) ----------
  const scanners = [];
  function scanner(sector, base, aim) {
    const g = new THREE.Group();
    g.position.copy(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 10, 10), new THREE.MeshStandardMaterial({ color: 0x3a5a8a, metalness: 0.6 }));
    g.add(tower);
    const head = new THREE.Group();
    head.position.y = 6;
    g.add(head);
    const coneGeo = new THREE.ConeGeometry(26, 170, 24, 1, true);
    coneGeo.translate(0, -85, 0);
    coneGeo.rotateX(-Math.PI / 2); // apex at the head, pointing along -Z
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    head.add(cone);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8), glowM(0x5fb8ff, 2));
    head.add(lamp);
    root.add(g);
    const tag = makeLabel([{ text: '🚨 COMMAND PATROL SCANNER', size: 40, color: '#5fb8ff', bold: true }], { scale: 0.03 });
    tag.position.y = 12;
    g.add(tag);
    scanners.push({ sector, g, head, cone, aim, t: Math.random() * 10 });
  }
  scanner('nebula', V(-40, 50, -5080), 0);
  scanner('nebula', V(40, 50, -5080), 1);
  scanner('nebula', V(0, 40, -5160), 2);
  scanner('scrap', V(-40, 50, -14080), 0);
  scanner('scrap', V(40, 50, -14080), 1);
  scanner('scrap', V(0, 40, -14160), 2);
  const _dir = new THREE.Vector3();
  function inBeam(s, p) {
    const apex = s.head.getWorldPosition(new THREE.Vector3());
    _dir.set(0, 0, -1).applyQuaternion(s.head.getWorldQuaternion(new THREE.Quaternion()));
    const v = p.clone().sub(apex);
    const along = v.dot(_dir);
    if (along < 0 || along > 170) return false;
    return v.length() * Math.sin(v.angleTo(_dir)) < (26 * along) / 170;
  }

  // ---------- Per frame ----------
  let prevPos = new THREE.Vector3();
  api.frame.push((dt, ctx) => {
    const here = ctx.inSpace ? ctx.sector : null;
    const st = api.st;
    root.visible = !!here;
    const t = performance.now() / 1000;
    const pos = api.currentPos();

    raceCool = Math.max(0, raceCool - dt);
    // Course rings: only your sector's, the next ring lit while racing
    for (const [id, c] of Object.entries(COURSES)) {
      const vis = c.sector === here;
      const cm = courseMeshes[id];
      cm.tag.visible = vis && !race;
      cm.list.forEach((m, i) => {
        m.visible = vis;
        if (!vis) return;
        const isNext = race?.id === id ? i === race.next : i === 0;
        m.material.emissiveIntensity = isNext ? 2.2 + Math.sin(t * 8) * 0.5 : race?.id === id && i < race.next ? 0.05 : 0.3;
        m.material.opacity = race && race.id !== id ? 0.15 : isNext ? 1 : 0.45;
        m.material.color.setHex(i === 0 && !race ? 0x7affc8 : i === c.pts.length - 1 ? 0xffd23d : 0x7affc8);
      });
      if (ship.piloting && vis) {
        if (!race && raceCool <= 0 && passed(ship.position, cm.list[0], prevPos)) {
          race = { id, next: 1, t: 0 };
          api.raceStart?.(id);
          fx.sfx('lockOn');
          hud.toast(`🏁 ${c.name}: GO! Gold ${c.gold}s · silver ${c.silver}s · bronze ${c.bronze}s`, '#7affc8');
        } else if (race?.id === id && passed(ship.position, cm.list[race.next], prevPos)) {
          fx.sfx('pickup');
          race.next++;
          if (race.next >= c.pts.length) finishRace();
        }
      }
    }
    if (race) {
      race.t += dt;
      timerEl.style.display = 'block';
      const c = COURSES[race.id];
      timerEl.textContent = `🏁 ${race.t.toFixed(2)}s · ring ${race.next}/${c.pts.length - 1} · ${race.t <= c.gold ? '🥇' : race.t <= c.silver ? '🥈' : race.t <= c.bronze ? '🥉' : '⌛'}`;
      if (!ship.piloting || COURSES[race.id].sector !== here || race.t > 400) {
        hud.toast('🏁 Time trial cancelled', '#ff8a7a');
        race = null;
        timerEl.style.display = 'none';
      }
    }
    prevPos.copy(ship.position);

    // Anomalies: animate, and scan the one under your crosshair
    for (const a of anomalies) {
      if (!a.g) continue;
      a.g.visible = a.sector === here;
      if (a.g.visible) {
        a.g.rotation.y += dt * 0.1;
        if (a.g.userData.wave) a.g.children.forEach((m, k) => (m.position.y = k * 12 + Math.sin(t + k) * 6));
      }
    }
    let target = null;
    if (ship.piloting && here) {
      const dir = game.camera.getWorldDirection(new THREE.Vector3());
      const range = 320 + 120 * api.skill('scanner');
      for (const a of anomalies) {
        if (a.sector !== here) continue;
        const p = apos(a);
        if (!p) continue;
        const rel = p.clone().sub(game.camera.position);
        const d = rel.length();
        if (d > range) continue;
        if (rel.angleTo(dir) < Math.max(0.06, 12 / d)) target = a;
      }
    }
    if (target && !(scanCool.get(target.id) > t)) {
      if (scanning !== target) {
        scanning = target;
        scanT = 0;
      }
      scanT += dt * (1 + 0.3 * api.skill('scanner'));
      hud.scan(scanT / 2.2, `📡 Scanning: ${target.name}`);
      if (scanT >= 2.2) {
        scanCool.set(target.id, t + 600);
        hud.scan(null);
        scanning = null;
        fx.sfx('quest');
        const first = !st.flags[`scanned:${target.id}`];
        st.flags[`scanned:${target.id}`] = 1;
        hud.toast(`📡 Scanned: ${target.name}${first ? ' (new discovery!)' : ''}`, '#7affc8');
        if (first) api.reward(60, 90);
        api.emit({ type: 'scan', of: target.kind, sector: here });
        api.save();
      }
    } else if (scanning) {
      scanning = null;
      hud.scan(null);
    }

    // Codex beacons: fly close to read
    for (const { c, g } of codexObjs) {
      const have = st.codex.includes(c.id);
      g.visible = c.sector === here && !have;
      if (!g.visible) continue;
      g.rotation.y += dt;
      if (g.userData.ring) g.userData.ring.rotation.x += dt * 1.5;
      if (!c.foot && ship.piloting && g.position.distanceTo(ship.position) < 16) readCodex(c);
    }

    // Quest crates
    let ci = 0;
    for (const [q, qs] of api.activeQuests()) {
      const step = q.steps[qs.step];
      if (qs.stage !== 'active' || !step?.crate) continue;
      const at = typeof step.at === 'function' ? step.at(qs.progress, api) : step.at;
      if (!at) continue;
      crateAt(ci++, at.isVector3 ? at : V(...at), step.crate);
    }
    for (let i = ci; i < crates.length; i++) crates[i].box.visible = crates[i].pod.visible = false;

    // Escort
    if (escort) {
      const e = escort;
      const goalPt = e.path[e.seg + 1];
      if (!goalPt) {
        hud.toast(`📦 The ${e.name} made it! Great flying.`, '#7affc8');
        api.emit({ type: 'escort', of: e.id });
        stopEscort();
      } else {
        const to = goalPt.clone().sub(e.obj.position);
        // Wait for you if you fall behind
        const waiting = ship.position.distanceTo(e.obj.position) > 350;
        const step = waiting ? 0 : Math.min(to.length(), e.speed * dt);
        e.goal.vel.copy(to).setLength(waiting ? 0 : e.speed);
        e.obj.position.addScaledVector(to.normalize(), step);
        e.obj.lookAt(goalPt);
        e.obj.rotateY(Math.PI);
        setThrust(e.obj, waiting ? 0.1 : 0.7);
        if (e.obj.position.distanceTo(goalPt) < 2) e.seg++;
        const prog = (e.seg + 1 - to.length() / Math.max(1, goalPt.distanceTo(e.path[e.seg]))) / (e.path.length - 1);
        for (const w of e.waves) {
          if (w.done || prog < w.at) continue;
          w.done = true;
          hud.toast('⚠ Enemies inbound on the convoy!', '#ff8a7a');
          w.types.forEach((type, k) => {
            const a = (k / w.types.length) * Math.PI * 2;
            api.enemies.spawn(type, e.obj.position.clone().add(V(Math.cos(a) * 160, 30, Math.sin(a) * 160)), { sector: e.sector, level: w.level || Math.max(2, api.level() - 2), goal: e.goal, tag: 'escort', home: e.obj.position.clone(), leash: 900 });
          });
        }
        hud.boss(`📦 ${e.name}`, e.goal.hp / e.goal.maxHp, waiting ? 'Waiting for you to catch up…' : 'Keep it alive!');
        if (here !== e.sector) {
          api.fail(e.questId, `You left the ${e.name} behind. Talk to the quest giver to try again.`);
          stopEscort();
        }
      }
    }

    // Patrol scanners sweep; carrying contraband through a beam gets it confiscated
    for (const s of scanners) {
      const vis = s.sector === here;
      s.g.visible = vis;
      if (!vis) continue;
      s.t += dt;
      s.head.rotation.y = Math.sin(s.t * 0.4 + s.aim * 2) * 1.2;
      s.head.rotation.x = -0.15 + Math.sin(s.t * 0.3 + s.aim) * 0.12;
      const carrying = (st.goods.contraband || 0) > 0;
      s.cone.material.color.setHex(carrying ? 0xff5a4a : 0x5fb8ff);
      if (carrying && ship.piloting && inBeam(s, ship.position)) {
        const n = st.goods.contraband;
        st.goods.contraband = 0;
        const fine = Math.min(st.credits, 150 + n * 40);
        st.credits -= fine;
        fx.sfx('alarm');
        hud.toast(`🚨 Scanned by a Command patrol! ${n} contraband confiscated, ${fine} cr fine.`, '#ff5a4a');
        api.rep('command', -3);
        st.flags.scanned = true;
        for (const [q] of api.activeQuests()) if (q.smuggle) api.fail(q.id, 'Your contraband was confiscated. Talk to the quest giver to try again.');
        api.save();
      }
    }

    // Wanted aces and other quest steps keep their enemies around (see step.tick in spaceQuests.js)
  });

  api.blipSources.push((out, here) => {
    for (const a of anomalies) {
      if (a.sector !== here || api.st.flags[`scanned:${a.id}`]) continue;
      const p = apos(a);
      if (p) out.push({ p, kind: 'neutral', size: 1.3 });
    }
    for (const { c, g } of codexObjs) if (g.visible) out.push({ p: g.position, kind: 'loot', size: 0.6 });
    for (const [id, c] of Object.entries(COURSES)) if (c.sector === here) out.push({ p: c.pts[race?.id === id ? race.next : 0], kind: 'friendly', size: 1 });
  });

  // Spawns a named ace near `at` while you're around (for wanted posters)
  function ensureAce(tag, sector, at, name, level) {
    if (api.sector() !== sector || api.enemies.count(tag)) return;
    if (api.currentPos().distanceTo(at) > 700) return;
    const e = api.enemies.spawn('ace', at.clone(), { sector, level, tag, name, home: at.clone(), leash: 600 });
    e.aggro = true;
    hud.toast(`☠ ${name} is here!`, '#ff5a4a');
  }

  // ---------- Journal: codex and records ----------
  const ui = api.journal.ui;
  api.journal.addTab('codex', '📖 Codex', (el) => {
    const st = api.st;
    let html = ui.section(`Codex · ${st.codex.length} / ${CODEX.length} found`);
    html += ui.h('div', 'opacity:0.7;margin-bottom:8px', 'Data beacons (fly close) and data pads (walk up, E) are hidden all over the five sectors. Green blips on your radar.');
    for (const c of CODEX) {
      const have = st.codex.includes(c.id);
      html += ui.card(have
        ? `<b style="color:#7affc8">${ui.esc(c.title)}</b> <span style="opacity:0.5;font-size:12px">· ${SECTORS[c.sector].name}</span><div style="opacity:0.85;margin-top:2px">${ui.esc(c.text)}</div>`
        : `<b style="opacity:0.45">??? </b><span style="opacity:0.4;font-size:12px">somewhere in ${SECTORS[c.sector].name}${c.foot ? ' (on foot)' : ''}</span>`);
    }
    el.innerHTML = html;
  });
  api.journal.addTab('records', '🏁 Records', (el) => {
    const st = api.st;
    let html = ui.section('Time trials');
    for (const [id, c] of Object.entries(COURSES)) {
      const medals = st.flags.medals?.[id] || [];
      html += ui.card(`<b>🏁 ${c.name}</b> <span style="opacity:0.6">· ${SECTORS[c.sector].name}</span><br>
        Best: <b>${st.times[id] ? `${st.times[id].toFixed(2)}s` : '—'}</b> · 🥇 ${c.gold}s · 🥈 ${c.silver}s · 🥉 ${c.bronze}s · medals: ${medals.map((m) => ({ gold: '🥇', silver: '🥈', bronze: '🥉' }[m])).join('') || 'none yet'}`);
    }
    html += ui.section('Pilot stats');
    const s = st.stats;
    html += `Enemies destroyed: <b>${s.kills}</b> · materials gathered: <b>${s.mined}</b> · ships lost: <b>${s.deaths}</b><br>
      Anomalies scanned: <b>${Object.keys(st.flags).filter((k) => k.startsWith('scanned:')).length}</b> · contracts: <b>${st.jobsDone}</b> · sectors visited: <b>${st.visited.length}/5</b>`;
    el.innerHTML = html;
  });

  return { COURSES, CODEX, anomalies, startEscort, stopEscort, ensureAce, get race() { return race; }, get escort() { return escort; } };
}
