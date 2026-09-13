import {_electron as electron} from 'playwright';import path from 'node:path';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const instance=await electron.launch({args:[path.resolve('out/main/index.js')],env:{...process.env,WORKBENCH_TEST:'1',WORKBENCH_DATA_DIR:path.resolve('.test-data/guard-'+Date.now())}});
try{
 const page=await instance.firstWindow();page.on('dialog',()=>{});await page.waitForFunction(()=>window.__world?.getDiagnostics().asset==='ready',{},{timeout:60000});
 await page.getByRole('button',{name:'书桌',exact:true}).click();await page.getByRole('button',{name:/记录待办/}).click();await page.getByRole('textbox',{name:'待办标题'}).fill('取消退出后仍能保存');
 // Test native guard wiring with deterministic choices; this does not assess OS dialog appearance.
 await instance.evaluate(({dialog})=>{globalThis.guardCalls=[];dialog.showMessageBoxSync=(_window,options)=>{globalThis.guardCalls.push(options);return 0}});
 await instance.evaluate(({app})=>app.quit());await page.waitForTimeout(400);
 assert.equal(await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
 assert.equal(await page.getByRole('textbox',{name:'待办标题'}).inputValue(),'取消退出后仍能保存');
 await page.getByRole('button',{name:'记到黑板'}).click();await page.getByRole('button',{name:'取消退出后仍能保存',exact:true}).waitFor();
 const bootstrap=await page.evaluate(()=>window.workbench.invoke('bootstrap.get'));assert(bootstrap.ok);assert.equal(bootstrap.data.todos.length,1);
 await page.getByRole('textbox',{name:'待办标题'}).fill('确认放弃的测试草稿');
 await instance.evaluate(({dialog})=>{dialog.showMessageBoxSync=(_window,options)=>{globalThis.guardCalls.push(options);return 1}});
 await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await new Promise(resolve=>setTimeout(resolve,300));
 assert.equal(await instance.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);
 const dialogs=await instance.evaluate(()=>globalThis.guardCalls);assert.equal(dialogs.length,2);
 await fs.writeFile('evidence/cottage-v3/native-guard.json',JSON.stringify({cancelQuitPreservesDraftAndWorker:true,confirmedDiscardCloses:true,dialogChoicesSimulated:true,dialogs},null,2));console.log('PASS cancel quit retains draft and working database; confirmed discard closes');
}finally{await instance.close()}
