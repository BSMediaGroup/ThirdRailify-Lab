import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stalePricingEntries} from '../lib/provider-pricing.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),mode=process.argv[2];
if(!['typecheck','lint'].includes(mode))throw new Error('Use typecheck or lint.');
const roots=['backend','functions','lib','public','scripts'],files=[];
async function walk(directory){for(const item of await readdir(directory,{withFileTypes:true})){const full=path.join(directory,item.name);if(item.isDirectory())await walk(full);else if(/\.(?:js|mjs)$/.test(item.name))files.push(full);}}
for(const directory of roots)await walk(path.join(root,directory));
const failures=[];
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status)failures.push(path.relative(root,file)+': '+(result.stderr||result.stdout).trim());}
if(mode==='lint')for(const file of files){const source=await readFile(file,'utf8');if(source.includes('\u0000'))failures.push(path.relative(root,file)+': NUL byte');}
const stale=stalePricingEntries();if(stale.length)console.warn(`Pricing review warning: ${stale.map(entry=>entry.id).join(', ')}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`${mode}: checked ${files.length} JavaScript modules; ${stale.length} stale pricing entries.`);
