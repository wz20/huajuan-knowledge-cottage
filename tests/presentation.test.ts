import Database from 'better-sqlite3';
import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../src/worker/database';
import {validate} from '../src/main/validation';
async function fixture(run:(s:Store,dir:string)=>Promise<void>){const dir=await mkdtemp(path.join(os.tmpdir(),'cottage-presentation-'));const s=new Store(path.join(dir,'state.sqlite'));try{await run(s,dir);}finally{s.close();await rm(dir,{recursive:true,force:true});}}
describe('planet presentation and watering persistence',()=>{
 it('derives old zones without changing existing data, remembers preferences, and never stores playback',()=>fixture(async s=>{
  expect(s.presentation()).toEqual({theme:'auto',musicVolume:0.35,mode:'work'});
  s.set('zone','pond');expect(s.snapshot().mode).toBe('leisure');
  await s.action('settings.presentation',{theme:'night',musicVolume:0.2});expect(s.snapshot().zone).toBe('pond');
  await s.action('settings.presentation',{mode:'work'});expect(s.snapshot().zone).toBe('overview');
  await s.action('settings.zone',{zone:'piano'});expect(s.snapshot().mode).toBe('leisure');
  await s.action('settings.zone',{zone:'overview'});expect(s.snapshot().mode).toBe('leisure');
  await s.action('settings.zone',{zone:'library'});expect(s.snapshot().mode).toBe('work');
  expect(s.snapshot().theme).toBe('night');expect(s.snapshot().musicVolume).toBe(0.2);
  expect(s.snapshot()).not.toHaveProperty('musicPlaying');
 }));
 it('rejects invalid preferences before any partial write',()=>fixture(async s=>{
  for(const payload of [{theme:'sunset'},{musicVolume:-1},{musicVolume:1.1},{musicVolume:NaN},{musicVolume:'1'},{mode:'custom'},{theme:'night',musicVolume:Infinity}]){
   expect(()=>validate('settings.presentation',payload)).toThrow('INVALID_INPUT');
   await expect(s.action('settings.presentation',payload)).rejects.toThrow('INVALID_INPUT');
  }
  expect(s.snapshot().theme).toBe('auto');
 }));
 it('logs successful watering once with the same timestamp and rolls back failed writes',()=>fixture(async s=>{
  await s.action('plants.water',{plantId:'balcony',requestId:'water1'});
  const first=s.activityPage('water');expect(first.total).toBe(1);expect(first.items[0].at).toBe(s.snapshot().plants.balcony);
  await s.action('plants.water',{plantId:'balcony',requestId:'water1'});expect(s.activityPage('water')).toEqual(first);
  s.db.exec("CREATE TRIGGER fail_water BEFORE INSERT ON activity WHEN NEW.kind='water' BEGIN SELECT RAISE(ABORT,'DISK_FULL'); END;");
  await expect(s.action('plants.water',{plantId:'desk',requestId:'water2'})).rejects.toThrow('DISK_FULL');expect(s.snapshot().plants).not.toHaveProperty('desk');expect(s.activityPage('water').total).toBe(1);
  s.db.exec('DROP TRIGGER fail_water');await s.action('plants.water',{plantId:'desk',requestId:'water2'});expect(s.activityPage('water').total).toBe(2);
 }));
 it('restores v3 and v4 without losing historical records, settings or fabricating prior watering',()=>fixture(async(s,dir)=>{
  await s.action('todos.create',{title:'保留待办',requestId:'todo'});await s.action('games.catch',{roundId:'fish',species:'鲤鱼'});s.set('plants',{balcony:123});s.set('zone','balcony');
  const original=s.activityPage().items;const backup=path.join(dir,'v3.sqlite');await s.action('backup.export',{path:backup});const old=new Database(backup);old.exec("ALTER TABLE activity RENAME TO old_activity; DROP INDEX activity_kind_at; CREATE TABLE activity(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('drink','move','catch')),at INTEGER,label TEXT NOT NULL); INSERT INTO activity SELECT * FROM old_activity; DROP TABLE old_activity; PRAGMA user_version=3");old.close();
  await s.action('backup.restore',{path:backup});expect(s.db.pragma('user_version',{simple:true})).toBe(4);expect(s.activityPage().items).toEqual(original);expect(s.activityPage('water').total).toBe(0);expect(s.snapshot().plants.balcony).toBe(123);expect(s.snapshot().mode).toBe('leisure');expect(s.snapshot().todos[0].title).toBe('保留待办');
  await s.action('settings.presentation',{theme:'day',musicVolume:0.8});await s.action('plants.water',{plantId:'balcony',requestId:'fresh'});const current=s.snapshot();const modern=path.join(dir,'v4.sqlite');await s.action('backup.export',{path:modern});await s.action('settings.presentation',{theme:'night'});await s.action('backup.restore',{path:modern});expect(s.snapshot()).toEqual(current);expect(s.activityPage('water').total).toBe(1);
 }));
 it('backs up v3 before startup migration and preserves records across reopen',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'cottage-v4-'));let s:Store|undefined;
  try{const filename=path.join(dir,'state.sqlite');s=new Store(filename);await s.action('games.catch',{roundId:'old',species:'青鱼'});const before=s.activityPage();s.db.pragma('user_version=3');s.close();s=new Store(filename);expect((await readdir(dir)).filter(f=>f.includes('before-v4'))).toHaveLength(1);expect(s.activityPage()).toEqual(before);await s.action('settings.presentation',{theme:'night',mode:'leisure',musicVolume:0});s.close();s=new Store(filename);expect(s.presentation()).toEqual({theme:'night',mode:'leisure',musicVolume:0});expect((await readdir(dir)).filter(f=>f.includes('before-v4'))).toHaveLength(1);}finally{s?.close();await rm(dir,{recursive:true,force:true});}
 });
});
