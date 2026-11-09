# NoCOMgame

A 3D multiplayer game built with [three.js](https://threejs.org/) by several contributors **who don't talk to each other**. Add whatever you want. Chaos is the point.

## What's in the base

- A grey, flat 200×200 world
- A capsule player with a visor so you can see which way it faces
- First-person camera with mouse look (pointer lock); your own body is hidden but still casts a shadow
- WASD movement, Shift to sprint, Space to jump, gravity
- LAN multiplayer: one person hosts and gets a **4-digit code**, everyone else joins with it
- Name tags, player colors, and text chat (press **T**)
- Players collide with each other, and you can jump onto someone's head
- Inventory: a 9-slot hotbar (1-9 or mouse wheel to select) and a 27-slot backpack (**Tab**)
- Item spawner at the top of the inventory: grab whatever you want
- Knockback items (no health, you just get launched): Baseball Bat, Potato Cannon, Boxing Glove, Leaf Blower, Air Horn, Plunger

## Running it

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

The server prints addresses like:

```
  Local:   http://localhost:3000
  LAN:     http://192.168.1.42:3000
```

1. Everyone on the same network opens the **LAN** address in their browser.
2. One person clicks **Host game** and reads out the 4-digit code shown in the top-left.
3. Everyone else types the code and clicks **Join**.

You can run multiple rooms at once on the same server. The first time you run it on Windows, allow Node.js through the firewall on **private networks**, or other machines won't be able to connect.

Set a different port with `PORT=4000 npm start` (in PowerShell: `$env:PORT=4000; npm start`).

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look |
| Space | Jump |
| Shift | Sprint |
| Left click | Use held item (hold for the Leaf Blower) |
| 1-9 / mouse wheel | Select hotbar slot |
| Tab | Open/close inventory + item spawner (click to move items, right-click to split, Shift-click spawner to add) |
| T or Enter | Chat |
| Esc | Release mouse |

## Project layout

```
server/
  server.js         HTTP static server and WebSocket endpoint (/ws)
  rooms.js          Rooms, 4-digit codes, message relay
public/
  index.html        Page, lobby, HUD, import map for three.js
  css/style.css
  js/
    main.js         Bootstraps everything, game loop, lobby/HUD wiring, exposes `window.game`
    config.js       Tunables (speeds, gravity, camera, send rate)
    world.js        Scene, lights, terrain, `colliders` list
    player.js       Local player physics and controls
    capsule.js      Capsule character mesh and name tag
    camera.js       First-person camera
    input.js        Keyboard and pointer-lock mouse
    network.js      WebSocket client
    remotePlayers.js  Other players, interpolated
    inventory.js    Hotbar + backpack inventory (data and UI)
    items.js        Item definitions (bat, potato cannon, ...) and using them
    combat.js       Knockback networking, hit detection helpers, projectiles
    playerCollision.js  Bumping into other players and standing on their heads
```

three.js is served from `node_modules` by the server (no CDN), so it works on a LAN with no internet.

## Adding stuff (for contributors)

Some hooks so you don't have to rewrite the core:

- **Per-frame logic:** `game.addSystem((dt, game) => { ... })` runs every frame while you're in a room. `game` has `scene`, `camera`, `player`, `remotes`, `input`, `net`, `world`, `THREE`, `CONFIG`.
- **Things to stand on:** add a mesh to the scene and push it into `game.world.colliders`. The player's ground check raycasts against that list, so platforms work.
- **Custom multiplayer events:** `game.net.sendEvent({ kind: 'explode', at: [x, y, z] })` sends to everyone else in the room. Listen with `game.net.on('event', (msg) => { if (msg.kind === 'explode') ... })`. `msg.from` is the sender's player id. The server relays any `event` message without needing changes.
- **Extra player state:** each player already sends `p` (feet position), `r` (yaw), `pt` (look pitch) and `g` (on ground). Add fields to `LocalPlayer.getState()` and other clients get them in `remotes.players.get(id).state`.
- **Items:** `game.inventory.add({ id: 'apple', name: 'Apple', icon: '🍎', count: 3 })` (icon can be an emoji or an image URL). Also `remove(id, n)`, `has(id, n)`, `count(id)`, `getSelected()`, and `game.inventory.on('select', (index, item) => ...)` to react when the player switches hotbar slots. The inventory is local to each player; nothing is synced yet.
- **New items:** `registerItem({ id, name, icon, description, cooldown, use(ctx) { ... } })` from `items.js` and it appears in the spawner automatically. Use `hold(ctx, dt, state)` instead of `use` for hold-to-fire items. See the existing items for examples.
- **Knockback:** `game.combat.knockback(playerId, [x, y, z])` launches another player. Helpers: `game.combat.playersInCone(origin, dir, range, degrees)`, `playersInRadius(origin, radius)`, `spawnProjectile({...})`, `aim()`. To launch yourself, call `game.player.applyKnockback([x, y, z])`. The attacker decides hits; the target applies them to itself.
- **System chat:** `game.chat('Something happened!', true)`.

Try to keep new features in their own files and import them from `main.js`, which helps cut down on merge conflicts.
