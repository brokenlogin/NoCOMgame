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
      this.lockPending = false;
      if (!this.locked) this.buttons.clear();
      else this.wantLock = false;
    });
    document.addEventListener('pointerlockerror', () => (this.lockPending = false));

    // Escape is the browser's "let me out" key. Grabbing the mouse while it's held backfires:
    // the browser may grant it and then immediately release it again as a deliberate exit
    // (which shows "Click to play" and makes the next grab need an extra click). So when a menu
    // closes on Esc we don't grab right away; the next key you press (or a click) does,
    // e.g. close the inventory with Esc, press W, and you're back in.
    this.wantLock = false;
    this.lockPending = false;
    this.escapeHeld = false;
    this.lastEscape = -1e9;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.escapeHeld = true;
        this.lastEscape = performance.now();
      }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Escape') this.escapeHeld = false;
    }, true);
    const retryLock = (e) => {
      if (!this.wantLock || this.locked || !this.enabled || this.escapeHeld || e.code === 'Escape') return;
      this.tryLock(`after ${e.type} ${e.code || e.button}`);
    };
    // Any other key, or a mouse button, grabs the mouse again
    for (const type of ['keydown', 'mousedown']) window.addEventListener(type, retryLock, true);

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
    // Closed with Esc? Wait for the next key instead of grabbing now (see above)
    if (this.escapeHeld || performance.now() - this.lastEscape < 400) return;
    this.tryLock();
  }

  // Let go of the mouse on purpose (opening chat/inventory); stop trying to re-grab it
  releaseLock() {
    this.wantLock = false;
    if (this.locked) document.exitPointerLock?.();
  }

  // `why` is set when this comes from a key/click retry: if the browser still refuses then,
  // it's unexpected, so the reason is logged (and sent to the server log by errorReport.js)
  tryLock(why = '') {
    if (this.locked || this.lockPending || !this.dom.requestPointerLock) return;
    const failed = (err) => {
      this.lockPending = false;
      if (why) console.error(`[input] mouse lock refused ${why}:`, err instanceof Error ? err : new Error(String(err?.message || err)));
    };
    try {
      this.lockPending = true;
      setTimeout(() => (this.lockPending = false), 1500); // never stay stuck waiting
      // Returns a promise in modern browsers; it rejects if the browser refuses (e.g. no user gesture)
      const p = this.dom.requestPointerLock();
      if (p?.then) p.then(() => (this.lockPending = false), failed);
      else this.lockPending = false; // older browsers: no promise
    } catch (err) {
      failed(err);
    }
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
