// Sorry item: click to pick a player from a list, and "Sorry <their name>" pops up big on
// their screen. Sends { kind: 'sorry', target }; the target shows it to themselves.

import { registerItem } from './items.js';

export function setupSorryItem(game) {
  const { net, remotes, input } = game;
  const hud = document.getElementById('hud');

  // ---------- Player picker ----------
  const picker = document.createElement('div');
  Object.assign(picker.style, {
    position: 'fixed', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.45)', zIndex: '20', pointerEvents: 'auto',
  });
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    minWidth: '240px', maxWidth: '90vw', maxHeight: '70vh', overflowY: 'auto', padding: '18px',
    background: 'rgba(20,22,27,0.95)', border: '1px solid #333842', borderRadius: '12px',
    display: 'flex', flexDirection: 'column', gap: '8px', font: '600 16px system-ui, sans-serif', color: '#eef0f3',
  });
  picker.appendChild(panel);
  hud.appendChild(picker);
  picker.addEventListener('mousedown', (e) => {
    if (e.target === picker) closePicker();
  });
  window.addEventListener('keydown', (e) => {
    if (picker.style.display !== 'none' && e.code === 'Escape') closePicker();
  });

  function openPicker() {
    panel.replaceChildren();
    const title = document.createElement('div');
    title.textContent = '🙇 Say sorry to…';
    title.style.fontSize = '18px';
    panel.appendChild(title);

    const players = [...remotes.players.values()];
    if (players.length === 0) {
      const none = document.createElement('div');
      none.textContent = "There's nobody here to say sorry to.";
      none.style.cssText = 'opacity:0.7;font-weight:400';
      panel.appendChild(none);
    }
    for (const rp of players) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = rp.name;
      btn.addEventListener('click', () => {
        net.sendEvent({ kind: 'sorry', target: rp.id });
        game.chat(`You said sorry to ${rp.name}`, true);
        closePicker();
      });
      panel.appendChild(btn);
    }
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = 'Cancel';
    cancel.style.opacity = '0.7';
    cancel.addEventListener('click', closePicker);
    panel.appendChild(cancel);

    input.enabled = false;
    input.keys.clear();
    document.exitPointerLock?.();
    picker.style.display = 'flex';
  }

  function closePicker() {
    if (picker.style.display === 'none') return;
    picker.style.display = 'none';
    input.enabled = true;
    if (game.player) input.requestLock();
  }

  // ---------- The big "Sorry" on the target's screen ----------
  const banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%, -50%)',
    display: 'none', textAlign: 'center', pointerEvents: 'none', zIndex: '15',
    color: '#ffffff', textShadow: '0 4px 18px rgba(0,0,0,0.7)', transition: 'opacity 0.4s',
  });
  const big = document.createElement('div');
  big.style.cssText = 'font:800 clamp(36px, 9vw, 96px) system-ui, sans-serif;line-height:1.05';
  const from = document.createElement('div');
  from.style.cssText = 'font:600 clamp(14px, 2.5vw, 22px) system-ui, sans-serif;opacity:0.85;margin-top:8px';
  banner.append(big, from);
  hud.appendChild(banner);
  let hideTimer = 0;

  function showSorry(fromName) {
    big.textContent = `Sorry ${game.player?.name || 'you'}`;
    from.textContent = `— ${fromName} 🙇`;
    banner.style.display = 'block';
    banner.style.opacity = '1';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      banner.style.opacity = '0';
      hideTimer = setTimeout(() => (banner.style.display = 'none'), 400);
    }, 3500);
  }

  net.on('event', (msg) => {
    if (msg.kind !== 'sorry' || msg.target !== net.id || !game.player) return;
    const fromName = remotes.players.get(msg.from)?.name || 'Someone';
    showSorry(fromName);
    game.chat(`${fromName} said sorry to you`, true);
  });
  net.on('close', closePicker);

  registerItem({
    id: 'sorry',
    name: 'Sorry',
    icon: '🙇',
    description: 'Pick a player and "Sorry <their name>" pops up on their screen.',
    cooldown: 1,
    anim: 'blow',
    use: openPicker,
  });
}
