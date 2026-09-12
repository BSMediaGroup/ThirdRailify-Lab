import {spawn} from 'node:child_process';
import {appendFile} from 'node:fs/promises';
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','pages','deployment','tail','f6b685f8-47a6-42ec-9dd4-47db1b4c6d18','--project-name','thirdrailify-lab','--format','json'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let buffer='',depth=0,quoted=false,escaped=false;
child.stdout.on('data',bytes=>{for(const c of bytes.toString()){
 if(depth===0&&c!=='{')continue;buffer+=c;
 if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
 else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}')depth--;
 if(depth===0){try{const event=JSON.parse(buffer);
  for(const entry of event.logs||[])for(const message of entry.message||[]){
   if(typeof message!=='string'||!message.startsWith('{"event":"lab-render-check-v1"'))continue;
   const d=JSON.parse(message);const allowed=Object.fromEntries(['event','border','logo','scheme','button','stylesheet','darkReader','forcedColors','late'].map(k=>[k,d[k]]));
   console.log(JSON.stringify(allowed));void appendFile('.artifacts/live/render-check.jsonl',JSON.stringify(allowed)+'\n');
  }
 }catch{}buffer='';}
}});
child.stderr.on('data',b=>{if(/error/i.test(b.toString()))console.log('Tail connection error; inspect CLI authorization.');});
child.on('exit',c=>console.log('Render tail closed '+c));process.on('SIGINT',()=>child.kill());console.log('Listening only for fixed-field render diagnostics; no request credentials or user content.');
