// Thin WebSocket client. Emits events for every server message type:
//   net.on('welcome' | 'error' | 'playerJoined' | 'playerLeft' | 'state' | 'event' | 'chat' | 'close', fn)
// Custom game events: net.sendEvent({ kind: 'boom', ... }) -> others get net.on('event', msg) with msg.from set.
export class Network {
  constructor() {
    this.ws = null;
    this.id = null;
    this.code = null;
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    const list = this.handlers.get(type);
    if (list) this.handlers.set(type, list.filter((f) => f !== fn));
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) || []) {
      try {
        fn(msg);
      } catch (err) {
        console.error(`[net] handler for "${type}" threw`, err);
      }
    }
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return this.ready;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('Could not reach the game server.')), { once: true });
    });
    this.ws.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        this.id = msg.id;
        this.code = msg.code;
      }
      this.emit(msg.type, msg);
    });
    this.ws.addEventListener('close', () => {
      this.id = null;
      this.code = null;
      this.emit('close', {});
    });
    return this.ready;
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  async host(name) {
    await this.connect();
    this.send({ type: 'host', name });
  }

  async join(code, name) {
    await this.connect();
    this.send({ type: 'join', code, name });
  }

  sendState(state) {
    this.send({ type: 'state', ...state });
  }

  sendEvent(data) {
    this.send({ ...data, type: 'event' });
  }

  sendChat(text) {
    this.send({ type: 'chat', text });
  }
}
