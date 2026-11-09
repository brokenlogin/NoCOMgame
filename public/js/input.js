// Keyboard + pointer-lock mouse input.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.enabled = true; // false while typing in chat etc.

    this.pressedKeys = new Set(); // went down since last consumeKey()
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Mouse buttons only count while the mouse is locked to the game (0 = left, 2 = right)
    this.buttons = new Set();
    this.pressedButtons = new Set(); // went down since last consumePressed()
    document.addEventListener('mousedown', (e) => {
      if (!this.locked || !this.enabled) return;
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) this.buttons.clear();
      else this.wantLock = false;
    });

    // Browsers refuse to lock the mouse from some keys (notably Escape, which isn't a
    // "user activation"). If a lock request was refused, retry on the next key press
    // or click, so e.g. closing the inventory with Esc and then pressing W grabs the mouse.
    this.wantLock = false;
    const retryLock = (e) => {
      if (!this.wantLock || this.locked || !this.enabled || e.code === 'Escape') return;
      this.tryLock();
    };
    window.addEventListener('keydown', retryLock, true);
    window.addEventListener('mousedown', retryLock, true);

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  // Ask for the mouse. If the browser says no right now, we keep asking on the next key/click.
  requestLock() {
    if (this.locked) return;
    this.wantLock = true;
    this.tryLock();
  }

  // Let go of the mouse on purpose (opening chat/inventory); stop trying to re-grab it
  releaseLock() {
    this.wantLock = false;
    if (this.locked) document.exitPointerLock?.();
  }

  tryLock() {
    if (this.locked || !this.dom.requestPointerLock) return;
    try {
      // Returns a promise in modern browsers; it rejects if the browser refuses (e.g. no user gesture)
      this.dom.requestPointerLock()?.catch?.(() => {});
    } catch {}
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
  }

  // True once per key press: whether any of `codes` went down since the last call
  consumeKey(...codes) {
    let was = false;
    for (const c of codes) was = this.pressedKeys.delete(c) || was;
    return was && this.enabled;
  }

  isMouseDown(button = 0) {
    return this.enabled && this.buttons.has(button);
  }

  // True once per click: whether `button` went down since the last call
  consumePressed(button = 0) {
    const was = this.pressedButtons.has(button);
    this.pressedButtons.delete(button);
    return was && this.enabled;
  }

  // Returns accumulated mouse movement since last call
  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
