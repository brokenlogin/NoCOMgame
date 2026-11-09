# NoCOMgame

A 3D multiplayer game built with [three.js](https://threejs.org/) by several contributors **who don't talk to each other**. Add whatever you want. Chaos is the point.

## What's in the base

- A grey, flat 200×200 world
- A capsule player with a visor so you can see which way it faces
- First-person camera with mouse look (pointer lock); your own body is hidden but still casts a shadow
- WASD movement, Shift to sprint, Space to jump, gravity
- Air dash: press Shift in the air to burst in the direction you're moving (one per jump)
- LAN multiplayer: one person hosts and gets a **4-digit code**, everyone else joins with it
- Name tags, player colors, and text chat (press **T**)
- Players collide with each other, and you can jump onto someone's head
- Inventory: a 9-slot hotbar (1-9 or mouse wheel to select) and a 27-slot backpack (**Tab**)
- Item spawner at the top of the inventory: grab whatever you want
- Knockback items (they just launch you): Baseball Bat, Potato Cannon, Boxing Glove, Leaf Blower, Air Horn, Plunger
- Grappling hook: left click to fire, scroll to reel in/out (very sensitive), right click to let go
- Endless generated hills and a rocky roof, loaded in chunks as you move (same world for everyone in a room, seeded by the room code). Open-sky chasms under the parkour course and minigame area: add your own in `CONFIG.terrain.voids`
- Blocky towers, huts, ruins and roof pillars you can blow apart
- **G** flips gravity so you fall up and walk on the roof (also the Gravity Flipper item)
- 100 health; dynamite (**Y**) and black holes are what hurt
- Jetpack: hold **Shift** in the air (a quick tap is the air dash; fuel refills when you land)
- Black hole grenades (**I**): suck in players and buildings and grow as they eat
- Double jump: press Space again in the air
- Parkour course off the east edge (follow the blue arrows), with checkpoints and a timer
- Minigame lobby: walk into the purple portal near spawn. Stand on a pad to vote; with 2+ players a countdown starts. **Bomb Rain** (bombs fall and roll at you) and **Sword Arena** (everyone gets a sword); last one standing wins

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
| Space | Jump (press again in the air to double jump) |
| Shift | Sprint (on the ground) · tap in the air: air dash · hold in the air: jetpack (uses fuel) |
| Left click | Use held item (hold for the Leaf Blower) |
| Right click | Grappling hook: let go |
| Mouse wheel while hooked | Reel in (up) / let out (down) |
| 1-9 / mouse wheel | Select hotbar slot |
| Tab | Open/close inventory + item spawner (click to move items, right-click to split, Shift-click spawner to add) |
| G | Flip gravity |
| Y | Throw dynamite |
| I | Throw a black hole grenade |
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
    capsule.js      Astronaut character mesh, walk animation and name tag
    terrain.js      Endless seeded hills + roof, streamed in chunks around the player
    structures.js   Buildings made of blocks; `destroyNear` blows them up
    dynamite.js     Throwing, bouncing, exploding dynamite
    blackhole.js    Black hole grenades
    camera.js       First-person camera
    input.js        Keyboard and pointer-lock mouse
    network.js      WebSocket client
    remotePlayers.js  Other players, interpolated
    inventory.js    Hotbar + backpack inventory (data and UI)
    items.js        Item definitions (bat, potato cannon, ...) and using them
    airDash.js      Shift-in-the-air dash
    doubleJump.js   Space-in-the-air second jump
    parkour.js      Parkour course off the east edge
    minigames.js    Minigame lobby, voting, rounds (add new games to MODES)
    mgBombRain.js   Bomb Rain minigame
    mgSwordArena.js Sword Arena minigame + sword item
    mgShared.js     Helpers for minigames
    grapple.js      Grappling hook item, rope physics, other players' ropes
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
- **New items:** `registerItem({ id, name, icon, description, cooldown, use(ctx) { ... } })` from `items.js` and it appears in the spawner automatically. Use `hold(ctx, dt, state)` instead of `use` for hold-to-fire items. Optional `altUse(ctx)` (right click), `wheel(ctx, deltaY)` (return true to stop the hotbar scrolling) and `onDeselect(ctx)`. To send extra per-player data to everyone, set `game.player.extraState.yourField`; others read it from `remotes.players.get(id).state.yourField`. See the existing items for examples.
- **Knockback:** `game.combat.knockback(playerId, [x, y, z])` launches another player. Helpers: `game.combat.playersInCone(origin, dir, range, degrees)`, `playersInRadius(origin, radius)`, `spawnProjectile({...})`, `aim()`. To launch yourself, call `game.player.applyKnockback([x, y, z])`. The attacker decides hits; the target applies them to itself.
- **System chat:** `game.chat('Something happened!', true)`.

Try to keep new features in their own files and import them from `main.js`, which helps cut down on merge conflicts.
