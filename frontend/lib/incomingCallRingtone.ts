/**
 * Incoming-call ring for web (phone browser). Uses Web Audio + optional vibration.
 * Browsers block autoplay until the user has tapped the page once — call unlockIncomingCallAudio() on first gesture.
 */

let audioContext: AudioContext | null = null;

export function unlockIncomingCallAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!audioContext) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
  } catch {
    // ignore
  }
}

function playRingBurst(): void {
  if (!audioContext || audioContext.state !== 'running') return;
  try {
    const gain = audioContext.createGain();
    gain.gain.value = 0.12;
    gain.connect(audioContext.destination);

    const o1 = audioContext.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 440;
    const o2 = audioContext.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 480;
    o1.connect(gain);
    o2.connect(gain);
    const t0 = audioContext.currentTime;
    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + 1.0);
    o2.stop(t0 + 1.0);
  } catch {
    // ignore
  }
}

function startVibration(): () => void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) {
    return () => {};
  }
  const pattern = [400, 250, 400, 250, 400, 900];
  navigator.vibrate(pattern);
  const id = window.setInterval(() => {
    navigator.vibrate(pattern);
  }, 2800);
  return () => {
    window.clearInterval(id);
    navigator.vibrate(0);
  };
}

/** Start ringing; returns stop(). Safe to call multiple times — previous ring is stopped first. */
let activeStop: (() => void) | null = null;

export function startIncomingCallRingtone(): () => void {
  stopIncomingCallRingtone();
  unlockIncomingCallAudio();

  playRingBurst();
  const ringId = window.setInterval(playRingBurst, 2800);
  const stopVibrate = startVibration();

  const stop = () => {
    window.clearInterval(ringId);
    stopVibrate();
    if (activeStop === stop) activeStop = null;
  };
  activeStop = stop;
  return stop;
}

export function stopIncomingCallRingtone(): void {
  activeStop?.();
  activeStop = null;
}
