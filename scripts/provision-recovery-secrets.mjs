import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {parseEnv} from '../lib/core.mjs';
// This helper does not receive canonical auth secrets or webhook signing material.
const source=parseEnv(await readFile(new URL('../poc/.env',import.meta.url),'utf8'));
const values=Object.fromEntries(['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY'].map(k=>{if(!source[k])throw new Error('Missing '+k);return[k,source[k]];}));
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk','--config','backend/wrangler.jsonc'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.stdin.end(JSON.stringify(values));
const code=await new Promise(resolve=>child.on('close',resolve));if(code!==0){console.error('Recovery secret provisioning failed; native exit '+code);process.exit(code||1);}console.log('Encrypted recovery secret names: '+Object.keys(values).join(', '));
