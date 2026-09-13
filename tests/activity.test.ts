import Database from 'better-sqlite3';
import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../src/worker/database';
import {validate} from '../src/main/validation';

async function fixture(run:(store:Store,dir:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'cottage-activity-'));const store=new Store(path.join(dir,'state.sqlite'));try{await run(store,dir);}finally{store.close();await rm(dir,{recursive:true,force:true});}}
describe('durable activity history',()=>{
 it('atomically saves manual water and completed breaks, deduplicates retries, and never counts snoozing or starting as completion',()=>fixture(async s=>{
  const original=s.snapshot().reminders;
  await s.action('reminders.respond',{reminders:original,kind:'drink',action:'done',requestId:'water1'});
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'drink',action:'done',requestId:'water1'});
  expect(s.activityPage('drink').total).toBe(1);expect(s.activityPage('drink').items[0].at).toBeTypeOf('number');
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'move',action:'start_break',requestId:'start1'});
  expect(s.activityPage('move').total).toBe(0);
  const episodeId=s.snapshot().reminders.find(r=>r.kind==='move')!.episodeId;
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'move',action:'end_break',episodeId});
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'move',action:'end_break',episodeId});
  expect(s.activityPage('move').total).toBe(1);
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'drink',action:'snooze'});
  expect(s.activityPage().total).toBe(2);
  await expect(s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'drink',action:'done'})).rejects.toThrow('INVALID_REQUEST_ID');
 }));
 it('resolves a due episode exactly once even if the first reply was lost',()=>fixture(async s=>{
  const reminders=s.snapshot().reminders;reminders[0].phase='due';reminders[0].remainingMs=0;reminders[0].episodeId='due1';await s.action('reminders.save',{reminders});
  await s.action('reminders.respond',{reminders,kind:'drink',action:'done',episodeId:'due1'});
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,kind:'drink',action:'done',episodeId:'due1'});
  await s.action('reminders.respond',{reminders:s.snapshot().reminders,action:'done',episodeId:'due1'});
  expect(s.activityPage('drink').total).toBe(1);expect(s.snapshot().reminders[0].phase).toBe('counting');
 }));
 it('rolls back both reminder state and record if storage fails and permits safe retry',()=>fixture(async s=>{
  const before=s.snapshot().reminders;before[0].remainingMs=1234;await s.action('reminders.save',{reminders:before});
  s.db.exec("CREATE TRIGGER simulate_full BEFORE INSERT ON activity BEGIN SELECT RAISE(ABORT,'DISK_FULL'); END;");
  const p={reminders:before,kind:'drink',action:'done',requestId:'retry'};
  await expect(s.action('reminders.respond',p)).rejects.toThrow('DISK_FULL');
  expect(s.snapshot().reminders).toEqual(before);expect(s.activityPage().total).toBe(0);
  await expect(s.action('games.catch',{roundId:'failed-catch',species:'鱼'})).rejects.toThrow('DISK_FULL');expect(s.snapshot().catches).toBe(0);
  s.db.exec('DROP TRIGGER simulate_full');await s.action('reminders.respond',p);expect(s.activityPage().total).toBe(1);
 }));
 it('keeps catch history in the same transaction and paginates all or one kind',()=>fixture(async s=>{
  for(let i=0;i<5;i++)await s.action('games.catch',{roundId:`fish${i}`,species:`鱼${i}`});
  await s.action('games.catch',{roundId:'fish0',species:'重复'});
  const one=s.activityPage('catch',undefined,2),two=s.activityPage('catch',one.nextCursor!,2),three=s.activityPage('catch',two.nextCursor!,2);
  expect(one.total).toBe(5);expect(new Set([...one.items,...two.items,...three.items].map(i=>i.id)).size).toBe(5);expect(three.nextCursor).toBe(null);
  expect(s.activityPage('drink').total).toBe(0);expect(s.snapshot().catches).toBe(5);
  for(const p of [{kind:'invalid'},{limit:101},{cursor:'-1'}])expect(()=>validate('activity.list',p)).toThrow();
 }));
 it('restores old version 2 catches with unknown dates and preserves timestamped new backups',()=>fixture(async(s,dir)=>{
  await s.action('games.catch',{roundId:'legacy',species:'鲫鱼'});
  const old=path.join(dir,'v2.sqlite');await s.action('backup.export',{path:old});const db=new Database(old);db.exec('DROP TABLE activity; PRAGMA user_version=2');db.close();
  await s.action('backup.restore',{path:old});expect(s.activityPage().items).toEqual([{id:'catch:legacy',kind:'catch',at:null,label:'鲫鱼'}]);expect(s.db.pragma('user_version',{simple:true})).toBe(4);
  await s.action('games.catch',{roundId:'new',species:'鲤鱼'});const items=s.activityPage().items;
  const modern=path.join(dir,'v3.sqlite');await s.action('backup.export',{path:modern});await s.action('games.catch',{roundId:'discarded'});await s.action('backup.restore',{path:modern});expect(s.activityPage().items).toEqual(items);
 }));
 it('backs up and migrates version 2 once without inventing historical times',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'cottage-migration-'));let s:Store|undefined;
  try{const filename=path.join(dir,'old.sqlite');s=new Store(filename);await s.action('games.catch',{roundId:'kept',species:'青鱼'});s.db.exec('DROP TABLE activity; PRAGMA user_version=2');s.close();s=new Store(filename);expect(s.activityPage().items[0].at).toBe(null);expect((await readdir(dir)).filter(f=>f.includes('before-v3'))).toHaveLength(1);s.close();s=new Store(filename);expect(s.activityPage().total).toBe(1);expect((await readdir(dir)).filter(f=>f.includes('before-v3'))).toHaveLength(1);}finally{s?.close();await rm(dir,{recursive:true,force:true});}
 });
});
