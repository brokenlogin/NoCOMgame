# NoCOMgame

A 3D multiplayer game built with [three.js](https://threejs.org/) by several contributors **who don't talk to each other**. Add whatever you want. Chaos is the point.

## What's in the base

- A grey, flat 200×200 world
- Space-suited characters with a face inside a glass helmet (looks picked from your name), jointed arms and legs that walk, run, jump and squash on landing, and a head that follows your aim
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
- **A ton of OP items** (you start with all of them; also in the Tab spawner): Rocket Launcher, Lightning Staff (chains between players), Blink Dagger (teleport), Minigun (hold), Death Laser (hold, carves buildings), Orbital Strike, Pocket Nuke, Freeze Ray, Sky Launcher, Singularity Cannon (instant black hole), Meteor Shower, Dynamite Shotgun, Banhammer, Tornado in a Jar, God Potion (8s invincible), Cosmic Snap (half of everyone else is eliminated)
- **Space**: walk into the blue 🚀 portal near spawn to visit Station NoCOM, a space station over an open chasm with low gravity, stars, planets and asteroids to hop between (the green portal takes you home). This is the start of the space RPG: hook new space stuff in with `game.space`
- **Space RPG** (around Station NoCOM): talk to the crew with **E** (Commander Reyes: missions and the job board, Quartermaster Juno: shipyard, upgrades, secondary weapons and the market, Mechanic Bolt: repairs/towing, Dockmaster Vega out at Outpost Kepler). **J** opens your pilot's journal (quests, ship stats, cargo, reputation). Your starship waits in the north hangar: **E** to board/get out, mouse aims, W/S thrust, A/D strafe, Space/C up/down, Shift boost (uses energy), click for lasers, **R** secondary weapon (lock-on missiles, mines, ion cannon, tractor beam), **Q** switch secondary, **F** repair kit, **V** chase camera. Four ships to buy (Sparrow scout, Viper fighter, Mule hauler, Warden gunship), shields that recharge, a radar, target brackets, damage direction and hit markers. Story: Flight School → Rock Hound → Pirate Problem → Special Delivery → Ghost Ship (walk inside the derelict Erebus) → The Mothership (boss), then contracts from the job board. Trade goods between stations for profit. Levels, credits, ships and progress are saved in your browser. A yellow marker always points to your tracked goal
- Double jump: press Space again in the air
- **Sorry** item (🙇, in the Tab spawner): click, pick a player, and "Sorry <their name>" pops up big on their screen
- Funny items (in the Tab spawner): 🍌 **Banana Peel** (drop it, people slip and fly), 💨 **Whoopee Cushion** (drop it, people who step on it fart loudly), 🥧 **Cream Pie** (throw it, covers their screen in cream), 🐔 **Rubber Chicken** (squeaky bonk), 🤧 **Sneezing Powder** (they ACHOO backwards), 📯 **Clown Horn** (everyone nearby jumps), 🎉 **Confetti Popper**
- 20 more OP items (in the Tab spawner): 🔨 Mjolnir, 🐉 Dragon Breath, 🧲 Mega Magnet, 🌀 Portal Gun (left/right click for the two portals), 🌋 Volcano Staff, 🧊 Ice Age, ⏱️ Time Stop, 🦈 Shark Launcher, 💥 Cluster Bomb, 🌊 Tsunami, 🎯 Railgun, 🪐 Gravity Bomb, 👻 Ghost Cloak, 🥾 Moon Boots, ⚡ Flash Potion, 🧱 Insta-Wall, 🌈 Rainbow Bridge, 💣 Land Mine, 🐝 Bee Swarm, 🔁 Swap Ray
- 15 even more OP items (in the Tab spawner): 🐋 Whale Drop, 🪃 Boomerang, 🛸 UFO Abduction, 🎆 Firework Launcher, ⛈️ Storm Cloud, 🪞 Decoy Clones, ⛸️ Ice Field, 🔊 Sonic Boom, 🪓 Giant Axe, 🍄 Shrink Ray, 🎈 Balloon Gun, 👊 Falcon Punch, ⚓ Anchor, 🧷 Sticky C4 (left click throws, right click detonates), 🌑 Darkness Bomb
- Parkour course off the east edge (follow the blue arrows), with checkpoints and a timer
- **EXTREME parkour**: walk into the red portal west of spawn. Really hard course (tiny pillars, double-jump-only gaps, needle beams, vanishing and sliding platforms, a tower). No jetpack, air dash or items while you're on it; you get your items back when you leave
- Minigame lobby: walk into the purple portal near spawn. Stand on a pad to vote; with 2+ players a countdown starts. Last one standing wins:
  - **Bomb Rain**: bombs fall and roll at you
  - **Sword Arena**: everyone gets a sword
  - **Falling Floor**: two layers of tiles that drop away after you step on them
  - **Color Panic**: a color is called, every other tile vanishes
  - **Sumo Shrink**: boxing gloves on a shrinking platform
  - **Laser Sweep**: jump the spinning lasers (more join, they speed up)
  - **Rising Lava**: climb the platforms before the lava gets you
  - **Hot Potato**: run into someone to pass the ticking potato
  - **King of the Hill**: hold the gold crown alone for 30s to win (bat + plunger; getting knocked off just respawns you)
- The minigame lobby is a **safe zone**: no item use or Y/I grenades there, and nothing hurts or launches you while you're standing in it
- **Items switch** in the minigame lobby (step on the pad by the entrance): **Only minigame items** (default: your items are taken away, you only get what the game hands out, Y/I/G/1-9 do nothing and the spawner is hidden) or **All items** (keep and use everything; the game's items are added on top). Either way your inventory is put back exactly as it was when you're out

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
    capsule.js      Astronaut character (face, hair, helmet gadget from your name), animation and name tag
    terrain.js      Endless seeded hills + roof, streamed in chunks around the player
    structures.js   Buildings made of blocks; `destroyNear` blows them up
    dynamite.js     Throwing, bouncing, exploding dynamite
    blackhole.js    Black hole grenades
    opItems.js      The OP items + helpers: boomAll(), hurt() (damage another player), projectiles
    space.js        Space portal, Station NoCOM, space sky and low gravity
    spaceRpg.js     Space RPG core: saving, crew, quest engine, dialogue, HUD panel, waypoint, E actions
    spaceData.js    Space RPG numbers: ships, upgrades, weapons, materials, factions, sectors, loot, skills
    spaceQuests.js  Space RPG story, side quests and job board contracts
    spaceShops.js   What the crew's services do (shipyard, upgrades, weapons, market, repairs, jobs)
    spaceJournal.js The J menu (quests, ship, cargo, reputation, and tabs other modules add)
    spaceFx.js      Space explosions, debris, sparks, screen shake, warp streaks, engine trails and sounds
    spaceHud.js     Radar, target brackets, damage direction, hit markers, boss bar, banners, toasts
    spaceShip.js    Your starship: 4 ship models, flying, shields, boost, lasers, secondary weapons, chase cam, other players' ships
    spaceWorld.js   Space places and enemies: training rings, the Belt, Outpost Kepler, derelict Erebus, pirate drones, the Mothership
    camera.js       First-person camera
    input.js        Keyboard and pointer-lock mouse
    network.js      WebSocket client
    remotePlayers.js  Other players, interpolated
    inventory.js    Hotbar + backpack inventory (data and UI)
    items.js        Item definitions (bat, potato cannon, ...) and using them
    airDash.js      Shift-in-the-air dash
    doubleJump.js   Space-in-the-air second jump
    parkour.js      Parkour course off the east edge
    extremeParkour.js  Extreme parkour lobby + course (red portal near spawn)
    sorryItem.js    The Sorry item (player picker + big "Sorry <name>" banner)
    funnyItems.js   Banana peel, whoopee cushion, cream pie, rubber chicken, sneezing powder, clown horn, confetti (with WebAudio sounds)
    moreOpItems.js  20 more OP items, built on the helpers opItems.js exposes (fire, aimPoint, beamFx, ...)
    evenMoreOpItems.js  15 even more OP items (status effects: shrink, anchor, float, abduct)
    minigames.js    Minigame lobby, voting, rounds (add new games to MODES)
    mgBombRain.js   Bomb Rain minigame
    mgSwordArena.js Sword Arena minigame + sword item
    mgFallingFloor.js, mgColorPanic.js, mgSumo.js, mgLaserSweep.js, mgRisingLava.js, mgHotPotato.js, mgKingOfTheHill.js  more minigames
    mgShared.js     Helpers for minigames
    grapple.js      Grappling hook item, rope physics, other players' ropes
    itemModels.js   3D models for items (inventory icons + held item)
    moreItemModels.js  3D models for the OP, funny and Sorry items
    heldItems.js    Shows the item each player is holding in their character's hand
    viewmodel.js    Draws the held item in first person
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
- **Item models:** give your item a 3D look with `registerItem({ ..., model: (THREE) => group })` or `registerItemModel(id, fn)` from `itemModels.js`. Build it with the grip at the origin, pointing forward along -Z, in meters. It's rendered into the inventory icon and shown in your hand. Items without a model fall back to their emoji `icon`.
- **Knockback:** `game.combat.knockback(playerId, [x, y, z])` launches another player. Helpers: `game.combat.playersInCone(origin, dir, range, degrees)`, `playersInRadius(origin, radius)`, `spawnProjectile({...})`, `aim()`. To launch yourself, call `game.player.applyKnockback([x, y, z])`. The attacker decides hits; the target applies them to itself.
- **System chat:** `game.chat('Something happened!', true)`.

Try to keep new features in their own files and import them from `main.js`, which helps cut down on merge conflicts.
