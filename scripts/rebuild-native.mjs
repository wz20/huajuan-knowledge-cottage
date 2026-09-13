import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);const version=require('electron/package.json').version;
const result=spawnSync(process.execPath,[require.resolve('node-gyp/bin/node-gyp.js'),'rebuild','--directory=node_modules/better-sqlite3','--runtime=electron',`--target=${version}`,`--arch=${process.arch}`,'--dist-url=https://www.electronjs.org/headers',`--devdir=${path.resolve('.cache/node-gyp')}`],{stdio:'inherit'});
process.exit(result.status??1);
