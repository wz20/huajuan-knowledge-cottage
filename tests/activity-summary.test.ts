import Database from 'better-sqlite3';
import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {ActivitySummary} from '../src/shared/contracts';
import {Store} from '../src/worker/database';
async function fixture(run:(s:Store,dir:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'cottage-summary-'));const s=new Store(path.join(dir,'state.sqlite'));try{await run(s,dir);}finally{s.close();await rm(dir,{recursive:true,force:true});}}
describe('complete activity summary',()=>{
 it('aggregates more than one page, excludes unknown dates from today and uses local day boundaries',()=>fixture(async s=>{
  const now=new Date(2026,8,9,12),start=new Date(2026,8,9).getTime(),end=new Date(2026,8,10).getTime();
  const insert=s.db.prepare('INSERT INTO activity VALUES (?,?,?,?)');
  for(let i=0;i<151;i++)insert.run('drink'+i,'drink',start+i,'喝水');
  insert.run('yesterday','drink',start-1,'喝水');insert.run('tomorrow','drink',end,'喝水');insert.run('unknown','drink',null,'旧喝水');
  insert.run('move','move',start,'活动');insert.run('water','water',end-1,'浇水');
  for(let i=0;i<103;i++){s.db.prepare('INSERT INTO catches VALUES (?,?)').run('fish'+i,i<101?'鲫鱼':'青鱼');insert.run('catch:fish'+i,'catch',i===0?null:start,'鱼');}
  const summary=s.activitySummary(now);expect(summary.dayStart).toBe(start);expect(summary.dayEnd).toBe(end);
  expect(summary.today).toEqual({drink:151,move:1,water:1,catch:102});expect(summary.totals).toEqual({drink:154,move:1,water:1,catch:103});expect(summary.unknownTime.drink).toBe(1);expect(summary.unknownTime.catch).toBe(1);
  expect(summary.fish).toEqual([{species:'鲫鱼',count:101,unknownTimeCount:1},{species:'青鱼',count:2,unknownTimeCount:0}]);expect(s.activityPage('drink').items).toHaveLength(50);
 }));
 it('migrates legacy catches without assigning a date and keeps them in fish totals',()=>fixture(async(s,dir)=>{
  await s.action('games.catch',{roundId:'old',species:'鲤鱼'});const backup=path.join(dir,'v2.sqlite');await s.action('backup.export',{path:backup});const old=new Database(backup);old.exec('DROP TABLE activity; PRAGMA user_version=2');old.close();await s.action('backup.restore',{path:backup});
  const summary=await s.action('activity.summary') as ActivitySummary;expect(summary.totals.catch).toBe(1);expect(summary.today.catch).toBe(0);expect(summary.unknownTime.catch).toBe(1);expect(summary.fish).toEqual([{species:'鲤鱼',count:1,unknownTimeCount:1}]);expect(s.activityPage('catch').items[0].at).toBe(null);
  await s.action('games.catch',{roundId:'new',species:'鲤鱼'});const next=s.activitySummary();expect(next.fish[0]).toEqual({species:'鲤鱼',count:2,unknownTimeCount:1});expect(next.today.catch).toBe(1);
 }));
 it('never increments aggregates for failed writes, and retries count once',()=>fixture(async s=>{
  const before=s.activitySummary();s.db.exec("CREATE TRIGGER fail_record BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'DISK_FULL'); END;");
  await expect(s.action('games.catch',{roundId:'retry-fish',species:'青鱼'})).rejects.toThrow('DISK_FULL');
  await expect(s.action('plants.water',{plantId:'plant',requestId:'retry-water'})).rejects.toThrow('DISK_FULL');
  await expect(s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'drink',action:'done',requestId:'retry-drink'})).rejects.toThrow('DISK_FULL');
  expect(s.activitySummary().totals).toEqual(before.totals);expect(s.snapshot().plants).toEqual({});expect(s.snapshot().catches).toBe(0);
  s.db.exec('DROP TRIGGER fail_record');
  for(let i=0;i<2;i++){await s.action('games.catch',{roundId:'retry-fish',species:'青鱼'});await s.action('plants.water',{plantId:'plant',requestId:'retry-water'});await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'drink',action:'done',requestId:'retry-drink'});}
  expect(s.activitySummary().totals).toEqual({drink:1,move:0,water:1,catch:1});
 }));
});
