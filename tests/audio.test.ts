import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioController, noteFrequency, PIANO_KEYS } from '../src/renderer/audio/AudioController';

class Param {
  value = 0;
  setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} cancelAndHoldAtTime() {}
}
class Node {
  gain = new Param(); frequency = new Param(); threshold = new Param(); knee = new Param(); ratio = new Param();
  type = ''; onended: ((event: Event) => void) | null = null;
  buffer: unknown; loop = false; loopStart = 0; loopEnd = 0;
  connect() {} disconnect() {} start = vi.fn(); stop = vi.fn();
}
class Context {
  static created = 0;
  static latest: Context;
  sources: Node[] = [];
  currentTime = 0; state = 'suspended'; destination = new Node();
  constructor() { Context.created++; Context.latest = this; }
  createGain() { return new Node(); } createDynamicsCompressor() { return new Node(); }
  createOscillator() { return new Node(); }
  createBufferSource() { const source = new Node(); this.sources.push(source); return source; }
  async decodeAudioData() { return { duration: 96 }; }
  async resume() { this.state = 'running'; } async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
const active: AudioController[] = [];
function create() {
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  const audio = new AudioController(); active.push(audio); return audio;
}
afterEach(() => { for (const audio of active.splice(0)) audio.dispose(); vi.unstubAllGlobals(); });

describe('single audio lifecycle', () => {
  it('starts silent without an audio context; clamps only finite volume', () => {
    const audio = create();
    expect(audio.getState()).toMatchObject({ musicPlaying: false, contextState: 'not-created' });
    audio.setVolume(2); expect(audio.getState().volume).toBe(1);
    audio.setVolume(NaN); expect(audio.getState().volume).toBe(1);
  });
  it('reuses one context across repeated starts and piano while music is paused', async () => {
    Context.created = 0;
    const audio = create();
    await Promise.all([audio.setMusicPlaying(true), audio.setMusicPlaying(true)]);
    await audio.setMusicPlaying(false);
    await audio.noteOn('C4');
    expect(Context.created).toBe(1);
    expect(audio.getState()).toMatchObject({ musicPlaying: false, activeNotes: ['C4'] });
    audio.noteOff('C4'); expect(audio.getState().activeNotes).toEqual([]);
  });
  it('cancels an in-flight note when focus or mode changes before resume resolves', async () => {
    const audio = create();
    const start = audio.noteOn('C4'); audio.allNotesOff(); await start;
    expect(audio.getState().activeNotes).toEqual([]);
  });
  it('backgrounding stops piano and preserves music intent until returning', async () => {
    const audio = create(); await audio.noteOn('E4'); await audio.setMusicPlaying(true);
    audio.setVisible(false);
    expect(audio.getState()).toMatchObject({ musicPlaying: true, visible: false, activeNotes: [], contextState: 'suspended' });
    audio.setVisible(true); await Promise.resolve(); await Promise.resolve();
    expect(audio.getState().contextState).toBe('running');
  });
  it('decodes the accepted recording once and resumes the same loop position', async () => {
    const audio = create();
    await Promise.all([audio.setMusicPlaying(true), audio.setMusicPlaying(true)]);
    const context = Context.latest;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]).toMatchObject({ loop: true, loopStart: 0, loopEnd: 96 });
    context.currentTime = 101;
    await audio.setMusicPlaying(false);
    expect(context.sources[0].stop).toHaveBeenCalledTimes(1);
    await audio.setMusicPlaying(true);
    expect(context.sources[1].start).toHaveBeenCalledWith(0, 5);
    expect(fetch).toHaveBeenCalledTimes(1);
    audio.setVisible(false); audio.setVisible(true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(context.sources).toHaveLength(2);
  });
  it('does not start after pause while loading and allows retry after load failure', async () => {
    const audio = create();
    let finish!: (result: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const start = audio.setMusicPlaying(true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    await audio.setMusicPlaying(false);
    finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); await start;
    expect(Context.latest.sources).toHaveLength(0);
    const second = create();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('missing audio'));
    await second.setMusicPlaying(true);
    expect(second.getState()).toMatchObject({ musicPlaying: false });
    expect(second.getState().error).toContain('重试');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
    await second.setMusicPlaying(true);
    expect(second.getState()).toMatchObject({ musicPlaying: true, error: null });
  });
  it('piano stops music and keeps all controls paused after release and visibility changes', async () => {
    const audio = create(); const states: boolean[] = [];
    audio.subscribe(state => states.push(state.musicPlaying));
    await audio.setMusicPlaying(true);
    await audio.noteOn('C4');
    expect(audio.getState()).toMatchObject({ musicPlaying: false, activeNotes: ['C4'] });
    expect(Context.latest.sources[0].stop).toHaveBeenCalledTimes(1);
    audio.noteOff('C4'); audio.setVisible(false); audio.setVisible(true);
    expect(audio.getState().musicPlaying).toBe(false);
    expect(states.at(-1)).toBe(false);
    await audio.setMusicPlaying(true);
    expect(Context.latest.sources).toHaveLength(2);
  });
  it('piano cancels a background track still loading', async () => {
    const audio = create(); let finish!: (result: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const start = audio.setMusicPlaying(true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    await audio.noteOn('E4');
    finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); await start;
    expect(audio.getState().musicPlaying).toBe(false);
    expect(Context.latest.sources).toHaveLength(0);
  });
  it('uses all 13 chromatic keys at the expected pitch', () => {
    expect(Object.values(PIANO_KEYS)).toHaveLength(13);
    expect(noteFrequency('A4')).toBe(440);
    expect(noteFrequency('C5') / noteFrequency('C4')).toBe(2);
    expect(() => noteFrequency('random')).toThrow();
  });
});
