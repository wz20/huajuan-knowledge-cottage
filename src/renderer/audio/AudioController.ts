/** One application-owned audio graph. Scene changes must not recreate this instance. */
export const PIANO_KEYS: Readonly<Record<string, string>> = Object.freeze({
  a: 'C4', w: 'C#4', s: 'D4', e: 'D#4', d: 'E4', f: 'F4', t: 'F#4',
  g: 'G4', y: 'G#4', h: 'A4', u: 'A#4', j: 'B4', k: 'C5',
});
export interface AudioState {
  musicPlaying: boolean;
  volume: number;
  activeNotes: string[];
  visible: boolean;
  contextState: string;
  error: string | null;
}
export const MUSIC_TRACK = { title: '星间午后', url: './audio/starlit-afternoon-loop.wav' } as const;
type Voice = { oscillators: OscillatorNode[]; gain: GainNode };
export function noteFrequency(note: string): number {
  const match = /^([A-G])(#?)([0-8])$/.exec(note);
  if (!match) throw new Error(`Invalid note: ${note}`);
  const offset: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (Number(match[3]) + 1) * 12 + offset[match[1]] + (match[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

export class AudioController {
  private context?: AudioContext;
  private musicGain?: GainNode;
  private pianoGain?: GainNode;
  private voices = new Map<string, Voice>();
  private pending = new Set<string>();
  private musicBuffer?: AudioBuffer;
  private musicLoading?: Promise<AudioBuffer>;
  private musicSource?: AudioBufferSourceNode;
  private musicOffset = 0;
  private musicStartedAt = 0;
  private readonly musicAbort = new AbortController();
  private musicPlaying = false;
  private volume: number;
  private visible = true;
  private disposed = false;
  private error: string | null = null;
  private listeners = new Set<(state: AudioState) => void>();
  private readonly onBlur = () => this.allNotesOff();
  private readonly onVisibility = () => this.setVisible(!document.hidden);
  private readonly onFocus = (event: FocusEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')) this.allNotesOff();
  };

  constructor(options: { volume?: number; onChange?: (state: AudioState) => void } = {}) {
    this.volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume!)) : .35;
    if (options.onChange) this.listeners.add(options.onChange);
    // No AudioContext or sound is created until an explicit music/piano action.
    if (typeof window !== 'undefined') window.addEventListener('blur', this.onBlur);
    if (typeof document !== 'undefined') {
      this.visible = !document.hidden;
      document.addEventListener('visibilitychange', this.onVisibility);
      document.addEventListener('focusin', this.onFocus);
    }
  }

  subscribe(listener: (state: AudioState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  getState(): AudioState {
    return { musicPlaying: this.musicPlaying, volume: this.volume, activeNotes: [...this.voices.keys()],
      visible: this.visible, contextState: this.context?.state ?? 'not-created', error: this.error };
  }
  private emit() { for (const listener of this.listeners) listener(this.getState()); }
  private async ready(): Promise<AudioContext | undefined> {
    if (this.disposed || !this.visible) return;
    try {
      if (!this.context) {
        const context = this.context = new AudioContext();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -14; limiter.knee.value = 12; limiter.ratio.value = 4;
        limiter.connect(context.destination);
        this.musicGain = context.createGain(); this.musicGain.gain.value = this.musicPlaying ? this.volume : 0;
        this.musicGain.connect(limiter);
        this.pianoGain = context.createGain(); this.pianoGain.gain.value = .22; this.pianoGain.connect(limiter);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.disposed || !this.visible) return;
      this.error = null;
      return this.context;
    } catch (error) {
      this.error = `音频未能启动，请重试：${error instanceof Error ? error.message : String(error)}`;
      this.emit();
    }
  }
  async setMusicPlaying(playing: boolean): Promise<void> {
    if (this.disposed) return;
    this.musicPlaying = playing;
    this.emit();
    if (!playing) {
      this.pauseMusic();
      this.ramp(this.musicGain, 0, .1);
      return;
    }
    const context = await this.ready();
    if (!context || !this.musicPlaying || this.disposed) return;
    try {
      const buffer = await this.loadMusic(context);
      if (!this.musicPlaying || !this.visible || this.disposed) return;
      // Concurrent clicks share decoding and can create only one loop source.
      if (!this.musicSource) {
        const source = context.createBufferSource();
        source.buffer = buffer; source.loop = true;
        source.loopStart = 0; source.loopEnd = buffer.duration;
        source.connect(this.musicGain!);
        this.musicStartedAt = context.currentTime;
        source.start(0, this.musicOffset % buffer.duration);
        this.musicSource = source;
      }
      this.ramp(this.musicGain, this.volume, .25);
      this.error = null;
    } catch (error) {
      if (this.disposed) return;
      this.musicPlaying = false;
      this.error = `《星间午后》加载失败，请点击音乐开关重试：${error instanceof Error ? error.message : String(error)}`;
    }
    this.emit();
  }
  toggleMusic(): Promise<void> { return this.setMusicPlaying(!this.musicPlaying); }
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.ramp(this.musicGain, this.musicPlaying ? this.volume : 0, .06);
    this.emit();
  }
  async noteOn(note: string): Promise<void> {
    const frequency = noteFrequency(note);
    if (this.voices.has(note) || this.pending.has(note) || this.disposed) return;
    // All mouse and keyboard paths share this boundary; keep music paused after playing.
    if (this.musicPlaying) void this.setMusicPlaying(false);
    this.pending.add(note);
    const context = await this.ready();
    if (!this.pending.delete(note) || !context || this.disposed) return;
    const now = context.currentTime;
    const voice = this.makeVoice(frequency, now, this.pianoGain!, [1, .23, .07]);
    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(.8, now + .008);
    voice.gain.gain.exponentialRampToValueAtTime(.22, now + .8);
    voice.gain.gain.exponentialRampToValueAtTime(.001, now + 8);
    this.voices.set(note, voice);
    const originalEnded = voice.oscillators[0].onended;
    voice.oscillators[0].onended = event => {
      originalEnded?.call(voice.oscillators[0], event);
      voice.gain.disconnect();
      if (this.voices.get(note) === voice) {
        this.voices.delete(note);
        this.emit();
      }
    };
    // A held key decays naturally; keyup/blur still removes its bookkeeping immediately.
    for (const oscillator of voice.oscillators) oscillator.stop(now + 8.1);
    this.emit();
  }
  noteOff(note: string) {
    this.pending.delete(note);
    const voice = this.voices.get(note);
    if (voice) { this.release(voice, .12); this.voices.delete(note); }
    this.emit();
  }
  allNotesOff() {
    this.pending.clear();
    for (const voice of this.voices.values()) this.release(voice, .04);
    this.voices.clear();
    this.emit();
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) {
      this.allNotesOff();
      // Suspending the one audio clock freezes the loop at its current sample.
      void this.context?.suspend().catch(() => {});
    } else if (this.musicPlaying) {
      void this.setMusicPlaying(true);
    }
    this.emit();
  }
  private ramp(node: GainNode | undefined, value: number, duration: number) {
    if (!node || !this.context || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    node.gain.cancelAndHoldAtTime(now);
    node.gain.linearRampToValueAtTime(value, now + duration);
  }
  private makeVoice(frequency: number, at: number, destination: AudioNode, harmonics: number[]): Voice {
    const context = this.context!;
    const gain = context.createGain(); gain.connect(destination);
    const oscillators = harmonics.map((level, i) => {
      const oscillator = context.createOscillator(); oscillator.type = 'sine';
      oscillator.frequency.value = frequency * (i + 1);
      const partial = context.createGain(); partial.gain.value = level;
      oscillator.connect(partial); partial.connect(gain);
      oscillator.onended = () => { oscillator.disconnect(); partial.disconnect(); };
      oscillator.start(at);
      return oscillator;
    });
    return { oscillators, gain };
  }
  private release(voice: Voice, seconds: number) {
    if (!this.context || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelAndHoldAtTime(now);
    voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
    for (const oscillator of voice.oscillators) {
      try { oscillator.stop(now + seconds + .02); } catch { /* Already ended. */ }
    }
    setTimeout(() => voice.gain.disconnect(), (seconds + .1) * 1000);
  }
  private loadMusic(context: AudioContext): Promise<AudioBuffer> {
    if (this.musicBuffer) return Promise.resolve(this.musicBuffer);
    if (!this.musicLoading) {
      this.musicLoading = fetch(MUSIC_TRACK.url, { signal: this.musicAbort.signal })
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => { if (!(buffer.duration > 0)) throw new Error('音频为空'); this.musicBuffer = buffer; return buffer; })
        .finally(() => { this.musicLoading = undefined; });
    }
    return this.musicLoading;
  }
  private pauseMusic() {
    const source = this.musicSource;
    if (!source || !this.context || !this.musicBuffer) return;
    this.musicOffset = (this.musicOffset + this.context.currentTime - this.musicStartedAt) % this.musicBuffer.duration;
    source.stop(); source.disconnect(); this.musicSource = undefined;
  }
  dispose() {
    this.allNotesOff();
    this.disposed = true;
    this.pauseMusic();
    this.musicAbort.abort();
    this.musicBuffer = undefined;
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onBlur);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
      document.removeEventListener('focusin', this.onFocus);
    }
    void this.context?.close().catch(() => {});
    this.listeners.clear();
  }
}
