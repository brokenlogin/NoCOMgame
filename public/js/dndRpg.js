// The Realm of Embervale: a tabletop-style fantasy RPG behind the 📜 portal near spawn.
//
// Make a hero (Fighter, Wizard, Rogue or Cleric; your stats are rolled with real dice), then
// talk to the villagers (E), take quests, and explore. Touch a monster and a turn-based fight
// starts: every attack is a d20 roll against Armor Class, every hit rolls damage dice, and
// your class has its own abilities and spells. Drop to 0 HP and you make death saves.
// Skill checks (a d20 + your stat) open locks, free prisoners, read runes and talk trolls
// out of eating you. Level up to 10, buy gear from the smiths, rest at the inn, fast travel
// between waystones, and finally face Ignaroth the Ember Wyrm.
//   E  talk / use · K  character sheet and quest log · combat: click actions or press 1-9
// Progress is saved in this browser (per player name). The world: dndRealm.js; numbers: dndData.js.

import * as THREE from 'three';
import { teleport } from './mgShared.js';
import { buildRealm, ZONES } from './dndRealm.js';
import {
  roll, rollExpr, mod, STATS, levelFor, prof, MAX_LEVEL, XP_TABLE, CLASSES, ABILITIES, WEAPONS, ARMOR, ARMOR_OK,
  POTIONS, MONSTERS, QUESTS, SIDE_QUESTS,
} from './dndData.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function setupDnd(game) {
  const { net, input, camera } = game;
  const realm = buildRealm(game);
  const Y = realm.Y;

  // ---------- Saved hero ----------
  let st = null;
  let saveKey = null;
  const fresh = () => ({
    v: 1, cls: null, stats: null, xp: 0, hp: 10, gold: 15, weapon: null, armor: null, shield: false,
    weapons: [], armors: [], potions: { healing: 2 }, slotsUsed: 0, items: {}, story: 0, quests: {}, done: {},
    flags: {}, waystones: ['village'], title: '', kills: 0, picked: {},
  });
  function load(name) {
    saveKey = `nocom.embervale.${name}`;
    try {
      st = { ...fresh(), ...JSON.parse(localStorage.getItem(saveKey) || '{}') };
    } catch {
      st = fresh();
    }
  }
  const save = () => {
    try {
      if (saveKey) localStorage.setItem(saveKey, JSON.stringify(st));
    } catch {}
  };
  const lvl = () => levelFor(st.xp);
  const M = (s) => mod(st.stats[s]);
  const cls = () => CLASSES[st.cls];
  function maxHp() {
    const c = cls();
    return c.hitDie + M('CON') + 8 + (lvl() - 1) * (Math.floor(c.hitDie / 2) + 1 + M('CON'));
  }
  function ac() {
    const a = st.armor && ARMOR[st.armor];
    const dex = M('DEX');
    let base = a ? a.base + (a.maxDex == null ? dex : Math.min(a.maxDex, dex)) : 10 + dex + (st.cls === 'wizard' ? 3 : 0);
    if (st.shield && cls().shield) base += 2;
    return base;
  }
  const weapon = () => WEAPONS[st.weapon] || WEAPONS.dagger;
  const wStat = (w) => (w.stat === 'finesse' ? (M('DEX') > M('STR') ? 'DEX' : 'STR') : w.stat);
  const toHit = (w = weapon()) => prof(lvl()) + M(wStat(w)) + (w.bonus || 0);
  const spellHit = () => prof(lvl()) + M(cls().main) + (weapon().spell || 0);
  const saveDC = () => 8 + prof(lvl()) + M(cls().main);
  const slotsMax = () => (cls().slots ? cls().slots[lvl() - 1] : 0);
  const slotsLeft = () => slotsMax() - st.slotsUsed;
  const hasAbility = (id) => cls().abilities.some(([l, a]) => a === id && lvl() >= l);

  // ---------- UI: shared styles ----------
  const css = document.createElement('style');
  css.textContent = `
    .dnd-panel{position:fixed;background:linear-gradient(#2a1c10f2,#1a1008f5);border:2px solid #b8893a;border-radius:12px;color:#f0e2c4;
      font:15px Georgia,'Times New Roman',serif;box-shadow:0 20px 60px #000a;z-index:33;pointer-events:auto}
    .dnd-panel h3{margin:0 0 6px;color:#ffd27a;font-size:18px}
    .dnd-btn{display:block;width:100%;text-align:left;margin:4px 0;padding:7px 10px;background:#3a2814;color:#f8e8c8;border:1px solid #8a6a3a;
      border-radius:6px;font:14px Georgia,serif;cursor:pointer}
    .dnd-btn:hover:not(:disabled){background:#5a3c1c;border-color:#d8a85a}
    .dnd-btn:disabled{opacity:0.45;cursor:default}
    .dnd-card{flex:1;min-width:120px;max-width:200px;padding:8px;border:2px solid #6a4a2a;border-radius:8px;background:#2a1a0c;cursor:pointer;text-align:center}
    .dnd-card.sel{border-color:#ffd27a;box-shadow:0 0 12px #ffd27a88}
    .dnd-card.dead{opacity:0.3;cursor:default}
    .dnd-bar{height:7px;background:#0008;border-radius:4px;overflow:hidden;margin-top:4px}
    .dnd-bar>div{height:100%;background:#d83a2a}
    @keyframes dndSpin{0%{transform:rotate(0) scale(0.8)}100%{transform:rotate(720deg) scale(1)}}`;
  document.head.appendChild(css);
  const hudRoot = document.getElementById('hud');
  const panel = (style) => {
    const d = document.createElement('div');
    d.className = 'dnd-panel';
    Object.assign(d.style, { display: 'none', ...style });
    hudRoot.appendChild(d);
    return d;
  };
  let uiOpen = 0;
  function lockInput(on) {
    uiOpen += on ? 1 : -1;
    uiOpen = Math.max(0, uiOpen);
    if (uiOpen && on) {
      input.enabled = false;
      input.keys.clear();
      document.exitPointerLock?.();
    } else if (!uiOpen) {
      input.enabled = true;
      if (game.player) input.requestLock();
    }
  }

  // ---------- Dialogue ----------
  const dlg = panel({ left: '50%', bottom: '100px', transform: 'translateX(-50%)', width: 'min(620px,92vw)', maxHeight: '70vh', overflowY: 'auto', padding: '16px 18px' });
  let dlgOpen = false, dlgFns = [];
  function say(who, text, options) {
    dlg.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = who;
    const p = document.createElement('div');
    p.style.cssText = 'line-height:1.5;margin-bottom:10px;white-space:pre-line';
    p.textContent = text;
    dlg.append(h, p);
    dlgFns = [];
    options.forEach(([label, fn, disabled], i) => {
      const b = document.createElement('button');
      b.className = 'dnd-btn';
      b.textContent = `${i < 9 ? `${i + 1}. ` : ''}${label}`;
      b.disabled = !!disabled;
      b.onclick = () => !disabled && fn();
      dlg.appendChild(b);
      dlgFns.push(disabled ? null : fn);
    });
    dlg.style.display = 'block';
    if (!dlgOpen) {
      dlgOpen = true;
      lockInput(true);
    }
  }
  function closeDlg() {
    if (!dlgOpen) return;
    dlgOpen = false;
    dlg.style.display = 'none';
    lockInput(false);
  }
  const bye = ['Farewell', () => closeDlg()];

  // ---------- Dice ----------
  const diceEl = panel({ right: '24px', top: '90px', width: '220px', padding: '12px', textAlign: 'center', zIndex: 36 });
  diceEl.innerHTML = '<div class="dl" style="font-size:13px;color:#d8c098"></div><div class="dn" style="font:900 54px Georgia,serif;color:#fff;margin:4px 0"></div><div class="dt" style="font-size:14px"></div>';
  const dLabel = diceEl.querySelector('.dl'), dNum = diceEl.querySelector('.dn'), dText = diceEl.querySelector('.dt');
  let diceHide = 0;
  let audio = null;
  function clack() {
    try {
      audio ||= new AudioContext();
      for (let i = 0; i < 4; i++) {
        const t = audio.currentTime + i * 0.06;
        const o = audio.createOscillator();
        o.type = 'square';
        o.frequency.value = 300 + Math.random() * 500;
        const g = audio.createGain();
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + 0.06);
      }
    } catch {}
  }
  // Shows a roll: sides, the natural roll, and what it means
  async function showRoll(label, sides, natural, text, quick = false) {
    clearTimeout(diceHide);
    diceEl.style.display = 'block';
    dLabel.textContent = `🎲 ${label} (d${sides})`;
    dText.textContent = '';
    clack();
    if (!quick) {
      for (let i = 0; i < 7; i++) {
        dNum.textContent = 1 + Math.floor(Math.random() * sides);
        dNum.style.color = '#fff';
        await sleep(45);
      }
    }
    dNum.textContent = natural;
    dNum.style.color = sides === 20 && natural === 20 ? '#ffd23d' : sides === 20 && natural === 1 ? '#ff5a4a' : '#ffffff';
    dNum.style.animation = 'none';
    void dNum.offsetWidth;
    dNum.style.animation = 'dndSpin 0.3s';
    dText.textContent = text;
    diceHide = setTimeout(() => (diceEl.style.display = 'none'), 2500);
    await sleep(quick ? 250 : 550);
  }
  // A skill check: d20 + stat (+ proficiency if it's one of your class's skills)
  async function check(stat, dc, why) {
    const nat = roll(1, 20);
    const bonus = M(stat) + (cls().skills.includes(stat) ? prof(lvl()) : 0);
    const total = nat + bonus;
    const ok = nat === 20 || (nat !== 1 && total >= dc);
    await showRoll(`${stat} check: ${why}`, 20, nat, `${nat} ${bonus >= 0 ? '+' : ''}${bonus} = ${total} vs DC ${dc} · ${ok ? 'SUCCESS' : 'FAIL'}`);
    return ok;
  }

  // ---------- HUD ----------
  const hudEl = panel({ left: '12px', top: '84px', width: '250px', padding: '10px 12px', fontSize: '13px', zIndex: 4, pointerEvents: 'none' });
  const marker = document.createElement('div');
  Object.assign(marker.style, { position: 'fixed', display: 'none', pointerEvents: 'none', transform: 'translate(-50%,-50%)', zIndex: 4, color: '#ffd27a', font: '700 12px Georgia,serif', textAlign: 'center', textShadow: '0 1px 4px #000' });
  marker.innerHTML = '<div class="mi" style="font-size:22px">◆</div><div class="md"></div>';
  hudRoot.appendChild(marker);
  const prompt = document.createElement('div');
  Object.assign(prompt.style, { position: 'fixed', left: '50%', top: '58%', transform: 'translateX(-50%)', display: 'none', pointerEvents: 'none', padding: '6px 12px', borderRadius: '8px', background: '#2a1c10e0', border: '1px solid #b8893a', color: '#f8e8c8', font: '600 14px Georgia,serif', zIndex: 4 });
  hudRoot.appendChild(prompt);

  // ---------- Hero creation ----------
  async function createHero() {
    const pick = () => new Promise((resolve) => {
      say('📜 Welcome to the Realm of Embervale', 'Every hero\'s tale begins with a choice. What kind of adventurer are you?',
        Object.entries(CLASSES).map(([id, c]) => [`${c.icon} ${c.name}: ${c.desc}`, () => resolve(id)]));
    });
    const id = await pick();
    closeDlg();
    // Roll 4d6 drop the lowest, six times
    const rolls = [];
    for (let i = 0; i < 6; i++) {
      const d = [roll(1, 6), roll(1, 6), roll(1, 6), roll(1, 6)].sort((a, b) => b - a);
      rolls.push(d[0] + d[1] + d[2]);
      await showRoll(`Ability score ${i + 1} of 6 (4d6, drop the lowest)`, 6, d[0] + d[1] + d[2], `[${d.join(', ')}] → ${d[0] + d[1] + d[2]}`, true);
    }
    rolls.sort((a, b) => b - a);
    const order = { fighter: ['STR', 'CON', 'DEX', 'WIS', 'CHA', 'INT'], wizard: ['INT', 'CON', 'DEX', 'WIS', 'CHA', 'STR'], rogue: ['DEX', 'CON', 'CHA', 'WIS', 'INT', 'STR'], cleric: ['WIS', 'CON', 'STR', 'CHA', 'DEX', 'INT'] }[id];
    const stats = {};
    order.forEach((s, i) => (stats[s] = rolls[i]));
    const c = CLASSES[id];
    Object.assign(st, { cls: id, stats, weapon: c.weapon, armor: c.armorStart, shield: c.shield, weapons: [c.weapon], armors: c.armorStart ? [c.armorStart] : [] });
    st.hp = maxHp();
    save();
    say(`${c.icon} ${game.player.name} the ${c.name}`, `Your rolls: ${STATS.map((s) => `${s} ${stats[s]} (${mod(stats[s]) >= 0 ? '+' : ''}${mod(stats[s])})`).join(' · ')}\n\nHP ${maxHp()} · AC ${ac()} · ${weapon().name}\n\nYou arrive in Embervale as smoke rises from the old mill. Mayor Brannoc is waiting in the square. Press K any time for your character sheet.`, [['Begin the adventure', closeDlg]]);
  }

  // ---------- Quests ----------
  const ALL = [...QUESTS, ...SIDE_QUESTS];
  const qById = (id) => ALL.find((q) => q.id === id);
  const isStory = (q) => QUESTS.includes(q);
  function offersFrom(npcId) {
    const out = [];
    const sq = QUESTS[st.story];
    if (sq && sq.giver === npcId && !st.quests[sq.id]) out.push(sq);
    for (const q of SIDE_QUESTS) if (q.giver === npcId && !st.done[q.id] && !st.quests[q.id] && st.story >= (q.req || 0)) out.push(q);
    return out;
  }
  function stepOf(id) {
    const qs = st.quests[id];
    const q = qById(id);
    return qs && q ? q.steps[qs.step] : null;
  }
  function label(id) {
    const qs = st.quests[id], q = qById(id);
    if (!qs || !q) return '';
    if (qs.stage === 'turnin') return `Return to ${npcName(q.turnIn)}`;
    const s = q.steps[qs.step];
    return `${s.label}${s.n > 1 ? ` (${Math.min(qs.progress, s.n)}/${s.n})` : ''}`;
  }
  function advance(q, qs) {
    qs.step++;
    qs.progress = 0;
    if (qs.step >= q.steps.length) {
      qs.stage = 'turnin';
      game.chat(`📜 ${q.title}: done! Return to ${npcName(q.turnIn)}.`, true);
    } else game.chat(`📜 ${label(q.id)}`, true);
    save();
  }
  // Something happened: { t: 'kill' | 'boss' | 'check' | 'reach' | 'pick', of, trait }
  function emit(ev) {
    for (const [id, qs] of Object.entries(st.quests)) {
      if (qs.stage !== 'active') continue;
      const q = qById(id), s = q?.steps[qs.step];
      if (!s || s.t !== ev.t) continue;
      if (s.of !== ev.of && !(ev.traits || []).includes(s.of)) continue;
      qs.progress += ev.n || 1;
      if (qs.progress >= (s.n || 1)) advance(q, qs);
      else save();
    }
  }
  function accept(q) {
    st.quests[q.id] = { step: 0, progress: 0, stage: 'active' };
    game.chat(`📜 New quest: ${q.title}`, true);
    if (q.id === 'q1' && !st.flags.q1potion) {
      st.flags.q1potion = 1;
      st.potions.healing = (st.potions.healing || 0) + 1;
    }
    save();
  }
  function complete(q) {
    delete st.quests[q.id];
    gainXp(q.xp);
    st.gold += q.gold || 0;
    for (const [p, n] of Object.entries(q.reward || {})) st.potions[p] = (st.potions[p] || 0) + n;
    q.onDone?.(st);
    if (isStory(q)) st.story++;
    else st.done[q.id] = true;
    game.chat(`🏅 ${q.title} complete! +${q.xp} XP${q.gold ? `, +${q.gold} gold` : ''}`, true);
    if (q.id === 'q8') announce('🐉 slew IGNAROTH THE EMBER WYRM and saved Embervale!');
    save();
  }

  // ---------- XP and levels ----------
  function gainXp(n) {
    const before = lvl();
    st.xp += n;
    if (lvl() > before) {
      const gainHp = maxHp() - st.hp;
      st.hp = maxHp();
      const newAbs = cls().abilities.filter(([l]) => l > before && l <= lvl()).map(([, a]) => ABILITIES[a].name);
      game.chat(`⭐ LEVEL ${lvl()}! Max HP ${maxHp()}${newAbs.length ? ` · new: ${newAbs.join(', ')}` : ''}`, true);
      announce(`⭐ reached level ${lvl()} as a ${cls().name} in Embervale`);
      void gainHp;
    }
    save();
  }
  function announce(text) {
    game.chat(text, true);
    net.sendEvent({ kind: 'dnd:say', text: `${game.player?.name}: ${text}`.slice(0, 140) });
  }
  net.on('event', (msg) => {
    if (msg.kind === 'dnd:say' && typeof msg.text === 'string') game.chat(`📜 ${msg.text.slice(0, 140)}`, true);
  });

  // =================== Combat ===================
  const cb = panel({ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(820px,96vw)', maxHeight: '92vh', overflowY: 'auto', padding: '14px 16px', zIndex: 34 });
  let fight = null;
  let pendingAction = null;
  const logLines = [];
  function log(text, color = '#f0e2c4') {
    logLines.push(`<div style="color:${color}">${text}</div>`);
    while (logLines.length > 9) logLines.shift();
    drawCombat();
  }
  function drawCombat() {
    if (!fight) return;
    const f = fight;
    const enemies = f.E.map((e, i) => `<div class="dnd-card ${e.hp <= 0 ? 'dead' : ''} ${f.target === e ? 'sel' : ''}" data-t="${i}">
      <div style="font-weight:700;color:${e.boss ? '#ff8a6a' : '#ffd27a'}">${e.name}</div>
      <div style="font-size:12px;opacity:0.8">AC ${e.ac}${e.stun > 0 ? ' · 💫 stunned' : ''}${e.undead ? ' · undead' : ''}</div>
      <div class="dnd-bar"><div style="width:${Math.max(0, e.hp / e.maxHp) * 100}%"></div></div>
      <div style="font-size:12px">${Math.max(0, e.hp)} / ${e.maxHp} HP</div></div>`).join('');
    const down = st.hp <= 0;
    const me = `<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:8px 0">
      <b style="color:#ffd27a">${cls().icon} ${game.player.name}</b>
      <span>❤️ ${Math.max(0, st.hp)}/${maxHp()}</span><span>🛡️ AC ${ac() + (f.shieldUp ? 5 : 0)}</span>
      ${slotsMax() ? `<span>✨ slots ${slotsLeft()}/${slotsMax()}</span>` : ''}
      ${f.hidden ? '<span>🌫️ hidden</span>' : ''}${f.prone ? '<span>🤕 prone</span>' : ''}${f.stunned ? '<span>💫 stunned</span>' : ''}
      ${down ? `<span style="color:#ff8a6a">💀 dying · saves ✅${f.ds} ❌${f.df}</span>` : ''}</div>`;
    const acts = f.myTurn && !down ? actions().map((a, i) => `<button class="dnd-btn" data-a="${i}" ${a.disabled ? 'disabled' : ''} style="display:inline-block;width:auto;margin:3px">${i + 1}. ${a.label}</button>`).join('') : `<div style="opacity:0.7">${down ? 'You are dying... rolling death saves.' : 'Enemies are acting…'}</div>`;
    cb.innerHTML = `<h3>⚔️ ${f.title} · round ${f.round}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${enemies}</div>${me}
      <div style="background:#0006;border-radius:8px;padding:6px 10px;min-height:120px;font-size:13px;line-height:1.45">${logLines.join('')}</div>
      <div style="margin-top:8px">${acts}</div>`;
  }
  cb.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]');
    if (t && fight) {
      const en = fight.E[Number(t.dataset.t)];
      if (en.hp > 0) {
        fight.target = en;
        drawCombat();
      }
    }
    const a = e.target.closest('[data-a]');
    if (a && !a.disabled && pendingAction) pendingAction(actions()[Number(a.dataset.a)]);
  });
  window.addEventListener('keydown', (e) => {
    if (dlgOpen) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        e.stopImmediatePropagation();
        dlgFns[Number(m[1]) - 1]?.();
      } else if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        closeDlg();
      }
      return;
    }
    if (fight && pendingAction) {
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) {
        e.stopImmediatePropagation();
        const a = actions()[Number(m[1]) - 1];
        if (a && !a.disabled) pendingAction(a);
      }
    }
  }, true);

  const alive = () => fight.E.filter((e) => e.hp > 0);
  const tgt = () => (fight.target?.hp > 0 ? fight.target : (fight.target = alive()[0]));
  function actions() {
    const f = fight;
    const w = weapon();
    const list = [{ label: `⚔️ Attack (${w.name}, ${w.dice}${toHit() >= 0 ? ' +' : ' '}${toHit()} to hit)`, run: () => attack(tgt()) }];
    for (const [l, id] of cls().abilities) {
      if (lvl() < l || ABILITIES[id].passive) continue;
      const A = ABILITIES[id];
      const used = f.uses[id] || 0;
      const noSlot = A.slot && slotsLeft() < A.slot;
      const noUse = A.perFight && used >= A.perFight;
      list.push({ label: `${A.icon} ${A.name}${A.slot ? ' (slot)' : ''}${A.perFight ? ` ${A.perFight - used}/${A.perFight}` : ''}`, disabled: noSlot || noUse, run: () => ability(id) });
    }
    for (const [id, p] of Object.entries(POTIONS)) {
      if (st.potions[id] > 0) list.push({ label: `${p.icon} ${p.name} (${st.potions[id]})`, run: () => drink(id) });
    }
    list.push({ label: '🏃 Flee (DEX check DC 12)', disabled: f.noFlee, run: () => flee() });
    return list;
  }

  async function startCombat(group, { title, boss, roamer, spot } = {}) {
    if (fight || !st?.cls) return;
    const E = group.map((id) => {
      const d = MONSTERS[id];
      const hp = d.hp;
      return { ...d, id, hp, maxHp: hp, stun: 0, rechargeReady: true, burned: false, undyingUsed: false };
    });
    // Duplicate names get letters
    const counts = {};
    for (const e of E) counts[e.name] = (counts[e.name] || 0) + 1;
    const seen = {};
    for (const e of E) if (counts[e.name] > 1) e.name = `${e.name} ${String.fromCharCode(65 + (seen[e.name] = (seen[e.name] || 0) + 1) - 1)}`;
    fight = { E, title: title || 'Battle', round: 1, uses: {}, target: E[0], hidden: false, adv: false, prone: false, stunned: 0, shieldUp: false, guardians: 0, ds: 0, df: 0, myTurn: false, noFlee: !!boss, roamer, spot, boss, fireRes: st.items.emberCrown || st.flags.fireRes > Date.now(), result: null };
    logLines.length = 0;
    lockInput(true);
    cb.style.display = 'block';
    log(`⚔️ ${E.map((e) => e.name).join(', ')} ${E.length > 1 ? 'attack' : 'attacks'}!`, '#ffd27a');
    // Initiative
    const mine = roll(1, 20) + M('DEX');
    const theirs = roll(1, 20) + Math.max(...E.map((e) => e.dex || 0));
    await showRoll('Initiative', 20, mine - M('DEX'), `you ${mine} vs enemies ${theirs}`);
    log(`🎲 Initiative: you ${mine}, enemies ${theirs}. ${mine >= theirs ? 'You go first!' : 'They go first!'}`);
    let playerFirst = mine >= theirs;
    while (!fight.result) {
      if (playerFirst) await playerTurn();
      playerFirst = true;
      if (fight.result) break;
      await enemyTurn();
      fight.round++;
      drawCombat();
    }
    await endCombat();
  }

  async function playerTurn() {
    const f = fight;
    f.shieldUp = false;
    if (st.hp <= 0) return deathSave();
    if (f.stunned > 0) {
      f.stunned--;
      log('💫 You are stunned and lose your turn!', '#ff8a6a');
      await sleep(700);
      return;
    }
    // Spirit Guardians burn everyone at the start of your turn
    if (f.guardians > 0) {
      f.guardians--;
      for (const e of alive()) await hurt(e, rollExpr('3d8'), 'radiant', '👼 Spirit Guardians sear');
      if (checkWin()) return;
    }
    f.myTurn = true;
    drawCombat();
    const action = await new Promise((resolve) => (pendingAction = resolve));
    pendingAction = null;
    f.myTurn = false;
    drawCombat();
    await action.run();
    checkWin();
  }

  // One weapon (or spell) attack roll against a target
  async function attackRoll(e, { bonus, label, adv = false, dis = false, critOn = 20 }) {
    const a = roll(1, 20), b = roll(1, 20);
    const nat = adv && !dis ? Math.max(a, b) : dis && !adv ? Math.min(a, b) : a;
    const total = nat + bonus;
    const crit = nat >= critOn;
    const hit = crit || (nat !== 1 && total >= e.ac);
    await showRoll(`${label}${adv && !dis ? ' (advantage)' : dis && !adv ? ' (disadvantage)' : ''}`, 20, nat, `${nat} + ${bonus} = ${total} vs AC ${e.ac} · ${crit ? 'CRITICAL!' : hit ? 'HIT' : 'MISS'}`);
    return { hit, crit };
  }
  async function hurt(e, dmg, type, verb) {
    if (e.vuln && e.vuln === type) dmg *= 2;
    if (type === 'fire') e.burned = true;
    e.hp -= dmg;
    log(`${verb} ${e.name} for <b>${dmg}</b> ${type} damage${e.vuln === type ? ' (vulnerable!)' : ''}.`);
    if (e.hp <= 0 && e.undying && !e.undyingUsed && type !== 'radiant') {
      e.undyingUsed = true;
      if (roll(1, 20) + 2 >= 5 + dmg) {
        e.hp = 1;
        log(`🧟 ${e.name} refuses to die!`, '#a8d880');
      }
    }
    if (e.hp <= 0) log(`☠️ ${e.name} falls!`, '#ffd27a');
    drawCombat();
  }
  async function attack(e, { extraHit = 0, extraDmg = 0, extraDice = null, label = 'Attack' } = {}) {
    const f = fight;
    const w = weapon();
    const adv = f.hidden || f.adv;
    const { hit, crit } = await attackRoll(e, { bonus: toHit() + extraHit, label: `${label}: ${w.name}`, adv, dis: f.prone, critOn: hasAbility('champion') ? 19 : 20 });
    const sneak = st.cls === 'rogue' && (adv || f.round === 1);
    f.hidden = false;
    f.adv = false;
    f.prone = false;
    if (!hit) {
      log(`💨 You miss ${e.name}.`, '#bba');
      return;
    }
    let dmg = rollExpr(w.dice, crit) + M(wStat(w)) + (w.bonus || 0) + extraDmg;
    if (w.extra) dmg += rollExpr(w.extra, crit);
    if (extraDice) dmg += rollExpr(extraDice, crit);
    if (sneak) {
      const s = rollExpr(`${Math.ceil(lvl() / 2)}d6`, crit);
      dmg += s;
      log(`🗡️ Sneak Attack! +${s}`, '#7affc8');
    }
    await hurt(e, Math.max(1, dmg), w.extraType && w.extra ? w.extraType : w.type, crit ? '💥 CRITICAL! You strike' : '⚔️ You hit');
  }
  async function saveRoll(e, stat, dc) {
    const bonus = stat === 'DEX' ? e.dex || 0 : (e.boss ? 4 : 1);
    const nat = roll(1, 20);
    const ok = nat + bonus >= dc;
    log(`🎲 ${e.name} ${stat} save: ${nat}+${bonus} vs DC ${dc} · ${ok ? 'saved' : 'failed'}`);
    return ok;
  }
  function useSlot() {
    st.slotsUsed++;
  }
  async function ability(id) {
    const f = fight;
    f.uses[id] = (f.uses[id] || 0) + 1;
    if (ABILITIES[id].slot) useSlot();
    const e = tgt();
    switch (id) {
      case 'power':
        return attack(e, { extraHit: -3, extraDmg: 6, label: 'Power Attack' });
      case 'secondWind': {
        const h = rollExpr('1d10') + lvl();
        st.hp = Math.min(maxHp(), st.hp + h);
        return log(`🌬️ Second Wind! You recover ${h} HP.`, '#7affc8');
      }
      case 'cleave':
        for (const en of alive()) await attack(en, { label: 'Cleave' });
        return;
      case 'surge':
        await attack(e, { label: 'Action Surge 1' });
        if (alive().length) await attack(tgt(), { label: 'Action Surge 2' });
        return;
      case 'firebolt': {
        const { hit, crit } = await attackRoll(e, { bonus: spellHit(), label: 'Fire Bolt' });
        if (hit) await hurt(e, rollExpr(lvl() >= 5 ? '2d10' : '1d10', crit), 'fire', '🔥 Your Fire Bolt scorches');
        else log('🔥 The Fire Bolt misses.', '#bba');
        return;
      }
      case 'missile':
        for (let i = 0; i < 3 + Math.floor(lvl() / 4); i++) {
          const t = alive()[i % alive().length];
          if (t) await hurt(t, rollExpr('1d4+1'), 'force', '✴️ A magic missile strikes');
        }
        return;
      case 'shield':
        f.shieldUp = true;
        return log('🔰 A shimmering Shield springs up: +5 AC!', '#7ab8ff');
      case 'scorch':
        for (let i = 0; i < 3; i++) {
          const t = tgt();
          if (!t) break;
          const { hit, crit } = await attackRoll(t, { bonus: spellHit(), label: `Scorching Ray ${i + 1}` });
          if (hit) await hurt(t, rollExpr('2d6', crit), 'fire', '☄️ A ray burns');
        }
        return;
      case 'fireball':
      case 'cone': {
        const stat = id === 'fireball' ? 'DEX' : 'CON';
        for (const en of alive()) {
          let d = rollExpr('8d6');
          if (id === 'cone') d = rollExpr('8d8');
          if (await saveRoll(en, stat, saveDC())) d = Math.floor(d / 2);
          await hurt(en, d, id === 'fireball' ? 'fire' : 'cold', id === 'fireball' ? '💥 The Fireball engulfs' : '❄️ The cone of cold freezes');
        }
        return;
      }
      case 'hide': {
        const ok = await check('DEX', 12, 'Hide');
        fight.hidden = ok;
        return log(ok ? '🌫️ You melt into the shadows. Your next attack has advantage!' : '👀 They spot you.', ok ? '#7affc8' : '#bba');
      }
      case 'poison':
        return attack(e, { extraDice: '2d6', label: 'Poisoned Blade' });
      case 'offhand':
        await attack(e, { label: 'Main hand' });
        if (tgt()) {
          const t = tgt();
          const { hit, crit } = await attackRoll(t, { bonus: toHit(WEAPONS.dagger), label: 'Off-hand dagger' });
          if (hit) await hurt(t, rollExpr('1d6', crit), 'pierce', '🔪 Your off-hand dagger stabs');
        }
        return;
      case 'flame':
        if (!(await saveRoll(e, 'DEX', saveDC()))) await hurt(e, rollExpr(lvl() >= 5 ? '2d8' : '1d8'), 'radiant', '🕯️ Sacred Flame burns');
        else log(`🕯️ ${e.name} dodges the Sacred Flame.`, '#bba');
        return;
      case 'cure': {
        const h = rollExpr(`${Math.floor(lvl() / 3) + 1}d8`) + M('WIS');
        st.hp = Math.min(maxHp(), st.hp + h);
        return log(`💚 Cure Wounds heals you for ${h}.`, '#7affc8');
      }
      case 'guiding': {
        const { hit, crit } = await attackRoll(e, { bonus: spellHit(), label: 'Guiding Bolt' });
        if (hit) {
          await hurt(e, rollExpr('4d6', crit), 'radiant', '🌟 Guiding Bolt blasts');
          fight.adv = true;
        } else log('🌟 The Guiding Bolt misses.', '#bba');
        return;
      }
      case 'turn': {
        const undead = alive().filter((en) => en.undead);
        if (!undead.length) return log('☀️ There are no undead here to turn.', '#bba');
        for (const en of undead) if (!(await saveRoll(en, 'WIS', saveDC()))) {
          en.stun = 2;
          log(`☀️ ${en.name} recoils from your holy symbol!`, '#ffd27a');
        }
        return;
      }
      case 'spirit':
        fight.guardians = 3;
        return log('👼 Spirit Guardians swirl around you!', '#ffd27a');
      case 'massHeal':
        st.hp = Math.min(maxHp(), st.hp + 70);
        fight.prone = false;
        fight.stunned = 0;
        return log('🌈 Divine light washes over you: +70 HP!', '#7affc8');
    }
  }
  async function drink(id) {
    const p = POTIONS[id];
    st.potions[id]--;
    if (p.heal) {
      const h = rollExpr(p.heal);
      st.hp = Math.min(maxHp(), Math.max(0, st.hp) + h);
      await showRoll(`${p.name}`, Number(p.heal.split('d')[1].split('+')[0]), h, `healed ${h}`, true);
      log(`🧪 You drink a ${p.name} and heal ${h}.`, '#7affc8');
    }
    if (p.fireRes) {
      st.flags.fireRes = Date.now() + 10 * 60000;
      fight.fireRes = true;
      log('🧯 Fire Resistance! Fire does half damage to you for 10 minutes.', '#7ab8ff');
    }
    save();
  }
  async function flee() {
    if (await check('DEX', 12, 'Flee')) fight.result = 'fled';
    else log('🏃 You try to run but they cut you off!', '#ff8a6a');
  }
  function checkWin() {
    if (fight && !fight.result && alive().length === 0) fight.result = 'win';
    return fight?.result;
  }

  async function enemyTurn() {
    const f = fight;
    for (const e of alive()) {
      if (f.result) return;
      // Trolls regenerate unless burned
      if (e.regen) {
        if (!e.burned) {
          e.hp = Math.min(e.maxHp, e.hp + e.regen);
          log(`💚 ${e.name} regenerates ${e.regen} HP! (fire stops it)`, '#a8d880');
        }
        e.burned = false;
      }
      if (e.stun > 0) {
        e.stun--;
        log(`💫 ${e.name} is stunned.`, '#bba');
        continue;
      }
      if (st.hp <= 0) {
        log(`${e.name} looms over your body...`, '#bba');
        continue;
      }
      // Dragon breath (recharges on a 5-6)
      if (e.breath) {
        if (!e.rechargeReady && roll(1, 6) >= 5) e.rechargeReady = true;
        if (e.rechargeReady && (f.round % 2 === 1 || e.hp < e.maxHp / 2)) {
          e.rechargeReady = false;
          let d = rollExpr(e.breath);
          log(`🔥🔥 ${e.name} breathes a torrent of FIRE!`, '#ff6a3a');
          const ok = await check('DEX', e.breathDC, 'dodge the dragonfire');
          if (ok) d = hasAbility('evasion') ? 0 : Math.floor(d / 2);
          if (f.fireRes) d = Math.floor(d / 2);
          await takeDamage(d, `${e.name}'s breath`, f.fireRes ? ' (the Ember Crown shields you!)' : '');
          continue;
        }
      }
      for (let i = 0; i < (e.n || 1); i++) {
        if (st.hp <= 0 || f.result) break;
        const nat = roll(1, 20);
        const myAc = ac() + (f.shieldUp ? 5 : 0);
        const crit = nat === 20;
        const hit = crit || (nat !== 1 && nat + e.atk >= myAc);
        await showRoll(`${e.name} ${e.verb || 'attacks'}`, 20, nat, `${nat} + ${e.atk} = ${nat + e.atk} vs your AC ${myAc} · ${crit ? 'CRITICAL!' : hit ? 'HIT' : 'MISS'}`, true);
        if (!hit) {
          log(`🛡️ ${e.name} misses you.`, '#bba');
          continue;
        }
        let d = rollExpr(e.dmg, crit);
        if (e.fire && f.fireRes) d = Math.floor(d / 2);
        if (hasAbility('uncanny') && !f.uncannyUsed) {
          f.uncannyUsed = true;
          d = Math.floor(d / 2);
          log('💨 Uncanny Dodge halves the blow!', '#7affc8');
        }
        await takeDamage(d, e.name, crit ? ' (critical!)' : '');
        if (st.hp <= 0) break;
        if (e.poison && !(await check('CON', 11, 'resist poison'))) await takeDamage(rollExpr(e.poison), 'poison');
        if (e.paralyze && !(await check('CON', 10, 'resist paralysis'))) {
          f.stunned = 1;
          log('💫 You are paralyzed!', '#ff8a6a');
        }
        if (e.prone && Math.random() < 0.3) {
          f.prone = true;
          log(`🤕 ${e.name} knocks you prone! (disadvantage on your next attack)`, '#ff8a6a');
        }
        if (e.drain) {
          e.hp = Math.min(e.maxHp, e.hp + Math.floor(d / 2));
          log(`🩸 ${e.name} drains your life!`, '#ff8a6a');
        }
      }
    }
    f.uncannyUsed = false;
  }
  async function takeDamage(d, from, note = '') {
    const was = st.hp;
    st.hp -= d;
    log(`🩸 ${from} hits you for <b>${d}</b>${note}.`, '#ff8a6a');
    game.player.onDamage?.();
    if (st.hp <= 0 && was > 0) {
      st.hp = 0;
      fight.ds = fight.df = 0;
      log('💀 You fall unconscious! Death saves begin...', '#ff5a4a');
    } else if (st.hp <= 0) {
      fight.df++;
      log('💀 Hit while down: a failed death save!', '#ff5a4a');
      if (fight.df >= 3) fight.result = 'dead';
    }
    drawCombat();
  }
  async function deathSave() {
    const f = fight;
    const nat = roll(1, 20);
    await showRoll('Death save', 20, nat, nat === 20 ? 'NATURAL 20! You rise!' : nat >= 10 ? 'success' : nat === 1 ? 'TWO failures' : 'failure');
    if (nat === 20) {
      st.hp = 1;
      log('✨ A natural 20! You surge back to your feet with 1 HP!', '#ffd23d');
    } else if (nat >= 10) {
      f.ds++;
      if (f.ds >= 3) {
        st.hp = 1;
        log('✨ Three successes: you stagger back up with 1 HP!', '#7affc8');
      }
    } else {
      f.df += nat === 1 ? 2 : 1;
      if (f.df >= 3) f.result = 'dead';
    }
    drawCombat();
  }

  async function endCombat() {
    const f = fight;
    if (f.result === 'win') {
      let xp = 0, gold = 0;
      for (const e of f.E) {
        xp += e.xp;
        gold += e.gold[0] + Math.floor(Math.random() * (e.gold[1] - e.gold[0] + 1));
        st.kills++;
        const traits = [e.undead && 'undead', e.id.startsWith('orc') && 'orc', e.id.startsWith('goblin') && 'goblin', e.id === 'gruk' && 'goblin'].filter(Boolean);
        emit({ t: 'kill', of: e.id, traits });
      }
      st.gold += gold;
      log(`🏆 Victory! +${xp} XP, +${gold} gold`, '#ffd23d');
      // Loot
      const r = Math.random();
      if (r < 0.3) {
        const p = lvl() >= 7 ? 'superior' : lvl() >= 4 ? 'greater' : 'healing';
        st.potions[p] = (st.potions[p] || 0) + 1;
        log(`🎁 You find a ${POTIONS[p].name}!`, '#7affc8');
      }
      if (f.boss) {
        st.flags[`dead:${f.boss}`] = 1;
        emit({ t: 'boss', of: f.boss });
        if (f.boss === 'gruk' && !st.weapons.includes('cleaver')) {
          st.weapons.push('cleaver');
          log("🎁 You take Gruk's Cleaver +1!", '#ffd23d');
        }
        if (f.boss === 'ignaroth' && !st.weapons.includes('dragonslayer')) {
          st.weapons.push('dragonslayer');
          log('🎁 From the dragon\'s hoard: DRAGONSLAYER +3!', '#ffd23d');
        }
        if (f.boss !== 'brawl') announce(`⚔️ defeated ${f.E[0].name}!`);
      }
      if (f.roamer) realm.killRoamer(f.roamer);
      gainXp(xp);
    } else if (f.result === 'fled') {
      log('🏃 You escape!', '#bba');
      if (f.roamer) {
        f.roamer.g.position.add(new THREE.Vector3(8, 0, 8));
      }
    } else if (f.result === 'dead') {
      log('☠️ Darkness takes you...', '#ff5a4a');
    }
    save();
    drawCombat();
    await sleep(f.result === 'win' ? 2200 : 1600);
    cb.style.display = 'none';
    lockInput(false);
    const result = f.result;
    fight = null;
    graceT = 3;
    if (result === 'dead') {
      const lost = Math.floor(st.gold * 0.2);
      st.gold -= lost;
      st.hp = Math.ceil(maxHp() / 2);
      teleport(game.player, 545, Y + 0.5, -18);
      say('Sister Maren', `You wake on a cot in the temple. "We found you half-dead and dragged you back. The Dawn isn't done with you yet." (You lost ${lost} gold.)`, [['Thank you, Sister', closeDlg]]);
      save();
    }
  }

  // =================== Talking ===================
  const npcName = (id) => realm.NPCS.find((n) => n.id === id)?.name || id;
  const LINES = {
    brannoc: ['Embervale has stood for three hundred years. I\'d like it to stand three hundred more.'],
    maren: ['May the Dawn light your path.', 'The dead should stay where we put them.'],
    bram: ['Rumor has it the troll on the mountain bridge loves a good argument... or a full purse.', 'They say a dragon sleeps under Dragon\'s Peak. Sleeps. Let\'s keep it that way.'],
    hilda: ['A good blade is half the fight. The other half is not dying.'],
    wren: ['Moonpetals, mandrake, a pinch of luck. That\'s potion-making.'],
    garrick: ['The woods aren\'t safe anymore. Watch for spiders as big as ponies.'],
    agatha: ['Back in my day, heroes wiped their boots.'],
    pip: ['🎵 Oh the dragon wakes and the mountain shakes... 🎵', 'Fancy a game of Dragon Bones? Highest d20 wins!'],
    durin: ['Steel and stone, lad. Steel and stone.'],
    thora: ['Dwarven steel. Costs a fortune. Worth two.'],
    grimtooth: ['NOBODY CROSSES GRIMTOOTH\'S BRIDGE.'],
  };
  function talk(n) {
    if (n.id === 'grimtooth') return trollTalk();
    const opts = [];
    for (const [id, qs] of Object.entries(st.quests)) {
      const q = qById(id);
      if (qs.stage === 'turnin' && q.turnIn === n.id) opts.push([`✅ ${q.title}: report`, () => say(n.name, q.done, [[`Claim your reward (${q.xp} XP${q.gold ? `, ${q.gold} gold` : ''})`, () => {
        complete(q);
        talk(n);
      }]])]);
    }
    for (const q of offersFrom(n.id)) {
      opts.push([`${isStory(q) ? '⭐' : '❗'} ${q.title}`, () => say(n.name, `${q.offer}\n\nReward: ${q.xp} XP${q.gold ? `, ${q.gold} gold` : ''}`, [[`Accept: ${q.title}`, () => {
        accept(q);
        closeDlg();
      }], ['Not yet', () => talk(n)]])]);
    }
    const svc = SERVICES[n.id];
    if (svc) for (const [label, fn] of svc) opts.push([label, () => fn(n)]);
    opts.push(bye);
    const lines = LINES[n.id] || ['...'];
    say(`${n.name} · ${n.tag ? realm.NPCS.find((x) => x.id === n.id).role : ''}`, st.title && n.id === 'brannoc' ? 'Dragonslayer! The whole realm owes you.' : lines[Math.floor(Math.random() * lines.length)], opts);
  }
  function shop(n, items, kind) {
    const opts = items.map((id) => {
      const it = kind === 'weapon' ? WEAPONS[id] : kind === 'armor' ? ARMOR[id] : POTIONS[id];
      const owned = kind === 'weapon' ? st.weapons.includes(id) : kind === 'armor' ? st.armors.includes(id) : false;
      const desc = kind === 'weapon' ? `${it.dice}${it.bonus ? ` +${it.bonus}` : ''}${it.extra ? ` +${it.extra} ${it.extraType}` : ''} ${it.stat === 'finesse' ? '(finesse)' : ''}` : kind === 'armor' ? `AC ${it.base}${it.maxDex === null ? ' + DEX' : it.maxDex ? ` + DEX (max ${it.maxDex})` : ''} · ${it.type}` : it.heal ? `heals ${it.heal}` : 'halves fire damage for 10 min';
      const allowed = kind !== 'armor' || ARMOR_OK[cls().armor].includes(it.type);
      if (owned) return [`✔ ${it.name}: ${desc}${(kind === 'weapon' ? st.weapon : st.armor) === id ? ' (equipped)' : ': equip'}`, () => {
        if (kind === 'weapon') st.weapon = id;
        else st.armor = id;
        save();
        shop(n, items, kind);
      }, (kind === 'weapon' ? st.weapon : st.armor) === id];
      return [`${it.name}: ${desc} · ${it.cost} gold${allowed ? '' : ` (your class can't wear ${it.type} armor)`}`, () => {
        if (st.gold < it.cost) return;
        st.gold -= it.cost;
        if (kind === 'weapon') {
          st.weapons.push(id);
          st.weapon = id;
        } else if (kind === 'armor') {
          st.armors.push(id);
          st.armor = id;
        } else st.potions[id] = (st.potions[id] || 0) + 1;
        save();
        shop(n, items, kind);
      }, st.gold < it.cost || !allowed];
    });
    if (kind === 'armor' && cls().shield && !st.shield) opts.push(['Shield: +2 AC · 10 gold', () => {
      if (st.gold < 10) return;
      st.gold -= 10;
      st.shield = true;
      save();
      shop(n, items, kind);
    }, st.gold < 10]);
    opts.push(['Back', () => talk(n)]);
    say(n.name, `You have ${st.gold} gold. AC ${ac()} · ${weapon().name}`, opts);
  }
  const SERVICES = {
    hilda: [['⚔️ Weapons', (n) => shop(n, ['dagger', 'mace', 'staff', 'longsword', 'rapier', 'warhammer', 'greataxe'], 'weapon')], ['🛡️ Armor', (n) => shop(n, ['leather', 'studded', 'chainshirt', 'breastplate', 'chainmail', 'splint'], 'armor')]],
    thora: [['⚔️ Dwarven weapons', (n) => shop(n, ['longsword1', 'rapier1', 'mace1', 'staff1', 'greataxe2', 'flametongue'], 'weapon')], ['🛡️ Dwarven armor', (n) => shop(n, ['elven', 'breastplate', 'plate', 'robes'], 'armor')], ['🧪 Potions', (n) => shop(n, ['greater', 'superior', 'fireRes'], 'potion')]],
    wren: [['🧪 Potions', (n) => shop(n, ['healing', 'greater', 'fireRes'], 'potion')]],
    bram: [['🛏️ Rent a room and rest (10 gold): full HP and spells', (n) => {
      if (st.gold < 10) return say(n.name, 'Ten gold for the room, friend.', [bye]);
      st.gold -= 10;
      st.hp = maxHp();
      st.slotsUsed = 0;
      save();
      say(n.name, 'You sleep like a log and wake refreshed. HP and spell slots restored!', [bye]);
    }], ['🍺 Any rumors?', (n) => say(n.name, LINES.bram[Math.floor(Math.random() * LINES.bram.length)], [['Back', () => talk(n)]])]],
    maren: [['🙏 Healing prayer (free once you\'re below half)', (n) => {
      if (st.hp >= maxHp() / 2) return say(n.name, 'You look well enough, child. Go with the Dawn.', [['Back', () => talk(n)]]);
      st.hp = maxHp();
      save();
      say(n.name, 'Warm light fills you. Your wounds close.', [['Back', () => talk(n)]]);
    }]],
    pip: [['🎲 Play Dragon Bones (bet 10 gold)', (n) => dragonBones(n, 10)], ['🎲 Play Dragon Bones (bet 50 gold)', (n) => dragonBones(n, 50)], ['🎵 Sing me a song', (n) => say(n.name, '🎵 Oh, the hero came from the starry portal, with a d20 and a will immortal... 🎵 (Pip winks.)', [['Back', () => talk(n)]])]],
  };
  async function dragonBones(n, bet) {
    if (st.gold < bet) return say(n.name, 'Come back with more coin!', [bye]);
    closeDlg();
    const me = roll(1, 20), pip = roll(1, 20);
    await showRoll('Your roll', 20, me, `you rolled ${me}`);
    await showRoll("Pip's roll", 20, pip, `Pip rolled ${pip}`);
    const win = me > pip;
    if (me !== pip) st.gold += win ? bet : -bet;
    save();
    say(n.name, me === pip ? 'A tie! Nobody wins.' : win ? `Bah! You win ${bet} gold.` : `Ha! The bones love me. I take ${bet} gold.`, [['Again', () => dragonBones(n, bet)], ['Back', () => talk(n)]]);
  }
  // The troll bridge: talk, pay, or fight
  function trollTalk() {
    if (st.flags.bridge) return say('Grimtooth', '"FRIEND CROSS. GRIMTOOTH REMEMBER."', [bye]);
    const pass = () => {
      st.flags.bridge = 1;
      emit({ t: 'check', of: 'bridge' });
      save();
      say('Grimtooth', 'Grimtooth grunts and drags the barricade aside. The way to Kharak is open.', [bye]);
    };
    say('Grimtooth the Bridge Troll', '"NOBODY CROSS GRIMTOOTH BRIDGE. NOT FOR FREE. NOT EVER." He picks his teeth with a femur.', [
      ['🗣️ "Surely a troll as wise as you knows a better deal?" (CHA DC 15)', async () => {
        closeDlg();
        if (await check('CHA', 15, 'Persuade Grimtooth')) pass();
        else say('Grimtooth', '"GRIMTOOTH NOT STUPID. GRIMTOOTH HUNGRY."', [['Pay 100 gold', () => (st.gold >= 100 ? ((st.gold -= 100), pass()) : say('Grimtooth', '"NOT ENOUGH SHINY."', [bye]))], ['⚔️ Fight him', () => {
          closeDlg();
          startCombat(['troll'], { title: "Grimtooth's Bridge", boss: 'troll' }).then(() => st.flags['dead:troll'] && pass());
        }], bye]);
      }],
      [`💰 Pay the toll (100 gold, you have ${st.gold})`, () => {
        if (st.gold < 100) return say('Grimtooth', '"NOT ENOUGH SHINY."', [bye]);
        st.gold -= 100;
        pass();
      }, st.gold < 100],
      ['💪 "Move, or be moved." (STR DC 18)', async () => {
        closeDlg();
        if (await check('STR', 18, 'Shove past Grimtooth')) pass();
        else {
          say('Grimtooth', '"HAHAHA. NOW GRIMTOOTH SMASH."', [['⚔️ Fight!', () => {
            closeDlg();
            startCombat(['troll'], { title: "Grimtooth's Bridge", boss: 'troll' }).then(() => st.flags['dead:troll'] && pass());
          }]]);
        }
      }],
      ['⚔️ Fight Grimtooth', () => {
        closeDlg();
        startCombat(['troll'], { title: "Grimtooth's Bridge", boss: 'troll' }).then(() => st.flags['dead:troll'] && pass());
      }],
      ['Walk away', closeDlg],
    ]);
  }

  // Interactions with places (cage, door, chests, pickups, bosses)
  async function useSpot(s) {
    if (s.kind === 'boss') {
      if (s.boss === 'brawl' && !st.quests.s4) return say('Rowdy bandits', '"What are you looking at?" (Maybe talk to Bram first.)', [bye]);
      if (s.boss === 'ignaroth' && st.story < 7) return say('🐉 The lair', 'A vast red shape sleeps on a mountain of gold. Every breath is a furnace. You are not ready... yet.', [bye]);
      return say(s.label, s.boss === 'ignaroth' ? 'The ground trembles. One great golden eye opens. "A THIEF. HOW... DELICIOUS."' : 'Steel yourself. This will be a hard fight.', [['⚔️ Fight!', () => {
        closeDlg();
        startCombat(s.group, { title: s.label.replace(/^\w+ /, ''), boss: s.boss, spot: s });
      }], ['Not yet', closeDlg]]);
    }
    if (s.kind === 'check') {
      if (s.id === 'cage') {
        return say('🔒 The cage', 'Elsie peers out from between rusty bars. "Please, get me out!" The lock is crude but sturdy.', [
          ['🗝️ Pick the lock (DEX DC 13)', async () => {
            closeDlg();
            if (await check('DEX', 13, 'Pick the lock')) freeElsie();
            else say('🔒 The cage', 'The pick slips. Try again, or try something else.', [bye]);
          }],
          ['💪 Wrench the bars apart (STR DC 13)', async () => {
            closeDlg();
            if (await check('STR', 13, 'Bend the bars')) freeElsie();
            else say('🔒 The cage', 'The bars groan but hold.', [bye]);
          }],
          bye,
        ]);
      }
      if (s.id === 'runedoor') {
        return say('🚪 The rune-sealed door', 'Ancient runes glow pale blue across the stone. Some kind of riddle: a seal of words.', [
          ['📖 Decipher the runes (INT DC 14)', async () => {
            closeDlg();
            if (await check('INT', 14, 'Decipher the runes')) openDoor();
            else say('🚪', 'The words swim before your eyes. Try again.', [bye]);
          }],
          ['🙏 Pray for guidance (WIS DC 14)', async () => {
            closeDlg();
            if (await check('WIS', 14, 'Seek guidance')) openDoor();
            else say('🚪', 'Silence answers.', [bye]);
          }],
          bye,
        ]);
      }
      return;
    }
    if (s.kind === 'pick') {
      if (s.check && !(await check(s.check, s.dc, 'Read the tablet'))) return game.chat('📜 The ancient script is too hard to read. Try again.', true);
      st.picked[s.id] = 1;
      st.items[s.item] = (st.items[s.item] || 0) + 1;
      game.chat(s.item === 'tablet' ? '📜 You decipher the tablet: "...the crown of embers, forged to quiet the wyrm\'s dreams..."' : `✋ You picked up: ${s.item}`, true);
      emit({ t: 'pick', of: s.item });
      save();
      return;
    }
    if (s.kind === 'chest') {
      if (s.locked && !(await check('DEX', 12, 'Pick the lock'))) return game.chat('🔒 The lock holds. Try again.', true);
      st.picked[s.id] = 1;
      const g = 15 + Math.floor(Math.random() * 40) * (1 + Math.floor(lvl() / 2));
      st.gold += g;
      const p = lvl() >= 5 ? 'greater' : 'healing';
      st.potions[p] = (st.potions[p] || 0) + 1;
      game.chat(`🎁 Treasure! +${g} gold and a ${POTIONS[p].name}`, true);
      save();
    }
  }
  function freeElsie() {
    st.flags.cage = 1;
    emit({ t: 'check', of: 'cage' });
    save();
    say('Elsie', '"You came! Thank you, thank you!" She bolts for the village. Behind you, a huge goblin in a dented helmet roars. Gruk.', [bye]);
  }
  function openDoor() {
    st.flags.runedoor = 1;
    emit({ t: 'check', of: 'runedoor' });
    save();
    say('🚪', 'The runes flare and the great door grinds open. Cold air rolls out... and something stirs inside.', [bye]);
  }

  // =================== Character sheet (K) ===================
  const sheet = panel({ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(760px,94vw)', maxHeight: '86vh', overflowY: 'auto', padding: '16px 18px' });
  let sheetOpen = false;
  function drawSheet() {
    const c = cls();
    const L = lvl();
    const next = XP_TABLE[L] ?? null;
    const abil = c.abilities.map(([l, id]) => `<div style="opacity:${L >= l ? 1 : 0.4}">${ABILITIES[id].icon} <b>${ABILITIES[id].name}</b> <span style="font-size:12px">(lv ${l})</span>: ${ABILITIES[id].desc}</div>`).join('');
    const quests = Object.keys(st.quests).map((id) => `<div>${isStory(qById(id)) ? '⭐' : '❗'} <b>${qById(id).title}</b>: ${label(id)}</div>`).join('') || '<div style="opacity:0.6">No quests. Talk to the villagers!</div>';
    sheet.innerHTML = `<div style="display:flex;justify-content:space-between"><h3>${c.icon} ${game.player.name} · Level ${L} ${c.name}${st.title ? ` · ${st.title}` : ''}</h3><button class="dnd-btn" style="width:auto" data-x>✕</button></div>
      <div>XP ${st.xp}${next ? ` / ${next}` : ' (max level)'} · ❤️ ${st.hp}/${maxHp()} · 🛡️ AC ${ac()} · 🪙 ${st.gold} gold · proficiency +${prof(L)}${slotsMax() ? ` · ✨ ${slotsLeft()}/${slotsMax()} spell slots` : ''}</div>
      <div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap">${STATS.map((s) => `<div style="border:1px solid #8a6a3a;border-radius:8px;padding:6px 10px;text-align:center;min-width:64px"><div style="font-size:12px;color:#d8c098">${s}</div><div style="font:700 20px Georgia">${st.stats[s]}</div><div>${M(s) >= 0 ? '+' : ''}${M(s)}</div></div>`).join('')}</div>
      <div>⚔️ <b>${weapon().name}</b> (${weapon().dice}${weapon().bonus ? ` +${weapon().bonus}` : ''}, +${toHit()} to hit) · 🛡️ ${st.armor ? ARMOR[st.armor].name : 'no armor'}${st.shield ? ' + shield' : ''}</div>
      <div style="margin:4px 0">Weapons: ${st.weapons.map((w) => `<button class="dnd-btn" style="display:inline-block;width:auto;padding:3px 8px" data-w="${w}" ${st.weapon === w ? 'disabled' : ''}>${WEAPONS[w].name}</button>`).join('')}</div>
      <div>🧪 ${Object.entries(st.potions).filter(([, n]) => n > 0).map(([id, n]) => `${POTIONS[id].name} ×${n}`).join(' · ') || 'no potions'}${st.items.emberCrown ? ' · 👑 Ember Crown (fire resistance)' : st.items.crownShard ? ' · 🔶 Ember Crown shard' : ''}</div>
      <h3 style="margin-top:12px">Abilities</h3>${abil}
      <h3 style="margin-top:12px">Quests</h3>${quests}
      <div style="opacity:0.6;font-size:12px;margin-top:10px">Story: chapter ${Math.min(st.story + 1, QUESTS.length)} of ${QUESTS.length} · ${st.kills} foes defeated · waystones: ${st.waystones.map((w) => ZONES[w].name).join(', ')}</div>`;
  }
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-x]')) return toggleSheet(false);
    const w = e.target.closest('[data-w]');
    if (w) {
      st.weapon = w.dataset.w;
      save();
      drawSheet();
    }
  });
  function toggleSheet(on) {
    if (on === sheetOpen) return;
    sheetOpen = on;
    sheet.style.display = on ? 'block' : 'none';
    lockInput(on);
    if (on) drawSheet();
  }
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyK' || !game.player || fight || dlgOpen || !st?.cls) return;
    if (!realm.inRealm(game.player.position) && !sheetOpen) return;
    if (!sheetOpen && !input.enabled) return;
    toggleSheet(!sheetOpen);
  });

  // =================== E: talk / use / travel ===================
  let action = null;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || dlgOpen || fight || sheetOpen || !input.enabled || !game.player) return;
    action?.();
  });
  function travelMenu(from) {
    say('🪨 Waystone', 'The rune glows under your hand. Where to?', [
      ...st.waystones.filter((z) => z !== from).map((z) => [`✨ ${ZONES[z].name}`, () => {
        const w = realm.waystones.find((x) => x.zone === z);
        closeDlg();
        teleport(game.player, w.pos.x + 2, w.pos.y + 0.5, w.pos.z + 2);
        game.chat(`✨ You step through the waystone to ${ZONES[z].name}.`, true);
      }]),
      bye,
    ]);
  }

  // =================== Per frame ===================
  let owner = null, cooldown = 0, graceT = 0, regenT = 0, lastZone = null;
  const _p = new THREE.Vector3();
  game.addSystem((dt) => {
    const player = game.player;
    if (player !== owner) {
      owner = player;
      load(player.name || 'Hero');
    }
    const p = player.position;
    const here = realm.inRealm(p);
    cooldown = Math.max(0, cooldown - dt);
    graceT = Math.max(0, graceT - dt);
    const t = performance.now() / 1000;

    // Portal near spawn
    const pp = realm.portal.position;
    pp.set(realm.PORTAL.x, game.world.terrain.groundHeight(realm.PORTAL.x, realm.PORTAL.z), realm.PORTAL.z);
    realm.portal.userData.ring.rotation.y += dt * 0.8;
    realm.homePortal.userData.ring.rotation.y += dt * 0.8;
    if (cooldown === 0) {
      if (Math.hypot(p.x - pp.x, p.z - pp.z) < 1.3 && Math.abs(p.y - pp.y) < 3) {
        cooldown = 2;
        teleport(player, realm.arrive.x, realm.arrive.y, realm.arrive.z);
        game.chat('📜 You step into the Realm of Embervale...', true);
        if (!st.cls) setTimeout(createHero, 400);
      } else if (here && p.distanceTo(realm.homePortal.position.clone().setY(p.y)) < 1.3) {
        cooldown = 2;
        player.respawn();
      }
    }
    realm.root.visible = here || p.distanceTo(realm.arrive) < 600;
    hudEl.style.display = here && st.cls ? 'block' : 'none';
    if (!here) {
      marker.style.display = prompt.style.display = 'none';
      return;
    }
    if (!st.cls && !dlgOpen && cooldown === 0 && !fight) {
      cooldown = 3;
      createHero();
    }
    // Fell off the realm: back to the nearest waystone you know
    if (p.y < Y - 15) {
      const w = realm.waystones.find((x) => x.zone === (lastZone && st.waystones.includes(lastZone) ? lastZone : 'village'));
      teleport(player, w.pos.x + 2, w.pos.y + 0.5, w.pos.z + 2);
    }
    const zone = realm.zoneAt(p);
    if (zone && zone !== lastZone) {
      lastZone = zone;
      game.chat(`📍 ${ZONES[zone].name}`, true);
      emit({ t: 'reach', of: zone });
    }
    // Slow healing out of combat
    regenT += dt;
    if (!fight && regenT > 4 && st.cls && st.hp < maxHp()) {
      regenT = 0;
      st.hp++;
    }

    // Story bits in the world
    realm.cage.visible = !st.flags.cage;
    realm.runeDoor.visible = !st.flags.runedoor;
    const rdBox = game.world.solidBoxes.find((b) => b.containsPoint(new THREE.Vector3(720, Y + 2.5, 226.5)));
    if (st.flags.runedoor && rdBox) rdBox.makeEmpty();
    if (st.flags.bridge) realm.bridgeGate.visible = false;
    if (st.flags.bridge) {
      const gb = game.world.solidBoxes.find((b) => b.containsPoint(new THREE.Vector3(912, Y + 2, 110)));
      if (gb) gb.makeEmpty();
    }
    for (const n of realm.NPCS) {
      if (n.id === 'grimtooth') n.g.visible = !st.flags['dead:troll'];
      n.tag.material.opacity = Math.min(1, Math.max(0, (camera.position.distanceTo(n.p) - 2) / 2));
      const d = n.p.distanceTo(p);
      if (d < 6) n.g.rotation.y = Math.atan2(-(p.x - n.p.x), -(p.z - n.p.z)) + Math.PI;
    }
    for (const s of realm.SPOTS) {
      if (!s.g) continue;
      const gone = (s.kind === 'boss' && st.flags[`dead:${s.boss}`] && s.boss !== 'brawl') || (s.kind !== 'boss' && st.picked[s.id]) || (s.need && !st.flags[s.need]);
      s.g.visible = !gone && !(s.kind === 'pick' && s.item !== 'tablet' && !Object.values(st.quests).length && false);
      if (s.kind === 'pick' && s.item !== 'tablet') s.g.rotation.y += dt * 2;
      if (s.kind === 'chest' && st.picked[s.id] && s.lid) s.lid.rotation.x = -1.2;
      if (s.kind === 'chest') s.g.visible = true;
    }
    realm.campfire.scale.y = 1 + Math.sin(t * 12) * 0.15;
    for (const w of realm.waystones) {
      const known = st.waystones.includes(w.zone);
      w.rune.material.emissiveIntensity = known ? 1.5 + Math.sin(t * 3) * 0.5 : 0.2;
      if (!known && w.pos.distanceTo(p) < 6 && st.cls) {
        st.waystones.push(w.zone);
        game.chat(`✨ Waystone attuned: ${ZONES[w.zone].name}. Use any waystone (E) to travel here.`, true);
        save();
      }
    }

    // Roaming monsters: wander, and start a fight when they reach you
    for (const r of realm.roamers) {
      if (!r.g) {
        r.respawn -= dt;
        if (r.respawn <= 0) realm.spawnRoamer(r);
        continue;
      }
      const g = r.g;
      const d = g.position.distanceTo(p);
      let speed = 0;
      if (!fight && st.cls && d < 14 && Math.abs(g.position.y - p.y) < 4) {
        // Charge!
        const to = p.clone().sub(g.position).setY(0);
        if (to.length() > 1.5) {
          to.setLength(Math.min(to.length(), 5 * dt));
          g.position.add(to);
          speed = 5;
        }
        g.rotation.y = Math.atan2(to.x, to.z);
        if (d < 2.2 && graceT <= 0) startCombat(r.group, { title: ZONES[r.zone].name, roamer: r });
      } else {
        r.wait -= dt;
        if (r.wait <= 0) {
          r.wait = 3 + Math.random() * 4;
          r.goal = r.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16));
        }
        const to = r.goal.clone().sub(g.position).setY(0);
        if (to.length() > 0.3) {
          to.setLength(Math.min(to.length(), 1.6 * dt));
          g.position.add(to);
          g.rotation.y = Math.atan2(to.x, to.z);
          speed = 1.6;
        }
      }
      for (const [i, l] of (g.userData.legs || []).entries()) l.rotation.x = speed ? Math.sin(t * 9 + i * 1.7) * 0.6 : 0;
      g.userData.tag.material.opacity = Math.min(1, Math.max(0, (d - 2) / 3));
    }

    // What E does here
    action = null;
    let text = '';
    if (!fight && !dlgOpen && st.cls) {
      const npc = realm.NPCS.find((n) => n.g.visible && n.p.distanceTo(p) < (n.id === 'grimtooth' ? 5 : 2.8));
      const spot = realm.SPOTS.find((s) => !s.hidden && s.p.distanceTo(p) < (s.kind === 'boss' ? 4 : 2.6) && !(s.kind === 'boss' && st.flags[`dead:${s.boss}`] && s.boss !== 'brawl') && !(s.kind !== 'boss' && st.picked[s.id]) && !(s.need && !st.flags[s.need]) && !(s.id === 'cage' && st.flags.cage) && !(s.id === 'runedoor' && st.flags.runedoor));
      const stone = realm.waystones.find((w) => w.pos.distanceTo(p) < 2.8);
      if (npc) {
        action = () => talk(npc);
        text = `E: Talk to ${npc.name}`;
      } else if (spot) {
        action = () => useSpot(spot);
        text = `E: ${spot.label}`;
      } else if (stone) {
        action = () => travelMenu(stone.zone);
        text = 'E: Use the waystone (fast travel)';
      }
    }
    prompt.style.display = text ? 'block' : 'none';
    prompt.textContent = text;

    // HUD + waypoint
    if (st.cls) {
      const id = Object.keys(st.quests).sort((a, b) => (isStory(qById(b)) ? 1 : 0) - (isStory(qById(a)) ? 1 : 0))[0];
      const L = lvl();
      hudEl.innerHTML = `<b style="color:#ffd27a">${cls().icon} ${game.player.name}</b> · Lv ${L} ${cls().name}<br>
        ❤️ ${st.hp}/${maxHp()} · 🛡️ ${ac()} · 🪙 ${st.gold}${slotsMax() ? ` · ✨ ${slotsLeft()}` : ''}
        <div class="dnd-bar"><div style="width:${L >= MAX_LEVEL ? 100 : ((st.xp - XP_TABLE[L - 1]) / (XP_TABLE[L] - XP_TABLE[L - 1])) * 100}%;background:#ffd27a"></div></div>
        <div style="margin-top:6px;color:#ffd27a">${id ? `📜 ${qById(id).title}` : QUESTS[st.story] ? `⭐ Talk to ${npcName(QUESTS[st.story].giver)}` : '👑 The realm is at peace'}</div>
        <div style="font-size:12px">${id ? label(id) : ''}</div><div style="font-size:11px;opacity:0.6;margin-top:4px">E talk · K character sheet</div>`;
      // Where to go next
      let target = null;
      if (id) {
        const qs = st.quests[id], q = qById(id);
        if (qs.stage === 'turnin') target = realm.NPCS.find((n) => n.id === q.turnIn)?.p;
        else {
          const s = q.steps[qs.step];
          const spot = realm.SPOTS.find((x) => x.id === s.of || x.boss === s.of || (x.item === s.of && !st.picked[x.id]));
          target = spot?.p || (s.zone && new THREE.Vector3(...ZONES[s.zone].c));
        }
      } else if (QUESTS[st.story]) target = realm.NPCS.find((n) => n.id === QUESTS[st.story].giver)?.p;
      if (target) {
        const tp = target.clone().setY(target.y + 2.5);
        const dist = camera.position.distanceTo(tp);
        _p.copy(tp).project(camera);
        const behind = _p.z > 1;
        let x = (_p.x * 0.5 + 0.5) * innerWidth, y = (-_p.y * 0.5 + 0.5) * innerHeight;
        if (behind) {
          x = innerWidth - x;
          y = innerHeight - 40;
        }
        x = Math.min(innerWidth - 40, Math.max(40, x));
        y = Math.min(innerHeight - 40, Math.max(40, y));
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        marker.querySelector('.md').textContent = `${Math.round(dist)} m`;
        marker.style.display = dist > 5 ? 'block' : 'none';
      } else marker.style.display = 'none';
    }
  });
  net.on('close', () => {
    closeDlg();
    toggleSheet(false);
  });

  return { realm, get state() { return st; }, startCombat, check, talk, save };
}
