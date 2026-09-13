import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';
import {Store} from '../src/worker/database';
it('counts nested notes, empty folders, overlapping roots and refreshes after file moves',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'library-count-'));let store:Store|undefined;
 try{const vault=path.join(dir,'vault');await mkdir(path.join(vault,'.obsidian'),{recursive:true});
 await mkdir(path.join(vault,'Agent/deep'),{recursive:true});await mkdir(path.join(vault,'Empty'));
 await writeFile(path.join(vault,'root.md'),'root');await writeFile(path.join(vault,'Agent/a.md'),'a');
 await writeFile(path.join(vault,'Agent/deep/b.MD'),'b');await writeFile(path.join(vault,'Agent/picture.png'),'image');
 store=new Store(path.join(dir,'test.sqlite'));const root=await store.addRoot(vault);
 const nested=await store.addRoot(path.join(vault,'Agent'));const stats=store.libraryStats();
 expect(stats.totalNotes).toBe(3);expect(stats.counts[root.id]).toEqual({notes:3,directNotes:1,folders:2});
 expect(stats.counts[nested.id].notes).toBe(2);
 const empty=store.list(root.id).find(e=>e.name==='Empty')!;expect(stats.counts[empty.id].notes).toBe(0);
 const agent=store.list(root.id).find(e=>e.name==='Agent')!;expect(stats.counts[agent.id].notes).toBe(2);
 expect(store.page(root.id,undefined,undefined,1).nextCursor).toBeTruthy();
 // Totals cover all files, independent of UI pagination.
 for(let i=0;i<105;i++)await writeFile(path.join(vault,'Empty',i+'.md'),'');
 await store.scan(root.id);expect(store.libraryStats().counts[empty.id].notes).toBe(105);
 await rename(path.join(vault,'Agent/a.md'),path.join(vault,'Empty/a.md'));
 await store.action('library.refresh');expect(store.libraryStats().counts[agent.id].notes).toBe(1);
 expect(store.libraryStats().totalNotes).toBe(108);
 store.removeRoot(root.id);expect(store.libraryStats().totalNotes).toBe(1);
 store.close();store=new Store(path.join(dir,'test.sqlite'));expect(store.libraryStats().totalNotes).toBe(1);
 }finally{store?.close();await rm(dir,{recursive:true,force:true})}
});
