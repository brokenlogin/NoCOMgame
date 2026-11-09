import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createWorld } from './world.js';
import { Input } from './input.js';
import { LocalPlayer } from './player.js';
import { FirstPersonCamera } from './camera.js';
import { RemotePlayers } from './remotePlayers.js';
import { Network } from './network.js';
import { Dynamite } from './dynamite.js';
import { BlackHoles } from './blackhole.js';
import { setupOpItems } from './opItems.js';
import { setupSorryItem } from './sorryItem.js';
import { setupFunnyItems } from './funnyItems.js';
import { setupMoreOpItems } from './moreOpItems.js';
import { resolvePlayerCollisions } from './playerCollision.js';
import { addParkour } from './parkour.js';
import { setupDoubleJump } from './doubleJump.js';
import { setupMinigames } from './minigames.js';
import { setupSpace } from './space.js';
import { setupExtremeParkour } from './extremeParkour.js';
import { Inventory, HOTBAR_SIZE } from './inventory.js';
import { setupCombat } from './combat.js';
import { setupItems, registerItem } from './items.js';
import { setupGrapple } from './grapple.js';
import { setupAirDash } from './airDash.js';
import { setupHeldItems } from './heldItems.js';
import { createFlashLights } from './flashLights.js';

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(CONFIG.fov, window.innerWidth / window.innerHeight, 0.05, 500);
const world = createWorld();
// Fixed pool of flash lights. Never add/remove PointLights at runtime: it recompiles every shader (huge freeze)
const flashLights = createFlashLights(world.scene);
const { scene } = world;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const input = new Input(renderer.domElement);
const fpCam = new FirstPersonCamera(camera, input);
const remotes = new RemotePlayers(scene);
const net = new Network();
const inventory = new Inventory();

// ---------- Shared game object ----------
// Contributors: hook in here! `game.addSystem((dt, game) => {...})` runs every frame while in a room.
// Use `game.net.sendEvent({ kind: 'yourThing', ... })` and `game.net.on('event', msg => ...)` for custom multiplayer events.
const systems = [];
const overlays = [];
const game = {
  flashLights,
  flash: flashLights.flash, // game.flash(pos, { color, intensity, distance, duration })
  THREE,
  CONFIG,
  renderer,
  camera,
  scene,
  world,
  input,
  net,
  remotes,
  inventory, // see inventory.js for the API (add/remove/has/getSelected/...)
  player: null, // LocalPlayer once in a room
  addSystem(fn) {
    systems.push(fn);
    return () => systems.splice(systems.indexOf(fn), 1);
  },
  // Runs after the world is drawn every frame: (renderer, dt) => {...}. For things drawn on top (held item).
  addOverlay(fn) {
    overlays.push(fn);
    return () => overlays.splice(overlays.indexOf(fn), 1);
  },
  chat: addChatLine,
};
window.game = game;
addParkour(game);
game.combat = setupCombat(game); // knockback + projectiles
setupItems(game); // bat, potato cannon, etc. + item spawner
game.grapple = setupGrapple(game); // grappling hook item
setupDoubleJump(game); // press Space again in the air
setupMinigames(game); // minigame lobby and minigames
game.space = setupSpace(game); // portal to Station NoCOM in space (start of the space RPG)
setupExtremeParkour(game); // red portal near spawn: really hard parkour
game.airDash = setupAirDash(game); // Shift in the air
setupHeldItems(game); // see what item other players are holding

// ---------- Dynamite & gravity items ----------
const dynamite = new Dynamite(game);
game.dynamite = dynamite;
registerItem({
  id: 'dynamite',
  name: 'Dynamite',
  icon: '🧨',
  description: 'Throw it (or press Y). Blows up buildings, hurts and launches players.',
  cooldown: 0,
  anim: 'swing',
  use: () => dynamite.throw(),
});
registerItem({
  id: 'gravity-flipper',
  name: 'Gravity Flipper',
  icon: '🔃',
  description: 'Fall up onto the roof, or back down (or press G).',
  cooldown: 0.3,
  anim: 'recoil',
  use: ({ player }) => player.flipGravity(),
});

// ---------- Black hole grenades ----------
const blackHoles = new BlackHoles(game);
game.blackHoles = blackHoles;
registerItem({
  id: 'black-hole',
  name: 'Black Hole Grenade',
  icon: '🕳️',
  description: 'Opens a black hole that sucks in players and buildings, growing as it eats (or press I).',
  cooldown: 0,
  anim: 'swing',
  use: () => blackHoles.throw(),
});

// ---------- A TON of OP items (opItems.js) ----------
game.opItems = setupOpItems(game);
setupSorryItem(game); // pick a player, "Sorry <name>" pops up on their screen
setupFunnyItems(game); // banana peel, whoopee cushion, cream pie, rubber chicken, ...
setupMoreOpItems(game); // 20 more OP items (moreOpItems.js)

// Chat text when someone dies. `who` is 'You' or a name; `cause` is a player name, 'yourself' or 'a black hole'.
function deathText(who, cause) {
  const you = who === 'You';
  if (cause === 'a black hole') return `${who} ${you ? 'were' : 'was'} spaghettified by a black hole`;
  if (cause === 'yourself') return you ? 'You blew yourself up!' : `${who} blew themselves up`;
  return `${who} ${you ? 'were' : 'was'} blown up by ${cause}`;
}

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
const healthFill = $('health-fill');
const healthText = $('health-text');
const fuelBar = $('fuel');
const fuelFill = $('fuel-fill');
const damageFlash = $('damage-flash');

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

  // Everyone in the room uses the room code as the seed, so the world matches
  world.generate(Number(msg.code) || 1);
  game.player = new LocalPlayer({ scene, colliders: world.colliders, world, input, color: msg.color, name: playerName() });
  game.player.onDamage = () => {
    damageFlash.classList.remove('hit');
    void damageFlash.offsetWidth; // restart the flash animation
    damageFlash.classList.add('hit');
  };
  // Everyone starts with dynamite and the gravity flipper in their hotbar
  for (const [id, name, icon] of [['dynamite', 'Dynamite', '🧨'], ['gravity-flipper', 'Gravity Flipper', '🔃'], ['black-hole', 'Black Hole Grenade', '🕳️']]) {
    if (!inventory.has(id)) inventory.add({ id, name, icon, maxStack: 1, count: 1 });
  }
  game.opItems.giveAll(); // ...and the whole OP arsenal
  game.player.onDeath = (cause) => {
    addChatLine(deathText('You', cause), true);
    net.sendEvent({ kind: 'death', cause });
  };
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

net.on('event', (msg) => {
  if (msg.kind !== 'death') return;
  const who = remotes.players.get(msg.from)?.name || 'Someone';
  if (msg.cause === game.player?.name) addChatLine(`You blew up ${who}!`, true);
  else addChatLine(deathText(who, msg.cause), true);
});

net.on('close', () => {
  if (!game.player) {
    lobbyError.textContent = 'Lost connection to the server.';
    setBusy(false);
    return;
  }
  closeInventory();
  scene.remove(game.player.mesh);
  game.player = null;
  remotes.clear();
  hud.classList.add('hidden');
  lobby.classList.remove('hidden');
  lobbyError.textContent = 'Disconnected from the game.';
  input.releaseLock();
});

function updatePlayerCount() {
  playerCountEl.textContent = String(remotes.players.size + 1);
}

// ---------- Pointer lock / chat ----------
renderer.domElement.addEventListener('click', () => {
  if (game.player && !isChatOpen() && !inventory.isOpen) input.requestLock();
});

document.addEventListener('pointerlockchange', updateClickPrompt);
document.addEventListener('pointerlockerror', updateClickPrompt);
function updateClickPrompt() {
  const show = game.player && !input.locked && !isChatOpen() && !inventory.isOpen;
  clickToPlay.classList.toggle('hidden', !show);
  clickToPlay.textContent = input.wantLock ? 'Click or press any key to play' : 'Click to play';
}

function isChatOpen() {
  return !chatInput.classList.contains('hidden');
}

window.addEventListener('keydown', (e) => {
  if (!game.player || isChatOpen()) return;

  // Tab toggles the inventory
  if (e.code === 'Tab') {
    e.preventDefault();
    inventory.isOpen ? closeInventory() : openInventory();
    return;
  }
  if (inventory.isOpen) {
    if (e.code === 'Escape') closeInventory();
    return;
  }

  if (e.code === 'KeyT' || e.code === 'Enter') {
    e.preventDefault();
    openChat();
    return;
  }

  // 1-9 pick a hotbar slot
  const m = /^Digit([1-9])$/.exec(e.code);
  if (m && Number(m[1]) <= HOTBAR_SIZE) inventory.select(Number(m[1]) - 1);

  if (e.repeat) return;
  if (e.code === 'KeyG') game.player.flipGravity();
  if (e.code === 'KeyY') dynamite.throw();
  if (e.code === 'KeyI') blackHoles.throw();
});

// Mouse wheel scrolls through the hotbar
window.addEventListener('wheel', (e) => {
  if (!game.player || !input.locked || e.deltaY === 0) return;
  // Normalize to pixels (some mice report lines or pages)
  const deltaY = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
  // The held item gets first dibs (e.g. grappling hook reels in/out)
  if (game.itemWheel?.(deltaY)) return;
  inventory.select(inventory.selected + Math.sign(deltaY));
});

// Right-click is used by items, so no context menu over the game
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

function openInventory() {
  inventory.open();
  input.enabled = false;
  input.keys.clear();
  input.releaseLock();
  updateClickPrompt();
}

function closeInventory() {
  if (!inventory.isOpen) return;
  inventory.close();
  input.enabled = true;
  if (game.player) input.requestLock();
  updateClickPrompt();
}

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
  input.releaseLock();
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
  const x = Math.cos(t * 0.1) * 20, z = Math.sin(t * 0.1) * 20;
  camera.position.set(x, world.terrain.groundHeight(x, z) + 6, z);
  camera.lookAt(0, world.terrain.groundHeight(0, 0) + 1, 0);
}
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  const player = game.player;

  if (player) {
    fpCam.look(player);
    player.update(dt);
    resolvePlayerCollisions(player, remotes);
    fpCam.follow(player);
    world.followShadow(player.position);
    world.update(player.position); // stream terrain chunks in around you

    sendTimer += dt;
    if (sendTimer >= 1 / CONFIG.sendRateHz) {
      sendTimer = 0;
      net.sendState(player.getState());
    }

    const hp = Math.max(0, player.health) / CONFIG.maxHealth;
    healthFill.style.width = `${hp * 100}%`;
    healthFill.style.background = hp > 0.5 ? '#4cd964' : hp > 0.25 ? '#ffcc00' : '#ff3b30';
    healthText.textContent = `${Math.ceil(player.health)}`;
    fuelBar.classList.toggle('hidden', player.fuel >= 1);
    fuelFill.style.width = `${player.fuel * 100}%`;

    for (const fn of systems) {
      try {
        fn(dt, game);
      } catch (err) {
        console.error('[system] threw', err);
      }
    }
  } else {
    lobbyCamera(timer.getElapsed());
    world.update(camera.position);
  }

  remotes.update(dt);
  flashLights.update(dt);
  dynamite.update(dt);
  blackHoles.update(dt);
  world.structures.update(dt);
  renderer.render(scene, camera);
  for (const fn of overlays) {
    try {
      fn(renderer, dt);
    } catch (err) {
      console.error('[overlay] threw', err);
    }
  }
});
