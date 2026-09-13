export type FishingState = 'ready' | 'casting' | 'waiting' | 'bite' | 'reeling' | 'result' | 'paused'
export class Fishing {
  private current: FishingState = 'ready'
  private previous: FishingState = 'ready'
  private remaining = 0
  private species: string | null = null
  private resultText = ''
  private text = '点击鱼竿或抛竿，等浮漂下沉后再收竿'
  constructor(private onChange: (state: string, success?: boolean) => void, private onCatch: (species: string) => void, private rng: () => number = Math.random) {}
  get state(): FishingState { return this.current }
  get message(): string { return this.text }
  private set(state: FishingState, message: string): void { this.current = state; this.text = message; this.onChange(state, this.species !== null) }
  private random(): number { const n = this.rng(); return Number.isFinite(n) ? Math.max(0, Math.min(0.999999, n)) : 0.5 }
  private reel(success: boolean, message: string): void {
    this.species = success ? ['小鲫鱼', '锦鲤', '银色鲈鱼'][Math.floor(this.random()*3)]! : null
    this.resultText = success ? `钓到了${this.species}！` : message
    this.remaining = 1.2
    this.set('reeling', success ? '慢慢扬竿，鱼儿出水了…' : '收回鱼线，下一竿再试试…')
  }
  action(): void {
    if (this.current === 'ready' || this.current === 'result') {
      this.species = null; this.remaining = .9
      this.set('casting', '轻轻抛竿，鱼线正落向水面…')
    } else if (this.current === 'waiting') this.reel(false, '收竿早了一点，再试一竿吧。')
    else if (this.current === 'bite') this.reel(true, '')
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return
    while (dt > 0 && ['casting','waiting','bite','reeling'].includes(this.current)) {
      const step = Math.min(dt, this.remaining); this.remaining -= step; dt -= step
      if (this.remaining > 1e-9) break
      if (this.current === 'casting') { this.remaining = 3 + this.random()*5; this.set('waiting','看着浮漂，静静等一会儿…') }
      else if (this.current === 'waiting') { this.remaining = 2; this.set('bite','浮漂沉下去了，现在收竿！') }
      else if (this.current === 'bite') this.reel(false,'鱼儿游走了，再试一竿吧。')
      else if (this.current === 'reeling') {
        const caught = this.species; this.set('result',this.resultText)
        // State commits before notification; repeated input cannot award the same fish twice.
        if (caught) this.onCatch(caught)
      }
    }
  }
  pause(): void { if (this.current === 'paused' || this.current === 'ready' || this.current === 'result') return; this.previous = this.current; this.current = 'paused'; this.onChange('paused',this.species !== null) }
  resume(): void { if (this.current !== 'paused') return; this.current = this.previous; this.onChange(this.current,this.species !== null) }
  reset(): void { this.remaining = 0; this.species = null; this.set('ready','点击鱼竿或抛竿，等浮漂下沉后再收竿') }
}
