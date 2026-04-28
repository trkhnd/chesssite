export type ChessSound =
  | "move"
  | "capture"
  | "check"
  | "gameover"
  | "illegal"
  | "promotion"
  | "castle";

type Note = {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
};

const SOUND_LIBRARY: Record<ChessSound, Note[]> = {
  move: [{ frequency: 540, duration: 0.055, type: "triangle", volume: 0.03 }],
  capture: [
    { frequency: 320, duration: 0.05, type: "square", volume: 0.032 },
    { frequency: 210, duration: 0.06, type: "triangle", volume: 0.028 },
  ],
  check: [
    { frequency: 780, duration: 0.05, type: "triangle", volume: 0.028 },
    { frequency: 930, duration: 0.08, type: "sine", volume: 0.03 },
  ],
  gameover: [
    { frequency: 660, duration: 0.08, type: "triangle", volume: 0.03 },
    { frequency: 520, duration: 0.1, type: "triangle", volume: 0.032 },
    { frequency: 390, duration: 0.14, type: "sine", volume: 0.028 },
  ],
  illegal: [
    { frequency: 230, duration: 0.05, type: "sawtooth", volume: 0.026 },
    { frequency: 180, duration: 0.06, type: "square", volume: 0.022 },
  ],
  promotion: [
    { frequency: 660, duration: 0.06, type: "triangle", volume: 0.03 },
    { frequency: 820, duration: 0.08, type: "triangle", volume: 0.03 },
    { frequency: 980, duration: 0.11, type: "sine", volume: 0.028 },
  ],
  castle: [
    { frequency: 500, duration: 0.05, type: "triangle", volume: 0.028 },
    { frequency: 640, duration: 0.07, type: "triangle", volume: 0.03 },
  ],
};

let audioContext: AudioContext | null = null;
let audioUnlocked = false;
const audioElements = new Map<ChessSound, HTMLAudioElement>();

function getSoundUrl(kind: ChessSound) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  return `${base}sounds/${kind}.wav`;
}

function getHtmlAudio(kind: ChessSound) {
  if (typeof window === "undefined") return null;
  const cached = audioElements.get(kind);
  if (cached) return cached;

  const audio = new Audio(getSoundUrl(kind));
  audio.preload = "auto";
  audio.volume = 0.42;
  audioElements.set(kind, audio);
  return audio;
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  if (!audioContext) {
    audioContext = new Context();
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }
  return audioContext;
}

export function unlockBoardAudio() {
  const context = getAudioContext();
  if (context) {
    if (context.state === "running") {
      audioUnlocked = true;
    } else {
      void context
        .resume()
        .then(() => {
          audioUnlocked = context.state === "running";
        })
        .catch(() => undefined);
    }
  }
  (["move", "capture", "check", "gameover", "illegal", "promotion", "castle"] as ChessSound[]).forEach((kind) => {
    const audio = getHtmlAudio(kind);
    if (!audio) return;
    void audio.load();
  });
}

function scheduleNote(context: AudioContext, note: Note, offsetSeconds: number) {
  const startAt = context.currentTime + offsetSeconds;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = note.type || "sine";
  oscillator.frequency.setValueAtTime(note.frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.028, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + note.duration + 0.02);
}

export function playBoardSound(kind: ChessSound, enabled: boolean, delayMs = 0, attempt = 0) {
  if (!enabled) return;
  const playHtmlAudio = () => {
    const audio = getHtmlAudio(kind);
    if (!audio) return false;
    try {
      audio.pause();
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        void playback.catch(() => undefined);
      }
      return true;
    } catch {
      return false;
    }
  };

  if (delayMs > 0) {
    if (typeof window !== "undefined") {
      window.setTimeout(() => playBoardSound(kind, enabled, 0, attempt), delayMs);
    }
    return;
  }

  if (playHtmlAudio()) {
    return;
  }

  const context = getAudioContext();
  if (!context) return;
  if (context.state !== "running") {
    unlockBoardAudio();
    if (typeof window !== "undefined" && attempt < 2) {
      window.setTimeout(() => playBoardSound(kind, enabled, delayMs, attempt + 1), 36);
    }
    return;
  }
  const notes = SOUND_LIBRARY[kind];
  if (!notes) return;

  const baseDelay = Math.max(0, delayMs) / 1000;
  let cursor = baseDelay;
  for (const note of notes) {
    scheduleNote(context, note, cursor);
    cursor += note.duration * 0.7;
  }
}
