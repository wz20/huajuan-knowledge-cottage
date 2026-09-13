import { describe,it,expect } from 'vitest';
import { huajuanFrame } from '../src/renderer/world/huajuan-frames';
describe('existing Codex Huajuan atlas',()=>{
 it('never selects unused cells across complete animation loops',()=>{
  for(const state of ['idle','walk','chase','play','sleep'])for(const right of [true,false])for(let t=0;t<10;t+=.013){
   const {row,column}=huajuanFrame(state,t,right);
   expect(column).toBeLessThan(({0:6,1:8,2:8,3:4} as Record<number,number>)[row]);
  }
 });
 it('uses authored left and right running rows',()=>{
  expect(huajuanFrame('walk',0,true).row).toBe(1);
  expect(huajuanFrame('chase',0,false).row).toBe(2);
 });
 it('holds the closed-eye idle pose instead of playing a failure animation for sleep',()=>{
  expect(huajuanFrame('sleep',0,true)).toEqual({row:0,column:1});
  expect(huajuanFrame('sleep',20,false)).toEqual({row:0,column:1});
 });
 it('preserves the idle blink timing and cycle',()=>{
  expect(huajuanFrame('idle',.279,true).column).toBe(0);
  expect(huajuanFrame('idle',.281,true).column).toBe(1);
  expect(huajuanFrame('idle',1.1,true).column).toBe(0);
 });
});
