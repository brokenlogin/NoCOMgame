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

  // Returns accumulated mouse movement since last call
  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }
}
