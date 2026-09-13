import { describe, expect, it, vi } from 'vitest'
import { Fishing } from '../src/renderer/games/Fishing'
import { BreakoutPhysics } from '../src/renderer/games/Breakout'

describe('fishing rounds', () => {
  it('freezes every animated phase and awards only after reeling completes', () => {
    const caught=vi.fn(), game=new Fishing(()=>{},caught,()=>0)
    game.action(); expect(game.state).toBe('casting'); game.pause(); game.update(100); game.resume(); game.update(.9)
    expect(game.state).toBe('waiting'); game.update(2); game.pause(); game.update(100); game.action(); expect(game.state).toBe('paused')
    game.resume(); game.update(1); expect(game.state).toBe('bite'); game.action(); expect(game.state).toBe('reeling'); expect(caught).not.toHaveBeenCalled()
    game.pause(); game.update(100); game.resume(); game.update(1.2); expect(caught).toHaveBeenCalledExactlyOnceWith('小鲫鱼')
    game.update(100); game.action(); game.action(); expect(caught).toHaveBeenCalledTimes(1)
  })
  it('includes casting time and resolves exact bite deadline as a miss', () => {
    const caught=vi.fn(), game=new Fishing(()=>{},caught,()=>0)
    game.action(); game.update(3.9); expect(game.state).toBe('bite'); game.update(2); expect(game.state).toBe('reeling')
    game.action(); game.update(1.2); expect(game.state).toBe('result'); expect(caught).not.toHaveBeenCalled()
  })
  it('early reeling and reset during reeling cannot save a fish', () => {
    const caught=vi.fn(), game=new Fishing(()=>{},caught,()=>0)
    game.action(); game.update(.9); game.action(); game.update(2); expect(game.state).toBe('result'); expect(caught).not.toHaveBeenCalled()
    game.action(); game.update(3.9); game.action(); game.reset(); game.update(100); expect(caught).not.toHaveBeenCalled()
  })
  it('supports all species, rejects invalid delta and marks successful reeling', () => {
    for(const [r,species] of [[0,'小鲫鱼'],[.5,'锦鲤'],[.99999,'银色鲈鱼']] as const){
      const caught=vi.fn(), change=vi.fn(), game=new Fishing(change,caught,()=>r)
      game.action(); game.update(NaN); game.update(-100); expect(game.state).toBe('casting')
      game.update(.9+3+r*5); game.action(); expect(change).toHaveBeenLastCalledWith('reeling',true)
      game.update(1.2); expect(caught).toHaveBeenCalledExactlyOnceWith(species)
    }
  })
})

describe('breakout physics', () => {
  it('does not advance while paused or accumulate background time', () => {
    const game = new BreakoutPhysics(); game.start(); game.update(0.05); game.pause()
    const before = { ...game.ball }; game.update(500); expect(game.ball).toEqual(before)
    game.resume(); game.update(1 / 120); expect(Math.abs(game.ball.y - before.y)).toBeLessThan(5)
  })
  it('does not tunnel through bricks at high speed or award a brick twice', () => {
    const game = new BreakoutPhysics(); game.start()
    game.ball = { x: 100, y: 280, vx: 0, vy: -12000 }; game.update(1 / 120)
    expect(game.score).toBe(10); expect(game.bricks.filter(b => !b.alive)).toHaveLength(1)
    expect(game.ball.vy).toBeGreaterThan(0)
  })
  it('wins once and reports final score only once', () => {
    const done = vi.fn(), game = new BreakoutPhysics(done); game.start()
    game.bricks.forEach((b, i) => { b.alive = i === 0 })
    game.ball = { x: 100, y: 160, vx: 0, vy: -600 }; game.update(0.05); game.update(10)
    expect(game.state).toBe('won'); expect(done).toHaveBeenCalledExactlyOnceWith(10, true)
  })
  it('uses three lives and restarts cleanly', () => {
    const done = vi.fn(), game = new BreakoutPhysics(done); game.start()
    for (let i = 0; i < 3; i++) { game.ball.y = 620; game.ball.vy = 300; game.update(1 / 120) }
    expect(game.state).toBe('lost'); expect(game.lives).toBe(0); expect(done).toHaveBeenCalledExactlyOnceWith(0, false)
    game.start(); expect(game.lives).toBe(3); expect(game.state).toBe('running'); expect(game.bricks.every(b => b.alive)).toBe(true)
  })
  it('clamps paddle, rejects invalid input and bounces from its top', () => {
    const game = new BreakoutPhysics(); game.start(); game.setPaddle(-20); expect(game.paddle).toBe(90)
    game.setPaddle(20); expect(game.paddle).toBe(870); game.setPaddle(NaN); expect(game.paddle).toBe(870)
    game.ball = { x: 870, y: 522, vx: 0, vy: 380 }; game.update(0.05); expect(game.ball.vy).toBeLessThan(0)
  })
})
