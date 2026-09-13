import Database from 'better-sqlite3';
import {describe,it,expect} from 'vitest';
import {Store} from '../src/worker/database';
import {mkdtemp, mkdir,writeFile,symlink,rm,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// Uses a temporary fixture inside this project, never the real knowledge vault.
describe('persistent scoped library',()=>{it('persists todos, excludes symlinks, retains overlapping roots and deduplicates fishing',async()=>{const dir=await mkdtemp(path.join(process.cwd(),'.backend-test-'));let store:Store|undefined;try{await mkdir(path.join(dir,'notes','sub'),{recursive:true});await mkdir(path.join(dir,'notes','.obsidian'));await writeFile(path.join(dir,'notes','sub','中文 #笔记.md'),'private body');await writeFile(path.join(dir,'outside.md'),'outside');await symlink(path.join(dir,'outside.md'),path.join(dir,'notes','escape.md'));const db=path.join(dir,'test.sqlite');store=new Store(db);const root=await store.addRoot(path.join(dir,'notes'));const child=store.list(root.id)[0];expect(child.kind).toBe('dir');const entry=store.list(root.id,child.id)[0];expect(await store.resolve(entry.id)).toContain('中文 #笔记.md');const overlap=await store.addRoot(path.join(dir,'notes','sub'));store.removeRoot(root.id);expect(await store.resolve(entry.id)).toContain('中文 #笔记.md');expect(store.list(overlap.id)).toHaveLength(1);await store.action('todos.create',{title:"读书 ' SQL"});await store.action('games.catch',{roundId:'one'});await store.action('games.catch',{roundId:'one'});store.close();store=new Store(db);expect(store.snapshot().todos[0].title).toBe("读书 ' SQL");expect(store.snapshot().catches).toBe(1);store.removeRoot(overlap.id);await expect(store.resolve(entry.id)).rejects.toThrow();}finally{store?.close();await rm(dir,{recursive:true,force:true});}});});

describe('backup, pagination and undo',()=>{it('restores consistent data and supports idempotent writes',async()=>{const dir=await mkdtemp(path.join(process.cwd(),'.backend-test-'));let store:Store|undefined;try{await mkdir(path.join(dir,'notes'));await mkdir(path.join(dir,'notes','.obsidian'));for(let i=0;i<5;i++)await writeFile(path.join(dir,'notes',`${i}.md`),'');store=new Store(path.join(dir,'state.sqlite'));const root=await store.addRoot(path.join(dir,'notes'));const page=store.page(root.id,undefined,undefined,2);expect(page.entries).toHaveLength(2);const next=store.page(root.id,undefined,page.nextCursor!,2);expect(next.entries[0].id).not.toBe(page.entries[0].id);await store.action('todos.create',{title:'保留',requestId:'same'});await store.action('todos.create',{title:'保留',requestId:'same'});expect(store.snapshot().todos).toHaveLength(1);const id=store.snapshot().todos[0].id;await store.action('todos.delete',{id});expect(store.snapshot().todos).toHaveLength(0);await store.action('todos.undo',{id});expect(store.snapshot().todos).toHaveLength(1);const backup=path.join(dir,'backup.sqlite');await store.action('backup.export',{path:backup});await store.action('todos.create',{title:'备份后添加'});await store.action('backup.restore',{path:backup});expect(store.snapshot().todos.map(t=>t.title)).toEqual(['保留']);await store.action('plants.water',{plantId:'balcony',requestId:'water'});const time=store.snapshot().plants.balcony;await store.action('plants.water',{plantId:'balcony',requestId:'water'});expect(store.snapshot().plants.balcony).toBe(time);}finally{store?.close();await rm(dir,{recursive:true,force:true});}});});

it('backs up version one before schema migration',async()=>{const dir=await mkdtemp(path.join(process.cwd(),'.backend-test-'));let store:Store|undefined;try{const filename=path.join(dir,'old.sqlite');const old=new Database(filename);old.exec("CREATE TABLE todos(id TEXT PRIMARY KEY,title TEXT NOT NULL,completed INTEGER DEFAULT 0); INSERT INTO todos VALUES ('kept','旧待办',0); PRAGMA user_version=1");old.close();store=new Store(filename);expect(store.snapshot().todos[0].title).toBe('旧待办');const backup=(await readdir(dir)).find(f=>f.includes('before-v2'));expect(backup).toBeTruthy();const saved=new Database(path.join(dir,backup!),{readonly:true});expect(saved.pragma('user_version',{simple:true})).toBe(1);saved.close();}finally{store?.close();await rm(dir,{recursive:true,force:true});}});

describe('vault recognition and recent controls',()=>{
 it('rejects ordinary folders without inserting roots, accepts nested vault scope, and rechecks an old scope before opening',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'workbench-vault-test-'));let store:Store|undefined;
  try{
   const scope=path.join(dir,'vault','selected','nested');await mkdir(scope,{recursive:true});
   await writeFile(path.join(scope,'原文.md'),'unchanged');store=new Store(path.join(dir,'state.sqlite'));
   await expect(store.addRoot(scope)).rejects.toThrow('ROOT_NOT_OBSIDIAN_VAULT');expect(store.roots()).toHaveLength(0);
   await mkdir(path.join(dir,'vault','.obsidian'));
   const root=await store.addRoot(scope);const entry=store.list(root.id)[0];
   expect(store.list(root.id)).toHaveLength(1);expect(await store.resolve(entry.id)).toBe(await realpath(path.join(scope,'原文.md')));
   await rm(path.join(dir,'vault','.obsidian'),{recursive:true});
   await expect(store.resolve(entry.id)).rejects.toThrow('ROOT_NOT_OBSIDIAN_VAULT');
  }finally{store?.close();await rm(dir,{recursive:true,force:true});}
 });
 it('returns five latest unique notes and removes only history, retaining original files and library entries',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'workbench-vault-test-'));let store:Store|undefined;
  try{
   await mkdir(path.join(dir,'vault','.obsidian'),{recursive:true});
   for(let i=0;i<7;i++)await writeFile(path.join(dir,'vault',`${i}.md`),'original');
   store=new Store(path.join(dir,'state.sqlite'));const root=await store.addRoot(path.join(dir,'vault'));const notes=store.list(root.id);
   for(const entry of notes)await store.action('library.accept',{entryId:entry.id});
   expect(store.snapshot().recent.map(e=>e.id)).toEqual(notes.slice(2).reverse().map(e=>e.id));
   await store.action('library.accept',{entryId:notes[0].id});expect(store.snapshot().recent[0].id).toBe(notes[0].id);
   await store.action('recent.remove',{entryId:notes[0].id});expect(store.snapshot().recent.some(e=>e.id===notes[0].id)).toBe(false);
   expect(store.list(root.id)).toHaveLength(7);expect(await store.resolve(notes[0].id)).toBe(notes[0].path);
   await store.action('recent.remove',{entryId:notes[0].id});
  }finally{store?.close();await rm(dir,{recursive:true,force:true});}
 });
});
