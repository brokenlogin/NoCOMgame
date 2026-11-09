import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createWorld } from './world.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { FollowCamera } from './camera.js';
import { RemotePlayers } from './remotePlayers.js';
import { Network } from './network.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
const world = createWorld();
const { scene } = world;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const input = new Input(renderer.domElement);
const followCam = new FollowCamera(camera, input);
const remotes = new RemotePlayers(scene);
const net = new Network();

// ---------- Shared game object ----------
// Contributors: hook in here! `game.addSystem((dt, game) => {...})` runs every frame while in a room.
// Use `game.net.sendEvent({ kind: 'yourThing', ... })` and `game.net.on('event', msg => ...)` for custom multiplayer events.
const systems = [];
const game = {
  THREE,
  CONFIG,
  renderer,
  camera,
  scene,
  world,
  input,
  net,
  remotes,
  player: null, // LocalPlayer once in a room
  addSystem(fn) {
    systems.push(fn);
    return () => systems.splice(systems.indexOf(fn), 1);
  },
  chat: addChatLine,
};
window.game = game;

// ---------- UI refs ----------
const $ = (id) => document.getElementById(id);
const lobby = $('lobby');
const hud = $('hud');
const nameInput = $('name-input');
const codeInput = $('code-input');
const hostBtn = $('host-btn');
const joinBtn = $('join-btn');
const lobbyError = $('lobby-error');
const roomCodeEl = $('room-code');
const playerCountEl = $('player-count');
const clickToPlay = $('click-to-play');
const chatLog = $('chat-log');
const chatInput = $('chat-input');

try {
  nameInput.value = localStorage.getItem('nocom.name') || '';
} catch {}

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
});
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBtn.click();
});

function playerName() {
  const n = nameInput.value.trim() || 'Player';
  try {
    localStorage.setItem('nocom.name', n);
  } catch {}
  return n;
}

function setBusy(busy) {
  hostBtn.disabled = busy;
  joinBtn.disabled = busy;
}

hostBtn.addEventListener('click', async () => {
  lobbyError.textContent = '';
  setBusy(true);
  try {
    await net.host(playerName());
  } catch (err) {
    lobbyError.textContent = err.message;
    setBusy(false);
  }
});

joinBtn.addEventListener('click', async () => {
  lobbyError.textContent = '';
  const code = codeInput.value;
  if (!/^\d{4}$/.test(code)) {
    lobbyError.textContent = 'Enter the 4-digit code from the host.';
    return;
  }
  setBusy(true);
  try {
    await net.join(code, playerName());
  } catch (err) {
    lobbyError.textContent = err.message;
    setBusy(false);
  }
});

// ---------- Network events ----------
net.on('error', (msg) => {
  lobbyError.textContent = msg.message;
  setBusy(false);
});

net.on('welcome', (msg) => {
  setBusy(false);
  lobby.classList.add('hidden');
  hud.classList.remove('hidden');
  roomCodeEl.textContent = msg.code;

  game.player = new LocalPlayer({ scene, colliders: world.colliders, input, color: msg.color, name: playerName() });
  for (const p of msg.players) remotes.add(p);
  updatePlayerCount();
  addChatLine(`Joined game ${msg.code}. Share the code with friends on your LAN!`, true);
  input.requestLock();
  updateClickPrompt();
});

net.on('playerJoined', ({ player }) => {
  remotes.add(player);
  updatePlayerCount();
  addChatLine(`${player.name} joined`, true);
});

net.on('playerLeft', ({ id }) => {
  const rp = remotes.players.get(id);
  if (rp) addChatLine(`${rp.name} left`, true);
  remotes.remove(id);
  updatePlayerCount();
});

net.on('state', (msg) => remotes.applyState(msg.id, msg));

net.on('chat', (msg) => addChatLine(`${msg.name}: ${msg.text}`));

net.on('close', () => {
  if (!game.player) {
    lobbyError.textContent = 'Lost connection to the server.';
    setBusy(false);
    return;
  }
  scene.remove(game.player.mesh);
  game.player = null;
  remotes.clear();
  hud.classList.add('hidden');
  lobby.classList.remove('hidden');
  lobbyError.textContent = 'Disconnected from the game.';
  document.exitPointerLock?.();
});

function updatePlayerCount() {
  playerCountEl.textContent = String(remotes.players.size + 1);
}

// ---------- Pointer lock / chat ----------
renderer.domElement.addEventListener('click', () => {
  if (game.player && chatInput.classList.contains('hidden')) input.requestLock();
});

document.addEventListener('pointerlockchange', updateClickPrompt);
document.addEventListener('pointerlockerror', updateClickPrompt);
function updateClickPrompt() {
  const show = game.player && !input.locked && chatInput.classList.contains('hidden');
  clickToPlay.classList.toggle('hidden', !show);
}

window.addEventListener('keydown', (e) => {
  if (!game.player) return;
  const chatOpen = !chatInput.classList.contains('hidden');
  if (!chatOpen && (e.code === 'KeyT' || e.code === 'Enter')) {
    e.preventDefault();
    openChat();
  }
});

chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (text) net.sendChat(text);
    closeChat();
  } else if (e.key === 'Escape') {
    closeChat();
  }
});

function openChat() {
  input.enabled = false;
  input.keys.clear();
  chatInput.classList.remove('hidden');
  chatInput.value = '';
  document.exitPointerLock?.();
  chatInput.focus();
  updateClickPrompt();
}

function closeChat() {
  chatInput.classList.add('hidden');
  chatInput.blur();
  input.enabled = true;
  input.requestLock();
  updateClickPrompt();
}

function addChatLine(text, system = false) {
  const el = document.createElement('div');
  el.className = 'msg' + (system ? ' system' : '');
  el.textContent = text;
  chatLog.appendChild(el);
  while (chatLog.children.length > 8) chatLog.firstChild.remove();
  setTimeout(() => el.classList.add('fade'), 8000);
  setTimeout(() => el.remove(), 9000);
}

// ---------- Main loop ----------
const timer = new THREE.Timer();
timer.connect(document); // pauses cleanly when the tab is hidden
let sendTimer = 0;

// Idle camera for the lobby screen
function lobbyCamera(t) {
  camera.position.set(Math.cos(t * 0.1) * 20, 8, Math.sin(t * 0.1) * 20);
  camera.lookAt(0, 0, 0);
}

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  const player = game.player;

  if (player) {
    followCam.update(player);
    player.update(dt);
    followCam.update(player); // re-place camera after the player moved
    world.followShadow(player.position);

    sendTimer += dt;
    if (sendTimer >= 1 / CONFIG.sendRateHz) {
      sendTimer = 0;
      net.sendState(player.getState());
    }

    for (const fn of systems) {
      try {
        fn(dt, game);
      } catch (err) {
        console.error('[system] threw', err);
      }
    }
  } else {
    lobbyCamera(timer.getElapsed());
  }

  remotes.update(dt);
  renderer.render(scene, camera);
});
