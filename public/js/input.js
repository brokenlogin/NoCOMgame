// Keyboard + pointer-lock mouse input.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.enabled = true; // false while typing in chat etc.

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
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
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  requestLock() {
    if (this.locked || !this.dom.requestPointerLock) return;
    try {
      // Returns a promise in modern browsers; it rejects if the browser refuses (e.g. no user gesture)
      this.dom.requestPointerLock()?.catch?.(() => {});
    } catch {}
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
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
