// The space RPG journal: press J. Tabs for quests, your ship, cargo and reputation; other
// modules add their own with api.journal.addTab(id, label, render), where render(el, api)
// fills `el` and can put buttons with data-act="..." handled by the tab's onClick(act, value).

import { SHIPS, UPGRADES, SECONDARIES, MATERIALS, GOODS, FACTIONS, standing } from './spaceData.js';

export function setupJournal(api) {
  const { game } = api;
  const { input } = game;
  const tabs = [];
  let current = 'quests';
  let isOpen = false;

  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(820px, 94vw)', height: 'min(620px, 84vh)',
    background: 'rgba(8,14,26,0.96)', border: '1px solid rgba(95,212,255,0.45)', borderRadius: '16px', display: 'none',
    flexDirection: 'column', zIndex: 31, color: '#e6f2ff', font: '14px system-ui, sans-serif', boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
    pointerEvents: 'auto', // #hud ignores the mouse; the journal needs it
  });
  root.innerHTML = `<div style="display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:1px solid rgba(95,212,255,0.2);flex-wrap:wrap">
      <div style="font:800 16px system-ui,sans-serif;color:#7fd8ff;margin-right:10px">📓 Pilot's journal</div>
      <div class="jt" style="display:flex;gap:4px;flex-wrap:wrap;flex:1"></div>
      <button class="btn jx" style="padding:4px 10px">✕</button></div>
    <div class="jc" style="flex:1;overflow-y:auto;padding:14px 16px;line-height:1.5"></div>`;
  document.getElementById('hud').appendChild(root);
  const tabBar = root.querySelector('.jt');
  const content = root.querySelector('.jc');
  root.querySelector('.jx').addEventListener('click', () => close());

  function addTab(id, label, render, onClick) {
    tabs.push({ id, label, render, onClick });
    if (isOpen) draw();
  }
  function draw() {
    tabBar.replaceChildren(...tabs.map((t) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = t.label;
      b.style.cssText = `padding:4px 10px;font-size:13px;${t.id === current ? 'background:#2f6fa8;color:#fff' : ''}`;
      b.addEventListener('click', () => {
        current = t.id;
        draw();
      });
      return b;
    }));
    const tab = tabs.find((t) => t.id === current) || tabs[0];
    content.innerHTML = '';
    tab.render(content, api);
  }
  content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const tab = tabs.find((t) => t.id === current);
    tab?.onClick?.(b.dataset.act, b.dataset.v, api);
    draw();
  });

  function open(tab) {
    if (tab) current = tab;
    isOpen = true;
    root.style.display = 'flex';
    input.enabled = false;
    input.keys.clear();
    document.exitPointerLock?.();
    draw();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.style.display = 'none';
    input.enabled = true;
    if (game.player) input.requestLock();
  }
  window.addEventListener('keydown', (e) => {
    if (!game.player || api.dlgOpen) return;
    if (e.code === 'KeyJ' && (isOpen || input.enabled)) {
      e.stopImmediatePropagation();
      isOpen ? close() : open();
    } else if (isOpen && e.code === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
  }, true);
  game.net.on('close', close);

  // ---------- Helpers for tabs ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = (tag, css, text) => `<${tag} style="${css}">${text}</${tag}>`;
  const btn = (act, v, text, disabled = false) => `<button class="btn" data-act="${act}" data-v="${esc(v)}" ${disabled ? 'disabled' : ''} style="padding:3px 10px;font-size:12px;margin:2px 4px 2px 0">${text}</button>`;
  const section = (title) => h('div', 'font:800 12px system-ui,sans-serif;letter-spacing:1px;color:#7fd8ff;margin:14px 0 6px;text-transform:uppercase', title);
  const card = (inner, color = 'rgba(95,212,255,0.25)') => `<div style="border:1px solid ${color};border-radius:10px;padding:8px 10px;margin-bottom:6px;background:rgba(255,255,255,0.03)">${inner}</div>`;
  const bar = (frac, color) => `<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-top:3px"><div style="height:100%;width:${Math.max(0, Math.min(1, frac)) * 100}%;background:${color}"></div></div>`;
  const ui = { esc, h, btn, section, card, bar };

  // ---------- Quests ----------
  addTab('quests', '📜 Quests', (el) => {
    const st = api.st;
    let html = section('Active');
    const active = api.activeQuests();
    if (!active.length) html += h('div', 'opacity:0.7', 'Nothing yet. Talk to the crew (look for ! over their heads) or grab a contract from a job board.');
    for (const [q, qs] of active) {
      const story = api.isStory(q);
      const focused = st.focus === q.id;
      html += card(`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <div><b style="color:${story ? '#ffd23d' : '#bfe8ff'}">${story ? '⭐' : q.job ? '📋' : '📜'} ${esc(q.title)}</b>
        <div style="opacity:0.85">${esc(api.label(q, qs))}</div>
        <div style="opacity:0.6;font-size:12px">Reward: ${q.reward[0]} cr · ${q.reward[1]} XP</div></div>
        <div style="white-space:nowrap">${btn('focus', q.id, focused ? '◆ Tracking' : 'Track', focused)}${story ? '' : btn('abandon', q.id, 'Abandon')}</div></div>`, focused ? '#ffd23d88' : undefined);
    }
    const sq = api.storyQuest();
    html += section('Story');
    html += h('div', 'opacity:0.85', sq
      ? `Act ${sq.act || 1}: <b>${esc(sq.title)}</b>${st.quests[sq.id] ? '' : ` · talk to ${esc(api.npc(sq.giver)?.name || '?')}`}`
      : 'You finished the story. Legend.');
    html += h('div', 'opacity:0.6;font-size:12px;margin-top:4px', `${st.story} story missions · ${Object.keys(st.done).length} side quests · ${st.jobsDone} contracts done`);
    el.innerHTML = html;
  }, (act, v) => {
    if (act === 'focus') api.st.focus = v;
    if (act === 'abandon') api.abandon(v);
    api.save();
  });

  // ---------- Ship ----------
  addTab('ship', '🚀 Ship', (el) => {
    const st = api.st, S = api.ship.stats, d = SHIPS[st.ship];
    let html = section(`${d.name} · ${d.role}`);
    html += h('div', 'opacity:0.8;margin-bottom:6px', esc(d.desc));
    const rows = [
      ['Top speed', `${Math.round(S.speed)} m/s (boost ×${S.boost})`],
      ['Hull', `${Math.ceil(api.ship.hull)} / ${S.maxHull}`],
      ['Shields', `${Math.ceil(api.ship.shield)} / ${S.maxShield} (recharges ${Math.round(S.shieldRegen)}/s after ${S.shieldDelay.toFixed(1)}s)`],
      ['Laser', `${Math.round(S.laser)} damage · ${S.fireRate.toFixed(1)} shots/s · ${S.laserMode} mode`],
      ['Critical hits', `${Math.round(S.crit * 100)}% for ×${S.critMult}`],
      ['Boost energy', `${S.boostCap.toFixed(1)} s`],
      ['Cargo', `${api.cargoUsed()} / ${api.cargoCap()}`],
      ['Repair kits', `${st.kits} (F in flight)`],
    ];
    if (S.dodge) rows.push(['Dodge', `${Math.round(S.dodge * 100)}%`]);
    if (S.hullRegen) rows.push(['Field repair', `${S.hullRegen.toFixed(1)} hull/s`]);
    html += `<table style="border-collapse:collapse">${rows.map(([a, b]) => `<tr><td style="opacity:0.65;padding:2px 14px 2px 0">${a}</td><td>${b}</td></tr>`).join('')}</table>`;
    html += section('Upgrades');
    html += Object.entries(UPGRADES).map(([k, u]) => `${u.icon} ${u.name} Mk ${(st.upgrades[k] || 0) + 1}`).join(' · ');
    html += section('Secondary weapons');
    html += st.secondaries.map((id) => `${SECONDARIES[id].icon} ${SECONDARIES[id].name}${st.secondary === id ? ' (selected)' : ''}`).join('<br>');
    html += section('Hangar');
    html += st.ships.map((id) => `${SHIPS[id].name}${id === st.ship ? ' (current)' : ''}`).join(' · ') + h('div', 'opacity:0.6;font-size:12px', 'Buy and switch ships at Juno\'s shipyard.');
    el.innerHTML = html;
  });

  // ---------- Cargo & reputation ----------
  addTab('cargo', '📦 Cargo', (el) => {
    const st = api.st;
    let html = section(`Cargo hold ${api.cargoUsed()} / ${api.cargoCap()}`);
    const mats = Object.entries(MATERIALS).filter(([id]) => st.cargo[id]);
    const goods = Object.entries(GOODS).filter(([id]) => st.goods[id]);
    html += mats.length || goods.length
      ? [...mats.map(([id, m]) => `${m.icon} ${m.name}: <b>${st.cargo[id]}</b>`), ...goods.map(([id, g]) => `${g.icon} ${g.name}: <b>${st.goods[id]}</b>`)].join('<br>')
      : h('div', 'opacity:0.7', 'Empty. Mine asteroids, salvage wrecks, or buy goods at a market.');
    html += section('Credits');
    html += `💰 <b>${st.credits}</b>`;
    html += section('Reputation');
    for (const [id, f] of Object.entries(FACTIONS)) {
      const r = st.rep[id];
      html += `<div style="margin-bottom:6px"><span style="color:${f.color};font-weight:700">${f.name}</span> · ${standing(r)} (${r})${bar((r + 100) / 200, f.color)}</div>`;
    }
    el.innerHTML = html;
  });

  return { addTab, show: open, close, ui, get open() { return isOpen; }, redraw: () => isOpen && draw() };
}
