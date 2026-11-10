// Generated background music for the space RPG (WebAudio, no files). Each sector has its own
// track, the cantina has its own swing, and the jukebox can pick any of them. M mutes/unmutes
// (remembered in this browser).
//
// A track is a few numbers: tempo, root note, scale, chord progression, and which parts play
// (pad, bass, arpeggio, drums). Notes are scheduled a little ahead of time so it never stutters.

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  blues: [0, 3, 5, 6, 7, 10, 12],
};
export const TRACKS = {
  home: { name: 'Kepler Calm', bpm: 84, root: 50, scale: 'major', prog: [0, 5, 3, 4], pad: 'triangle', bass: true, arp: 0.5, drums: 0 },
  nebula: { name: 'Nebula Dream', bpm: 70, root: 53, scale: 'lydian', prog: [0, 1, 0, 4], pad: 'sine', bass: true, arp: 0.7, drums: 0 },
  cryo: { name: 'Ice Echoes', bpm: 64, root: 57, scale: 'dorian', prog: [0, 3, 4, 3], pad: 'sine', bass: false, arp: 0.35, drums: 0 },
  scrap: { name: 'Rust Funk', bpm: 100, root: 45, scale: 'blues', prog: [0, 0, 3, 4], pad: 'sawtooth', bass: true, arp: 0.4, drums: 2 },
  rift: { name: 'Rift Dread', bpm: 58, root: 41, scale: 'phrygian', prog: [0, 1, 0, 6], pad: 'sawtooth', bass: true, arp: 0.25, drums: 1 },
  cantina: { name: 'Cantina Swing', bpm: 118, root: 55, scale: 'dorian', prog: [0, 3, 1, 4], pad: 'square', bass: true, arp: 0.75, drums: 2, swing: true },
  boss: { name: 'Battle Stations', bpm: 132, root: 48, scale: 'minor', prog: [0, 5, 6, 4], pad: 'sawtooth', bass: true, arp: 0.8, drums: 2 },
};

export function setupMusic(fx) {
  let muted = false;
  try {
    muted = localStorage.getItem('nocom.music') === 'off';
  } catch {}
  let ac = null, out = null;
  let current = null; // track id
  let wanted = null;
  let beat = 0, nextTime = 0;
  const midi = (n) => 440 * 2 ** ((n - 69) / 12);

  function ensure() {
    if (ac) return true;
    ac = fx.audio();
    if (!ac) return false;
    out = ac.createGain();
    out.gain.value = 0;
    // A touch of echo makes everything feel spacious
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.33;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    out.connect(ac.destination);
    out.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(ac.destination);
    return true;
  }
  function note(type, freq, t, dur, vol, cutoff = 2400) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function hit(t, kind) {
    if (kind === 'kick') {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.22);
    } else {
      fx.noise(kind === 'snare' ? 0.12 : 0.04, kind === 'snare' ? 0.06 : 0.025, kind === 'snare' ? 3000 : 9000, Math.max(0, t - ac.currentTime));
    }
  }
  function schedule(tr) {
    const scale = SCALES[tr.scale];
    const spb = 60 / tr.bpm;
    while (nextTime < ac.currentTime + 0.25) {
      const bar = Math.floor(beat / 4);
      const inBar = beat % 4;
      const degree = tr.prog[bar % tr.prog.length];
      const chord = [0, 2, 4].map((k) => {
        const i = degree + k;
        return tr.root + scale[i % scale.length] + 12 * Math.floor(i / scale.length);
      });
      if (inBar === 0) for (const n of chord) note(tr.pad, midi(n), nextTime, spb * 4.2, 0.035, tr.pad === 'sine' ? 3000 : 1100);
      if (tr.bass && (inBar === 0 || inBar === 2 || (tr.drums > 1 && inBar === 3))) note('sawtooth', midi(chord[0] - 12), nextTime, spb * 0.9, 0.05, 420);
      // Arpeggio in eighths (swung in the cantina)
      for (const half of [0, 1]) {
        if (Math.random() > tr.arp) continue;
        const t = nextTime + half * spb * (tr.swing ? 0.62 : 0.5);
        const n = chord[Math.floor(Math.random() * 3)] + 12 * (Math.random() < 0.4 ? 1 : 0);
        note(tr.pad === 'square' ? 'triangle' : 'triangle', midi(n + 12), t, spb * 0.6, 0.03, 3500);
      }
      if (tr.drums) {
        if (inBar === 0 || (tr.drums > 1 && inBar === 2)) hit(nextTime, 'kick');
        if (inBar === 1 || inBar === 3) hit(nextTime, tr.drums > 1 ? 'snare' : 'hat');
        if (tr.drums > 1) hit(nextTime + spb * (tr.swing ? 0.62 : 0.5), 'hat');
      }
      nextTime += spb;
      beat++;
    }
  }
  setInterval(() => {
    if (!ac || !current) return;
    const tr = TRACKS[current];
    if (tr) schedule(tr);
  }, 100);

  function play(id) {
    wanted = id;
    if (muted || !id) return fade(null);
    if (!ensure()) return;
    if (id === current) return;
    fade(id);
  }
  function fade(id) {
    if (!ac) {
      current = id;
      return;
    }
    const t = ac.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0, t, 0.4);
    setTimeout(() => {
      current = id;
      beat = 0;
      nextTime = ac.currentTime + 0.05;
      if (id) out.gain.setTargetAtTime(0.9, ac.currentTime, 0.8);
    }, id === current ? 0 : 900);
  }
  function toggle() {
    muted = !muted;
    try {
      localStorage.setItem('nocom.music', muted ? 'off' : 'on');
    } catch {}
    if (muted) fade(null);
    else play(wanted);
    return !muted;
  }
  return { play, toggle, get muted() { return muted; }, get current() { return current; } };
}
