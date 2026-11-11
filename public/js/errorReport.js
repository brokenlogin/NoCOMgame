// Sends errors from your game to the server log ({ type: 'clientError' }), so bugs that happen
// while people play show up where the developers can see them. Each different error is sent
// at most once a minute; the server also rate-limits.

export function setupErrorReport(game) {
  const sent = new Map(); // message -> last time sent
  function report(err, where = '') {
    const msg = `${where}${err?.stack || err?.message || String(err)}`.slice(0, 600);
    const key = msg.slice(0, 160);
    const now = Date.now();
    if (now - (sent.get(key) || 0) < 60000) return;
    sent.set(key, now);
    try {
      game.net.send?.({ type: 'clientError', message: msg });
    } catch {}
  }
  window.addEventListener('error', (e) => report(e.error || e.message, 'uncaught: '));
  window.addEventListener('unhandledrejection', (e) => report(e.reason, 'promise: '));
  // main.js logs errors from systems with console.error('[system] threw', err)
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    const err = args.find((a) => a instanceof Error);
    if (err) report(err, typeof args[0] === 'string' ? `${args[0]} ` : '');
  };
}
