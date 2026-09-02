// Manga Background Music Service (BGM)
// Supports pre-configured tracks, volume control, looping, and local persistence.
// Includes a Web Audio procedural ambient synthesizer fallback when custom MP3 files are not yet provided.

export interface BgmTrack {
  id: string;
  title: string;
  description: string;
  iconType: 'music' | 'cloud-rain' | 'trees';
  audioPath: string;
}

export interface MangaBgmSettings {
  enabled: boolean;
  selectedTrackId: string;
  volume: number; // 0 to 1
  loop: boolean;
}

export interface MangaBgmState extends MangaBgmSettings {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

export const BGM_TRACKS: BgmTrack[] = [
  {
    id: 'melodic',
    title: 'Nhạc du dương',
    description: 'Giai điệu piano & acoustic êm đềm, thư giãn đầu óc',
    iconType: 'music',
    audioPath: '/audio/manga-bgm-melodic.mp3',
  },
  {
    id: 'rain',
    title: 'Tiếng mưa',
    description: 'Tiếng mưa rơi tí tách nhẹ nhàng, thanh lọc không gian',
    iconType: 'cloud-rain',
    audioPath: '/audio/manga-bgm-rain.mp3',
  },
  {
    id: 'countryside',
    title: 'Tiếng đồng quê',
    description: 'Âm hưởng thiên nhiên, đồng cỏ thanh bình và chim hót',
    iconType: 'trees',
    audioPath: '/audio/manga-bgm-countryside.mp3',
  },
];

const STORAGE_KEY = 'gau_manga_bgm_preferences';

const DEFAULT_SETTINGS: MangaBgmSettings = {
  enabled: false,
  selectedTrackId: 'melodic',
  volume: 0.5,
  loop: true,
};

class MangaBgmManager {
  private audioElement: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private synthNodes: { stop: () => void; setVolume: (v: number) => void } | null = null;
  private listeners: Set<(state: MangaBgmState) => void> = new Set();
  private settings: MangaBgmSettings;
  private isPlaying = false;
  private isLoading = false;
  private error: string | null = null;
  private isFallbackSynthActive = false;

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): MangaBgmSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettingsToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
    this.notify();
  }

  public getState(): MangaBgmState {
    return {
      ...this.settings,
      isPlaying: this.isPlaying,
      isLoading: this.isLoading,
      error: this.error,
    };
  }

  public subscribe(listener: (state: MangaBgmState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        void 0;
      }
    });
  }

  private getTrack(id: string): BgmTrack {
    return BGM_TRACKS.find((t) => t.id === id) || BGM_TRACKS[0];
  }

  // Procedural Web Audio Synth Fallback: generates pleasant ambient sounds
  // when custom mp3 files are not yet uploaded by the user.
  private startSynthFallback(trackId: string) {
    this.stopSynthFallback();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      const ctx = this.audioCtx;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.settings.volume * 0.4, ctx.currentTime);
      masterGain.connect(ctx.destination);

      let activeOscillators: OscillatorNode[] = [];
      let noiseNode: AudioBufferSourceNode | null = null;
      let intervalId: any = null;

      if (trackId === 'rain') {
        // Synthesize gentle pink-filtered rain noise
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.06;
          b6 = white * 0.115926;
        }
        noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime);

        noiseNode.connect(filter);
        filter.connect(masterGain);
        noiseNode.start();
      } else if (trackId === 'countryside') {
        // Nature & gentle wind/birds ambient
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = (Math.random() * 2 - 1) * 0.02;
        }
        noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, ctx.currentTime);
        noiseNode.connect(filter);
        filter.connect(masterGain);
        noiseNode.start();

        // Occasional gentle bird-like chirp
        intervalId = setInterval(() => {
          if (!this.isPlaying || ctx.state === 'closed') return;
          try {
            const osc = ctx.createOscillator();
            const chirpGain = ctx.createGain();
            osc.type = 'sine';
            const baseFreq = 2200 + Math.random() * 800;
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(baseFreq + 600, ctx.currentTime + 0.08);
            chirpGain.gain.setValueAtTime(this.settings.volume * 0.08, ctx.currentTime);
            chirpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(chirpGain);
            chirpGain.connect(masterGain);
            osc.start();
            osc.stop(ctx.currentTime + 0.16);
          } catch {}
        }, 3200);
      } else {
        // Melodic: gentle warm pentatonic ambient pad chords (C major pentatonic chords)
        const freqs = [261.63, 329.63, 392.0, 523.25, 659.25]; // C4, E4, G4, C5, E5
        activeOscillators = freqs.map((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = i % 2 === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(f, ctx.currentTime);
          g.gain.setValueAtTime((this.settings.volume * 0.06) / (i + 1), ctx.currentTime);
          osc.connect(g);
          g.connect(masterGain);
          osc.start();
          return osc;
        });
      }

      this.isFallbackSynthActive = true;
      this.synthNodes = {
        stop: () => {
          if (intervalId) clearInterval(intervalId);
          if (noiseNode) {
            try { noiseNode.stop(); } catch {}
          }
          activeOscillators.forEach((osc) => {
            try { osc.stop(); } catch {}
          });
          try { masterGain.disconnect(); } catch {}
          this.isFallbackSynthActive = false;
        },
        setVolume: (vol: number) => {
          if (ctx.state !== 'closed') {
            masterGain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
          }
        },
      };
    } catch (e) {
      void 0;
    }
  }

  private stopSynthFallback() {
    if (this.synthNodes) {
      this.synthNodes.stop();
      this.synthNodes = null;
    }
    this.isFallbackSynthActive = false;
  }

  public async play(): Promise<void> {
    this.settings.enabled = true;
    this.saveSettingsToStorage();
    const track = this.getTrack(this.settings.selectedTrackId);

    this.isLoading = true;
    this.error = null;
    this.notify();

    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.loop = true;
    }

    const audio = this.audioElement;
    audio.volume = this.settings.volume;
    audio.loop = this.settings.loop;

    // Attempt to load provided MP3
    try {
      audio.src = track.audioPath;
      await audio.play();
      this.isPlaying = true;
      this.isLoading = false;
      this.stopSynthFallback();
      this.notify();
    } catch (err: any) {
      // If audio file doesn't exist yet or autoplay was blocked / failed,
      // start smooth procedural synthesizer fallback gracefully.
      void 0;
      this.startSynthFallback(track.id);
      this.isPlaying = true;
      this.isLoading = false;
      this.notify();
    }
  }

  public pause(): void {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch {}
    }
    this.stopSynthFallback();
    this.isPlaying = false;
    this.isLoading = false;
    this.notify();
  }

  public toggle(): Promise<void> {
    if (this.isPlaying) {
      this.settings.enabled = false;
      this.saveSettingsToStorage();
      this.pause();
      return Promise.resolve();
    } else {
      return this.play();
    }
  }

  public async setTrack(trackId: string): Promise<void> {
    this.settings.selectedTrackId = trackId;
    this.saveSettingsToStorage();
    if (this.isPlaying || this.settings.enabled) {
      await this.play();
    }
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.settings.volume = clamped;
    if (this.audioElement) {
      this.audioElement.volume = clamped;
    }
    if (this.synthNodes) {
      this.synthNodes.setVolume(clamped);
    }
    this.saveSettingsToStorage();
  }

  public setLoop(loop: boolean): void {
    this.settings.loop = loop;
    if (this.audioElement) {
      this.audioElement.loop = loop;
    }
    this.saveSettingsToStorage();
  }

  public cleanup(): void {
    this.pause();
    if (this.audioElement) {
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
  }
}

export const mangaBgmService = new MangaBgmManager();
