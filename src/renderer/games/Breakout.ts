export type BreakoutState = 'title' | 'running' | 'paused' | 'won' | 'lost'
export interface Brick { x: number; y: number; w: number; h: number; alive: boolean; color: string }
const W = 960, H = 600, R = 9, PADDLE_W = 140, PADDLE_Y = 536
const STEP = 1 / 120
export class BreakoutPhysics {
  state: BreakoutState = 'title'
  score = 0
  lives = 3
  paddle = W / 2
  ball = { x: W / 2, y: PADDLE_Y - 24, vx: 170, vy: -340 }
  bricks: Brick[] = []
  private accumulator = 0
  constructor(private onFinish: (score: number, won: boolean) => void = () => {}) { this.makeBricks() }
  private makeBricks(): void {
    this.bricks = Array.from({ length: 40 }, (_, i) => ({ x: 62 + (i % 10) * 84, y: 114 + Math.floor(i / 10) * 38, w: 76, h: 26, alive: true, color: ['#e39a82', '#eac779', '#9cbaa2', '#719f99'][Math.floor(i / 10)]! }))
  }
  private serve(): void { this.ball = { x: this.paddle, y: PADDLE_Y - 24, vx: 170, vy: -340 } }
  start(): void { this.score = 0; this.lives = 3; this.paddle = W / 2; this.makeBricks(); this.serve(); this.accumulator = 0; this.state = 'running' }
  pause(): void { if (this.state === 'running') { this.state = 'paused'; this.accumulator = 0 } }
  resume(): void { if (this.state === 'paused') { this.state = 'running'; this.accumulator = 0 } }
  setPaddle(n: number): void { if (Number.isFinite(n)) this.paddle = Math.max(PADDLE_W / 2 + 20, Math.min(W - PADDLE_W / 2 - 20, n * W)) }
  private finish(won: boolean): void { if (this.state !== 'running') return; this.state = won ? 'won' : 'lost'; this.onFinish(this.score, won) }
  update(dt: number): void {
    if (this.state !== 'running' || !Number.isFinite(dt) || dt <= 0) return
    this.accumulator += Math.min(dt, 0.1)
    while (this.accumulator + 1e-10 >= STEP && this.state === 'running') { this.accumulator -= STEP; this.step(STEP) }
  }
  private step(dt: number): void {
    const b = this.ball
    // Bounded movement per substep prevents tunnelling even at unusually high velocity.
    const count = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / (R / 2)))
    for (let i = 0; i < count && this.state === 'running'; i++) {
      const oldX = b.x, oldY = b.y
      b.x += b.vx * dt / count; b.y += b.vy * dt / count
      if (b.x < 20 + R) { b.x = 20 + R; b.vx = Math.abs(b.vx) }
      if (b.x > W - 20 - R) { b.x = W - 20 - R; b.vx = -Math.abs(b.vx) }
      if (b.y < 80 + R) { b.y = 80 + R; b.vy = Math.abs(b.vy) }
      if (b.vy > 0 && oldY + R <= PADDLE_Y && b.y + R >= PADDLE_Y && b.x + R >= this.paddle - PADDLE_W / 2 && b.x - R <= this.paddle + PADDLE_W / 2) {
        b.y = PADDLE_Y - R
        const angle = Math.max(-1, Math.min(1, (b.x - this.paddle) / (PADDLE_W / 2))) * 1.05
        const speed = Math.min(560, Math.max(380, Math.hypot(b.vx, b.vy)))
        b.vx = speed * Math.sin(angle); b.vy = -speed * Math.cos(angle)
      }
      for (const brick of this.bricks) {
        if (!brick.alive || b.x + R <= brick.x || b.x - R >= brick.x + brick.w || b.y + R <= brick.y || b.y - R >= brick.y + brick.h) continue
        brick.alive = false; this.score += 10
        if (oldY + R <= brick.y) { b.y = brick.y - R; b.vy = -Math.abs(b.vy) }
        else if (oldY - R >= brick.y + brick.h) { b.y = brick.y + brick.h + R; b.vy = Math.abs(b.vy) }
        else if (oldX < brick.x) { b.x = brick.x - R; b.vx = -Math.abs(b.vx) }
        else { b.x = brick.x + brick.w + R; b.vx = Math.abs(b.vx) }
        if (this.bricks.every(item => !item.alive)) this.finish(true)
        break
      }
      if (b.y - R > H) { this.lives--; if (this.lives <= 0) this.finish(false); else this.serve(); break }
    }
  }
}
export class Breakout {
  private game: BreakoutPhysics
  private ctx: CanvasRenderingContext2D
  private frame = 0
  private last = 0
  private disposed = false
  constructor(private canvas: HTMLCanvasElement, onFinish: (score: number, won: boolean) => void) {
    canvas.width = W; canvas.height = H
    const context = canvas.getContext('2d'); if (!context) throw new Error('无法初始化街机画面')
    this.ctx = context; this.game = new BreakoutPhysics(onFinish); this.draw()
  }
  get state(): string { return this.game.state }
  get score(): number { return this.game.score }
  get lives(): number { return this.game.lives }
  start(): void { if (this.disposed) return; cancelAnimationFrame(this.frame); this.game.start(); this.last = 0; this.frame = requestAnimationFrame(this.tick) }
  pause(): void { this.game.pause(); cancelAnimationFrame(this.frame); this.last = 0; this.draw() }
  resume(): void { if (this.disposed || this.state !== 'paused') return; this.game.resume(); this.last = 0; this.frame = requestAnimationFrame(this.tick) }
  dispose(): void { this.disposed = true; cancelAnimationFrame(this.frame) }
  setPaddle(n: number): void { if (this.state === 'running') this.game.setPaddle(n) }
  private tick = (time: number): void => {
    if (this.disposed) return
    const dt = this.last ? (time - this.last) / 1000 : 0; this.last = time
    this.game.update(dt); this.draw()
    if (this.state === 'running') this.frame = requestAnimationFrame(this.tick)
  }
  private draw(): void {
    const c = this.ctx, g = this.game
    c.fillStyle = '#f3f1e7'; c.fillRect(0, 0, W, H)
    c.fillStyle = '#284c43'; c.font = 'bold 24px sans-serif'; c.textAlign = 'left'; c.fillText('花卷的午后街机', 40, 48)
    c.font = '18px sans-serif'; c.textAlign = 'right'; c.fillText(`得分 ${g.score}     生命 ${'♥ '.repeat(g.lives)}`, W - 40, 48)
    c.fillStyle = '#e6e9db'; c.beginPath(); c.roundRect(20, 78, W - 40, H - 94, 20); c.fill()
    for (const brick of g.bricks) { if (!brick.alive) continue; c.fillStyle = brick.color; c.beginPath(); c.roundRect(brick.x, brick.y, brick.w, brick.h, 7); c.fill(); c.fillStyle = '#ffffff35'; c.fillRect(brick.x + 9, brick.y + 5, brick.w - 18, 3) }
    c.fillStyle = '#3e776b'; c.beginPath(); c.roundRect(g.paddle - PADDLE_W / 2, PADDLE_Y, PADDLE_W, 14, 7); c.fill()
    c.fillStyle = '#fffdf5'; c.shadowColor = '#678578'; c.shadowBlur = 12; c.beginPath(); c.arc(g.ball.x, g.ball.y, R, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0
    if (g.state !== 'running') {
      c.fillStyle = '#f6f3eade'; c.beginPath(); c.roundRect(225, 272, 510, 160, 22); c.fill()
      c.textAlign = 'center'; c.fillStyle = '#284c43'; c.font = 'bold 32px sans-serif'
      c.fillText(({ title: '来一局打砖块', paused: '休息一下 · 已暂停', won: '全部击破！', lost: '这局结束啦' } as Record<string, string>)[g.state]!, W / 2, 331)
      c.font = '18px sans-serif'; c.fillText(g.state === 'title' ? '点击开始 · 移动鼠标或使用方向键控制挡板' : g.state === 'paused' ? '点击继续，接着刚才的位置玩' : `本局得分 ${g.score} · 随时可以再来一局`, W / 2, 379)
    }
    c.textAlign = 'center'; c.font = '14px sans-serif'; c.fillStyle = '#677d71'; c.fillText('移动挡板接住小球  ·  Esc 退出', W / 2, H - 13)
  }
}
