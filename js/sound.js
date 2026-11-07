/** Tiny synthesized blips. Nothing is fetched. Starts silent. */

const PITCH = {
  working: 523,
  idle: 349,
  waiting_user: 659,
  error: 196,
  done: 784,
};

export function createSound() {
  let ctx = null;
  let enabled = false;

  function context() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (enabled) context();
      return enabled;
    },
    blip(kind) {
      if (!enabled) return;
      const audio = context();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = kind === 'error' ? 'triangle' : 'sine';
      osc.frequency.value = PITCH[kind] || 440;
      const t = audio.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.035, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'done' ? 0.28 : 0.16));
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.3);
      if (kind === 'done') {
        const osc2 = audio.createOscillator();
        const gain2 = audio.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 988;
        gain2.gain.setValueAtTime(0.0001, t + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.03, t + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc2.connect(gain2);
        gain2.connect(audio.destination);
        osc2.start(t + 0.08);
        osc2.stop(t + 0.34);
      }
    },
  };
}
