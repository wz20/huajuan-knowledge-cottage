import {_electron as electron} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=path.resolve('.test-data/smoke-'+Date.now());
await fs.mkdir(base,{recursive:true});
const packaged=process.env.WORKBENCH_EXECUTABLE;
const app=await electron.launch({...(packaged?{executablePath:packaged,args:[]}:{args:['.']}),env:{...process.env,WORKBENCH_TEST:'1',WORKBENCH_DATA_DIR:base}});
try {
 const page=await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.waitForFunction(()=>window.__world?.getDiagnostics().asset==='ready',null,{timeout:90000});
 const result=await page.evaluate(()=>window.workbench.invoke('bootstrap.get'));
 assert.equal(result.ok,true);assert.equal(errors.length,0,errors.join('\n'));
 await fs.mkdir('evidence',{recursive:true});await page.screenshot({path:'evidence/startup.png'});
 console.log('PASS: Electron window, GLB ready, isolated database IPC, no renderer errors');
} finally {await app.close();}
