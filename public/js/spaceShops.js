// What the space crew's services do. Each crew member lists services by id (spaceRpg.js addNpc),
// and talking to them shows a button per service. Other modules can add their own:
//   api.services.myThing = { label: '🎲 Play dice', open(npc) { ... } }

import { SHIPS, SHIP_IDS, UPGRADES, SECONDARIES, SECONDARY_IDS, MATERIALS, GOODS, SECTORS, FACTIONS, standing } from './spaceData.js';

export function setupShops(api) {
  const { game, ship } = api;
  const st = () => api.st;
  const S = api.services;
  const back = (n) => ['Back', () => api.talk(n)];

  // Price helpers: haggling skill and your standing with the station's faction
  const priceMods = (n) => {
    const rep = st().rep[n.faction || 'command'] ?? 0;
    const repMod = Math.max(-0.2, Math.min(0.15, rep / 400));
    const haggle = api.skill('haggler') * 0.05;
    return { buy: 1 - haggle - repMod, sell: 1 + haggle + repMod };
  };
  const pay = (cost) => {
    if (st().credits < cost) return false;
    st().credits -= cost;
    api.fx.sfx('coin');
    return true;
  };

  // ---------- Shipyard ----------
  S.shipyard = {
    label: '🚀 Shipyard',
    open(n) {
      const s = st();
      const opts = SHIP_IDS.map((id) => {
        const d = SHIPS[id];
        const owned = s.ships.includes(id);
        const stats = `${d.role} · speed ${Math.round(d.speed * 100)}% · hull ${Math.round(d.hull * 100)}% · cargo ${d.cargo} · ${d.slots} module slot${d.slots > 1 ? 's' : ''}`;
        if (s.ship === id) return [`✔ ${d.name} (flying it) · ${stats}`, () => {}, true];
        if (owned) return [`Switch to ${d.name} · ${stats}`, () => {
          if (ship.piloting) return api.hud.toast('Land and get out first', '#ff8a7a');
          s.ship = id;
          api.applyStats();
          ship.repair();
          api.save();
          game.chat(`🚀 Your ${d.name} is ready in the hangar.`, true);
          S.shipyard.open(n);
        }];
        const lvlOk = api.level() >= d.level;
        return [`Buy ${d.name} for ${d.cost} cr · ${stats}${lvlOk ? '' : ` · needs level ${d.level}`}`, () => {
          if (!pay(d.cost)) return;
          s.ships.push(id);
          s.ship = id;
          if (s.ships.length >= SHIP_IDS.length) api.achieve('fleet');
          api.applyStats();
          ship.repair();
          api.save();
          api.announce(`🚀 bought a ${d.name}!`);
          S.shipyard.open(n);
        }, !lvlOk || s.credits < d.cost, d.desc];
      });
      api.openDialog(`${n.name} · Shipyard`, `You've got ${s.credits} credits. Every ship keeps your upgrades, gear and paint.`, [...opts, back(n)]);
    },
  };

  // ---------- Upgrades ----------
  S.upgrades = {
    label: '🔧 Ship upgrades',
    open(n) {
      const s = st();
      const opts = [];
      for (const [key, up] of Object.entries(UPGRADES)) {
        const lvl = s.upgrades[key] || 0;
        if (lvl >= up.costs.length) {
          opts.push([`${up.icon} ${up.name}: maxed out (${up.values[lvl]} ${up.unit})`, () => {}, true]);
          continue;
        }
        const cost = Math.round(up.costs[lvl] * priceMods(n).buy);
        opts.push([`${up.icon} ${up.name} Mk ${lvl + 2}: ${up.values[lvl]} → ${up.values[lvl + 1]} ${up.unit} (${cost} cr)`, () => {
          if (!pay(cost)) return;
          s.upgrades[key] = lvl + 1;
          api.applyStats();
          ship.repair();
          api.save();
          game.chat(`🔧 ${up.name} upgraded to Mk ${lvl + 2}!`, true);
          S.upgrades.open(n);
        }, s.credits < cost]);
      }
      api.openDialog(`${n.name} · Upgrades`, `You've got ${s.credits} credits. Upgrades work on every ship you own.`, [...opts, back(n)]);
    },
  };

  // ---------- Secondary weapons ----------
  S.weapons = {
    label: '🚀 Secondary weapons',
    open(n) {
      const s = st();
      const opts = SECONDARY_IDS.map((id) => {
        const w = SECONDARIES[id];
        if (s.secondaries.includes(id)) {
          return [`${w.icon} ${w.name}${s.secondary === id ? ' (selected)' : ': select'}`, () => {
            s.secondary = id;
            api.applyStats();
            api.save();
            S.weapons.open(n);
          }, s.secondary === id, w.desc];
        }
        const cost = Math.round(w.cost * priceMods(n).buy);
        return [`Buy ${w.icon} ${w.name} (${cost} cr) · ${w.desc}`, () => {
          if (!pay(cost)) return;
          s.secondaries.push(id);
          s.secondary = id;
          api.applyStats();
          api.save();
          game.chat(`${w.icon} ${w.name} fitted! R to fire, Q to switch.`, true);
          S.weapons.open(n);
        }, s.credits < cost];
      });
      opts.push(['🔁 Restock all ammo (free)', () => {
        ship.refillAmmo();
        api.hud.toast('Ammo restocked', '#7affc8');
      }]);
      api.openDialog(`${n.name} · Weapons`, 'R fires your secondary weapon, Q switches between the ones you own.', [...opts, back(n)]);
    },
  };

  // ---------- Market: sell materials, trade goods ----------
  const stationSector = (n) => n.sector || 'home';
  function goodPrice(n, id, selling) {
    const mult = SECTORS[stationSector(n)].market[id];
    if (mult == null) return null;
    const m = priceMods(n);
    return Math.max(1, Math.round(GOODS[id].price * mult * (selling ? 0.92 * m.sell : 1.06 * m.buy)));
  }
  S.market = {
    label: '💱 Market',
    open(n, note = '') {
      const s = st();
      const m = priceMods(n);
      const opts = [];
      // Materials sell at the same price everywhere
      let total = 0;
      for (const [id, d] of Object.entries(MATERIALS)) total += (s.cargo[id] || 0) * Math.round(d.price * m.sell);
      opts.push([total ? `Sell all materials (+${total} cr)` : 'Sell materials (you have none)', () => {
        let earned = 0;
        for (const [id, d] of Object.entries(MATERIALS)) {
          earned += (s.cargo[id] || 0) * Math.round(d.price * m.sell);
          s.cargo[id] = 0;
        }
        api.reward(earned, 0);
        S.market.open(n, `Sold for ${earned} credits.`);
      }, !total]);
      for (const id of Object.keys(GOODS)) {
        const g = GOODS[id];
        const buy = goodPrice(n, id, false), sell = goodPrice(n, id, true);
        if (buy == null) continue;
        const have = s.goods[id] || 0;
        const room = api.cargoCap() - api.cargoUsed();
        const nBuy = Math.min(10, room, Math.floor(s.credits / buy));
        opts.push([`${g.icon} ${g.name}: buy ${Math.max(1, nBuy)} for ${buy * Math.max(1, nBuy)} cr (${buy} each)`, () => {
          if (!pay(buy * nBuy)) return;
          s.goods[id] = have + nBuy;
          api.save();
          S.market.open(n, `Bought ${nBuy} ${g.name}.`);
        }, nBuy < 1]);
        if (have) opts.push([`${g.icon} Sell ${have} ${g.name} for ${sell * have} cr (${sell} each)`, () => {
          s.goods[id] = 0;
          api.reward(sell * have, Math.round(have * 2));
          S.market.open(n, `Sold ${have} ${g.name}.`);
        }]);
      }
      const hint = Object.entries(SECTORS).map(([, sec]) => `${sec.short}: ${Object.entries(sec.market).filter(([, v]) => v < 0.95).map(([k]) => GOODS[k].icon).join('') || '—'}`).join(' · ');
      api.openDialog(`${n.name} · Market`, `${note ? `${note}\n` : ''}Credits: ${s.credits} · cargo ${api.cargoUsed()}/${api.cargoCap()}\nBuy low, sell high! Cheap here: ${hint}\nPrices at ${FACTIONS[n.faction || 'command'].name} stations improve as your standing does (${standing(s.rep[n.faction || 'command'])}).`, [...opts, back(n)]);
    },
  };

  // ---------- Repairs ----------
  S.repair = {
    label: '🔧 Repairs & towing',
    open(n) {
      const opts = [
        [ship.hull < ship.stats.maxHull ? 'Repair my hull (free)' : 'Hull is in perfect shape', () => {
          ship.repair();
          api.fx.sfx('repair');
          game.chat('🔧 Hull repaired.', true);
          S.repair.open(n);
        }, ship.hull >= ship.stats.maxHull],
        [ship.docked ? 'Your ship is in the home hangar' : 'Tow my ship back to the home hangar', () => {
          ship.towHome();
          game.chat('🛻 Your ship has been towed back to the hangar at Station NoCOM.', true);
          S.repair.open(n);
        }, ship.docked || ship.piloting],
        ['🔁 Restock secondary ammo', () => {
          ship.refillAmmo();
          api.hud.toast('Ammo restocked', '#7affc8');
        }],
        back(n),
      ];
      api.openDialog(`${n.name} · Repairs`, `Hull at ${Math.ceil(ship.hull)}/${ship.stats.maxHull} · ${st().kits} repair kits (F in flight)`, opts);
    },
  };

  // ---------- Job board ----------
  S.jobs = {
    label: '📋 Job board',
    open(n) {
      const s = st();
      const period = Math.floor(Date.now() / 600000);
      const offers = api.Q.jobOffers(n.id, period, api.level());
      const job = s.job ? api.getQuest('job') : null;
      const opts = [];
      if (job) {
        opts.push([`Current: ${job.title}. Abandon it`, () => {
          api.abandon('job');
          S.jobs.open(n);
        }]);
      }
      for (const o of offers) {
        const taken = s.jobsTaken[`${n.id}:${o.period}:${o.slot}`];
        const q = api.Q.makeJob(o);
        opts.push([`${taken ? '✔ ' : ''}${q.title} · ${q.reward[0]} cr, ${q.reward[1]} XP`, () => {
          s.jobsTaken[`${n.id}:${o.period}:${o.slot}`] = 1;
          // Forget old periods so the save doesn't grow forever
          for (const k of Object.keys(s.jobsTaken)) if (!k.includes(`:${period}:`)) delete s.jobsTaken[k];
          api.takeJob(o);
          api.closeDialog();
        }, !!job || !!taken, q.offer]);
      }
      const mins = 10 - (Math.floor(Date.now() / 60000) % 10);
      api.openDialog(`${n.name} · Job board`, `${s.jobsDone} contracts finished. New contracts in ${mins} min. One contract at a time.`, [...opts, back(n)]);
    },
  };

}
