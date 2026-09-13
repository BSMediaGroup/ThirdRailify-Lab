import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {cloudflare,accountId} from './cloudflare-client.mjs';

const repository=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const wrangler=path.join(repository,'node_modules','wrangler','bin','wrangler.js');
const backend=path.join(repository,'backend');
const name='LAB_ASSET_DELIVERY_SIGNING_SECRET';

function wranglerCommand(args,input=''){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[wrangler,...args],{cwd:backend,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(new Error(`Wrangler secret operation failed (${code}): ${stderr.replace(/[^\r\n]*value[^\r\n]*/gi,'[redacted]')}`)));
    child.stdin.end(input);
  });
}

const value=randomBytes(32).toString('base64url');
const route=`/accounts/${accountId}/pages/projects/thirdrailify-lab`;
const before=await cloudflare(route);if(before.source?.type!=='github')throw new Error('Git-integrated Pages required');
await cloudflare(route,{method:'PATCH',body:{deployment_configs:{production:{env_vars:{[name]:{type:'secret_text',value}}}}}});
await wranglerCommand(['secret','put',name,'--config','wrangler.jsonc'],value+'\n');
const [after,workerList]=await Promise.all([cloudflare(route),wranglerCommand(['secret','list','--config','wrangler.jsonc'])]);
if(after.deployment_configs.production.env_vars[name]?.type!=='secret_text')throw new Error('Pages signing secret was not provisioned.');
const workerNames=JSON.parse(workerList).map(item=>item.name);if(!workerNames.includes(name))throw new Error('Recovery signing secret was not provisioned.');
console.log(JSON.stringify({pagesProject:after.name,recoveryWorker:'thirdrailify-lab-recovery',encryptedSecretNames:[name],valuesPrinted:false}));
