// Room / lobby logic for the WebSocket relay.
//
// Protocol (JSON messages). Client -> server:
//   { type: 'host', name, mode }           create a new room, get a 4-digit code (mode: 'creative' | 'survival')
//   { type: 'join', code, name }           join an existing room
//   { type: 'state', p:[x,y,z], r:yaw, ... } your latest player state (extra fields are relayed too)
//   { type: 'event', ... }                 any custom game event, relayed to everyone else in the room
//   { type: 'clientError', message }       a bug in someone's game, written to the server log (not relayed)
//   { type: 'chat', text }                 chat message
//
// Server -> client:
//   { type: 'welcome', id, code, color, mode, age, players:[{id,name,color,state}] }   (age: ms since the room was created)
//   { type: 'error', message }
//   { type: 'playerJoined', player:{id,name,color,state} }
//   { type: 'playerLeft', id }
//   { type: 'state', id, ...state }
//   { type: 'event', from, ... }
//   { type: 'chat', from, name, text }

const MAX_PLAYERS_PER_ROOM = 16;
const MAX_MESSAGE_BYTES = 16 * 1024;

const PLAYER_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xff6b9d,
  0x00bcd4, 0x8bc34a, 0xff5722, 0x795548, 0x607d8b, 0xcddc39, 0x673ab7, 0xffffff,
];

let nextPlayerId = 1;

export class RoomManager {
  constructor() {
    /** @type {Map<string, {code:string, players:Map<number, any>}>} */
    this.rooms = new Map();
  }

  generateCode() {
    if (this.rooms.size >= 9000) throw new Error('No room codes left');
    let code;
    do {
      code = String(Math.floor(1000 + Math.random() * 9000));
    } while (this.rooms.has(code));
    return code;
  }

  handleConnection(ws) {
    const player = { id: nextPlayerId++, ws, name: 'Player', color: 0xffffff, room: null, state: null };

    ws.on('message', (raw) => {
      if (raw.length > MAX_MESSAGE_BYTES) return;
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      this.handleMessage(player, msg);
    });

    ws.on('close', () => this.leave(player));
    ws.on('error', () => this.leave(player));
  }

  handleMessage(player, msg) {
    switch (msg.type) {
      case 'host': {
        if (player.room) return;
        const code = this.generateCode();
        this.rooms.set(code, { code, players: new Map(), mode: msg.mode === 'survival' ? 'survival' : 'creative', createdAt: Date.now() });
        this.enter(player, code, msg.name);
        console.log(`[room ${code}] created by ${player.name}`);
        break;
      }
      case 'join': {
        if (player.room) return;
        const code = String(msg.code ?? '').trim();
        if (!/^\d{4}$/.test(code)) return send(player.ws, { type: 'error', message: 'Code must be 4 digits.' });
        const room = this.rooms.get(code);
        if (!room) return send(player.ws, { type: 'error', message: `No game found with code ${code}.` });
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) return send(player.ws, { type: 'error', message: 'That game is full.' });
        this.enter(player, code, msg.name);
        break;
      }
      case 'state': {
        if (!player.room) return;
        const { type, id, ...state } = msg;
        player.state = state;
        this.broadcast(player.room, { type: 'state', id: player.id, ...state }, player);
        break;
      }
      case 'event': {
        if (!player.room) return;
        this.broadcast(player.room, { ...msg, type: 'event', from: player.id }, player);
        break;
      }
      case 'clientError': {
        // Errors from players' browsers end up here so bugs can be spotted while people play
        const now = Date.now();
        player.errTimes = (player.errTimes || []).filter((t) => now - t < 60000);
        if (player.errTimes.length >= 20) return;
        player.errTimes.push(now);
        console.log(`[client error] room ${player.room || '-'} ${player.name || '?'}: ${String(msg.message ?? '').slice(0, 600)}`);
        break;
      }
      case 'chat': {
        if (!player.room) return;
        const text = String(msg.text ?? '').slice(0, 200);
        if (!text.trim()) return;
        this.broadcast(player.room, { type: 'chat', from: player.id, name: player.name, text });
        break;
      }
    }
  }

  enter(player, code, name) {
    const room = this.rooms.get(code);
    player.name = sanitizeName(name);
    player.color = pickColor(room);
    player.room = code;
    room.players.set(player.id, player);

    send(player.ws, {
      type: 'welcome',
      id: player.id,
      code,
      color: player.color,
      mode: room.mode,
      age: Date.now() - (room.createdAt || Date.now()), // ms since the room was made (day/night starts then)
      players: [...room.players.values()].filter((p) => p !== player).map(publicInfo),
    });
    this.broadcast(code, { type: 'playerJoined', player: publicInfo(player) }, player);
    console.log(`[room ${code}] ${player.name} joined (${room.players.size} players)`);
  }

  leave(player) {
    const code = player.room;
    if (!code) return;
    player.room = null;
    const room = this.rooms.get(code);
    if (!room) return;
    room.players.delete(player.id);
    this.broadcast(code, { type: 'playerLeft', id: player.id });
    console.log(`[room ${code}] ${player.name} left (${room.players.size} players)`);
    if (room.players.size === 0) {
      this.rooms.delete(code);
      console.log(`[room ${code}] closed`);
    }
  }

  broadcast(code, msg, except = null) {
    const room = this.rooms.get(code);
    if (!room) return;
    const data = JSON.stringify(msg);
    for (const p of room.players.values()) {
      if (p !== except && p.ws.readyState === 1) p.ws.send(data);
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function publicInfo(p) {
  return { id: p.id, name: p.name, color: p.color, state: p.state };
}

function sanitizeName(name) {
  const clean = String(name ?? '').replace(/[^\w \-.]/g, '').trim().slice(0, 16);
  return clean || 'Player';
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}
