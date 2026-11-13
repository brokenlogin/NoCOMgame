// Inventory: a hotbar (always visible) plus a backpack grid (opened with Tab).
//
// Slots 0..HOTBAR_SIZE-1 are the hotbar, the rest are the backpack.
// An item is a plain object:
//   { id: 'apple', name: 'Apple', count: 3, maxStack: 64, icon: '🍎' }
// `icon` can be an emoji/short text or an image URL. `color` (CSS) is an optional slot tint.
//
// Contributor API (via game.inventory):
//   add(item)            -> leftover count that didn't fit (0 = all added)
//   remove(id, count)    -> how many were actually removed
//   has(id, count=1)     -> boolean
//   count(id)            -> total of that item across all slots
//   getSelected()        -> item in the selected hotbar slot, or null
//   select(index)        -> select hotbar slot 0..8
//   slots                -> raw array, null = empty (call render() after editing directly)
//   on('change'|'select', fn)

export const HOTBAR_SIZE = 9;
export const BACKPACK_ROWS = 3;
export const SLOT_COUNT = HOTBAR_SIZE * (1 + BACKPACK_ROWS);
const DEFAULT_MAX_STACK = 64;

// Optional: (item) => image URL for its icon (e.g. a rendered 3D model). Falls back to item.icon.
let iconResolver = null;
export function setIconResolver(fn) {
  iconResolver = fn;
}

// Optional: (item) => description text for the hover tooltip (falls back to item.description)
let descriptionResolver = null;
export function setDescriptionResolver(fn) {
  descriptionResolver = fn;
}

export class Inventory {
  constructor() {
    this.slots = new Array(SLOT_COUNT).fill(null);
    this.selected = 0;
    this.isOpen = false;
    this.held = null; // item picked up with the mouse while the inventory is open
    this.heldFrom = -1;
    this.handlers = { change: [], select: [] };

    this.buildDom();
    this.render();
  }

  // ---------- Events ----------
  on(type, fn) {
    this.handlers[type]?.push(fn);
  }

  emit(type, ...args) {
    for (const fn of this.handlers[type] || []) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[inventory] ${type} handler threw`, err);
      }
    }
  }

  changed() {
    this.render();
    this.emit('change', this);
  }

  // ---------- Item API ----------
  add(item) {
    if (!item?.id) return 0;
    let left = item.count ?? 1;
    const max = item.maxStack ?? DEFAULT_MAX_STACK;

    // Top up existing stacks first, then fill empty slots (hotbar first)
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === item.id && s.count < max) {
        const n = Math.min(left, max - s.count);
        s.count += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, max);
      this.slots[i] = { ...item, maxStack: max, count: n };
      left -= n;
    }
    this.changed();
    return left;
  }

  remove(id, count = 1) {
    let removed = 0;
    // Take from the end so the hotbar empties last
    for (let i = this.slots.length - 1; i >= 0 && removed < count; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(count - removed, s.count);
      s.count -= n;
      removed += n;
      if (s.count <= 0) this.slots[i] = null;
    }
    if (removed) this.changed();
    return removed;
  }

  count(id) {
    return this.slots.reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
  }

  has(id, count = 1) {
    return this.count(id) >= count;
  }

  getSelected() {
    return this.slots[this.selected];
  }

  select(index) {
    const i = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (i === this.selected) return;
    this.selected = i;
    this.render();
    this.emit('select', i, this.getSelected());
  }

  clear() {
    this.slots.fill(null);
    this.held = null;
    this.changed();
  }

  // ---------- Open / close ----------
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.panel.classList.remove('hidden');
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.panel.classList.add('hidden');
    this.returnHeld();
    this.render();
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
    return this.isOpen;
  }

  // Put a mouse-held item back somewhere sensible
  returnHeld() {
    if (!this.held) return;
    const item = this.held;
    this.held = null;
    if (this.heldFrom >= 0 && !this.slots[this.heldFrom]) {
      this.slots[this.heldFrom] = item;
      this.changed();
    } else {
      this.add(item); // anything that doesn't fit is lost, sorry
    }
    this.heldFrom = -1;
  }

  // Click a slot: pick up / put down / swap / merge stacks.
  // Right-click: pick up half, or place one.
  clickSlot(i, right = false) {
    const slot = this.slots[i];
    const held = this.held;

    if (!held) {
      if (!slot) return;
      if (right && slot.count > 1) {
        const half = Math.ceil(slot.count / 2);
        this.held = { ...slot, count: half };
        slot.count -= half;
      } else {
        this.held = slot;
        this.slots[i] = null;
      }
      this.heldFrom = i;
    } else if (!slot) {
      if (right) {
        this.slots[i] = { ...held, count: 1 };
        held.count -= 1;
        if (held.count <= 0) this.held = null;
      } else {
        this.slots[i] = held;
        this.held = null;
      }
    } else if (slot.id === held.id) {
      const max = slot.maxStack ?? DEFAULT_MAX_STACK;
      const n = Math.min(right ? 1 : held.count, max - slot.count);
      slot.count += n;
      held.count -= n;
      if (held.count <= 0) this.held = null;
    } else {
      this.slots[i] = held;
      this.held = slot;
      this.heldFrom = i;
    }
    this.changed();
  }

  // ---------- Item spawner ----------
  // `items` is a list of item templates ({ id, name, icon, maxStack, ... }).
  setSpawnerItems(items) {
    this.spawnerItems = items;
    this.spawnerGrid.replaceChildren();
    this.spawnerEntries = [];
    items.forEach((template) => {
      const el = document.createElement('div');
      el.className = 'slot spawner-slot';
      fillSlot(el, { ...template, count: 1 });
      this.spawnerEntries.push({ el, text: `${template.name} ${template.id} ${template.description || ''}`.toLowerCase() });
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.spawnerClick(template, e.shiftKey);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      this.spawnerGrid.appendChild(el);
    });
    this.spawnerGrid.appendChild(this.noMatchEl);
    this.filterSpawner();
  }

  // Show only spawner items whose name / id / description contains every word typed
  filterSpawner() {
    const words = (this.searchEl?.value || '').toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const { el, text } of this.spawnerEntries || []) {
      const match = words.every((w) => text.includes(w));
      el.style.display = match ? '' : 'none';
      if (match) shown++;
    }
    if (this.noMatchEl) this.noMatchEl.style.display = shown || !words.length ? 'none' : '';
  }

  spawnerClick(template, quickAdd) {
    // Holding something? The spawner doubles as a trash can.
    if (this.held) {
      this.held = null;
      this.heldFrom = -1;
      this.changed();
      return;
    }
    const max = template.maxStack ?? DEFAULT_MAX_STACK;
    const item = { ...template, maxStack: max, count: max };
    if (quickAdd) {
      this.add(item);
    } else {
      this.held = item;
      this.heldFrom = -1;
      this.changed();
    }
  }

  // ---------- DOM ----------
  buildDom() {
    const hud = document.getElementById('hud');

    this.hotbarEl = document.createElement('div');
    this.hotbarEl.id = 'hotbar';
    hud.appendChild(this.hotbarEl);

    this.panel = document.createElement('div');
    this.panel.id = 'inventory';
    this.panel.className = 'hidden';
    this.panel.innerHTML = `
      <div class="inv-window">
        <div class="inv-title">Item spawner <input class="inv-search" type="search" placeholder="🔍 Search items…" autocomplete="off" spellcheck="false" /> <span class="inv-hint">Click to grab · Shift-click to add · drop items here to delete</span></div>
        <div class="inv-grid spawner"></div>
        <div class="inv-sep"></div>
        <div class="inv-title">Inventory <span class="inv-hint">Tab to close</span></div>
        <div class="inv-grid backpack"></div>
        <div class="inv-sep"></div>
        <div class="inv-grid hotbar-row"></div>
      </div>`;
    hud.appendChild(this.panel);

    this.heldEl = document.createElement('div');
    this.heldEl.id = 'held-item';
    this.heldEl.className = 'slot hidden';
    hud.appendChild(this.heldEl);

    this.spawnerGrid = this.panel.querySelector('.spawner');
    // Search box: typing here mustn't trigger game keys, except Escape/Tab which close the inventory
    this.searchEl = this.panel.querySelector('.inv-search');
    this.searchEl.addEventListener('input', () => this.filterSpawner());
    this.searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        this.searchEl.blur();
        return; // let these reach the game so the inventory closes
      }
      e.stopPropagation();
    });
    this.searchEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.noMatchEl = document.createElement('div');
    this.noMatchEl.className = 'inv-nomatch';
    this.noMatchEl.textContent = 'No items match.';
    this.noMatchEl.style.display = 'none';
    this.noMatchEl.style.gridColumn = '1 / -1'; // lives inside the grid (other code hides the grid's neighbours)
    this.spawnerItems = [];
    const backpackGrid = this.panel.querySelector('.backpack');
    const hotbarGrid = this.panel.querySelector('.hotbar-row');

    // Elements for each slot index: one in the open window; hotbar slots also on the HUD hotbar
    this.windowSlotEls = [];
    this.hotbarSlotEls = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.dataset.index = i;
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.clickSlot(i, e.button === 2);
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      this.windowSlotEls.push(el);
      (i < HOTBAR_SIZE ? hotbarGrid : backpackGrid).appendChild(el);
    }
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      this.hotbarSlotEls.push(el);
      this.hotbarEl.appendChild(el);
    }

    // Instant tooltip (the browser's title tooltip waits ~1s before showing)
    this.tipEl = document.createElement('div');
    this.tipEl.id = 'item-tip';
    this.tipEl.className = 'hidden';
    hud.appendChild(this.tipEl);
    hud.addEventListener('mouseover', (e) => {
      const slot = e.target.closest?.('.slot');
      this.showTip(slot && slot !== this.heldEl ? slot : null);
    });
    hud.addEventListener('mouseleave', () => this.showTip(null));

    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.tipSlot) this.placeTip();
      if (!this.held) return;
      this.heldEl.style.left = `${e.clientX}px`;
      this.heldEl.style.top = `${e.clientY}px`;
    });
  }

  showTip(slot) {
    const name = slot?.dataset.tipName;
    this.tipSlot = name ? slot : null;
    if (!name) {
      this.tipEl.classList.add('hidden');
      return;
    }
    const title = document.createElement('div');
    title.className = 'tip-name';
    title.textContent = name;
    this.tipEl.replaceChildren(title);
    if (slot.dataset.tipDesc) {
      const desc = document.createElement('div');
      desc.className = 'tip-desc';
      desc.textContent = slot.dataset.tipDesc;
      this.tipEl.appendChild(desc);
    }
    this.tipEl.classList.remove('hidden');
    this.placeTip();
  }

  // Next to the cursor, flipped to stay on screen
  placeTip() {
    const pad = 14;
    const { innerWidth: w, innerHeight: h } = window;
    const r = this.tipEl.getBoundingClientRect();
    let x = (this.mouseX ?? 0) + pad;
    let y = (this.mouseY ?? 0) + pad;
    if (x + r.width > w - 4) x = (this.mouseX ?? 0) - r.width - pad;
    if (y + r.height > h - 4) y = (this.mouseY ?? 0) - r.height - pad;
    this.tipEl.style.left = `${Math.max(4, x)}px`;
    this.tipEl.style.top = `${Math.max(4, y)}px`;
  }

  render() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      fillSlot(this.windowSlotEls[i], this.slots[i]);
      this.windowSlotEls[i].classList.toggle('selected', i === this.selected);
    }
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      fillSlot(this.hotbarSlotEls[i], this.slots[i], i + 1);
      this.hotbarSlotEls[i].classList.toggle('selected', i === this.selected);
    }
    this.hotbarEl.classList.toggle('hidden', this.isOpen);
    fillSlot(this.heldEl, this.held);
    this.heldEl.classList.toggle('hidden', !this.held);
    if (!this.isOpen) this.showTip(null);
    else if (this.tipSlot) this.showTip(this.tipSlot);
    if (this.held && this.mouseX !== undefined) {
      this.heldEl.style.left = `${this.mouseX}px`;
      this.heldEl.style.top = `${this.mouseY}px`;
    }
  }
}

function fillSlot(el, item, keyNumber) {
  el.replaceChildren();
  if (keyNumber) {
    const key = document.createElement('span');
    key.className = 'slot-key';
    key.textContent = keyNumber;
    el.appendChild(key);
  }
  el.style.background = item?.color || '';
  el.removeAttribute('title');
  if (!item) {
    delete el.dataset.tipName;
    delete el.dataset.tipDesc;
    return;
  }
  el.dataset.tipName = `${item.name ?? item.id}${item.count > 1 ? ` ×${item.count}` : ''}`;
  let desc = item.description || '';
  try {
    desc = descriptionResolver?.(item) || desc;
  } catch {}
  if (desc) el.dataset.tipDesc = desc;
  else delete el.dataset.tipDesc;

  let icon = null;
  try {
    icon = iconResolver?.(item) ?? null;
  } catch {}
  icon = icon ?? item.icon ?? (item.name ?? item.id).slice(0, 2);
  if (/^(https?:|\/|data:|\.\/)/.test(icon)) {
    const img = document.createElement('img');
    img.className = 'slot-icon';
    img.src = icon;
    img.alt = item.name ?? item.id;
    img.draggable = false;
    el.appendChild(img);
  } else {
    const span = document.createElement('span');
    span.className = 'slot-icon';
    span.textContent = icon;
    el.appendChild(span);
  }
  if (item.count > 1) {
    const c = document.createElement('span');
    c.className = 'slot-count';
    c.textContent = item.count;
    el.appendChild(c);
  }
}
