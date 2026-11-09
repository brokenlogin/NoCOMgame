// Hotbar: 9 slots along the bottom of the screen.
// Pick a slot with 1-9 or the mouse wheel, use the selected item with left click.
//
// Contributors: add your own item with
//   game.hotbar.add({ name: 'Rocket', icon: '🚀', use: (game) => { ... } })
// It goes into the first empty slot. `icon` can be an emoji or short text.
export class Hotbar {
  constructor(game, element) {
    this.game = game;
    this.el = element;
    this.size = 9;
    this.items = new Array(this.size).fill(null);
    this.selected = 0;

    this.slots = [];
    for (let i = 0; i < this.size; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = `<span class="key">${i + 1}</span><span class="icon"></span>`;
      element.appendChild(slot);
      this.slots.push(slot);
    }
    this.label = document.createElement('div');
    this.label.className = 'hotbar-label';
    element.appendChild(this.label);

    window.addEventListener('keydown', (e) => {
      if (!game.player || !game.input.enabled) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m) this.select(Number(m[1]) - 1);
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!game.player || !game.input.locked) return;
        this.select((this.selected + (e.deltaY > 0 ? 1 : -1) + this.size) % this.size);
      },
      { passive: true }
    );
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && game.player && game.input.locked) this.useSelected();
    });

    this.render();
  }

  add(item, slotIndex) {
    const i = slotIndex ?? this.items.indexOf(null);
    if (i < 0 || i >= this.size) return -1;
    this.items[i] = item;
    this.render();
    return i;
  }

  select(i) {
    this.selected = i;
    this.render();
    const item = this.items[i];
    this.label.textContent = item ? item.name : '';
    this.label.classList.remove('show');
    void this.label.offsetWidth; // restart the fade animation
    if (item) this.label.classList.add('show');
  }

  useSelected() {
    const item = this.items[this.selected];
    if (item) {
      try {
        item.use(this.game);
      } catch (err) {
        console.error('[hotbar] item threw', err);
      }
    }
  }

  render() {
    this.slots.forEach((slot, i) => {
      slot.classList.toggle('selected', i === this.selected);
      const item = this.items[i];
      slot.querySelector('.icon').textContent = item ? item.icon : '';
      slot.title = item ? item.name : '';
    });
  }
}
