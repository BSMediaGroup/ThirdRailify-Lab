import {readFile} from 'node:fs/promises';
import {parseEnv} from '../lib/core.mjs';
import {cloudflare,accountId} from './cloudflare-client.mjs';
const keys=['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY'];
const source=parseEnv(await readFile(new URL('../poc/.env',import.meta.url),'utf8'));
const secrets={};for(const k of keys){if(!source[k])throw new Error('Missing allowlisted provider credential: '+k);secrets[k]={type:'secret_text',value:source[k]};}
const r=await fetch('https://api.replicate.com/v1/webhooks/default/secret',{headers:{Authorization:'Bearer '+source.REPLICATE_API_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});
if(!r.ok)throw new Error('Replicate signing-secret lookup rejected: '+r.status);const signing=await r.json();if(typeof signing.key!=='string'||!signing.key.startsWith('whsec_'))throw new Error('Invalid Replicate signing-secret contract');
secrets.REPLICATE_WEBHOOK_SIGNING_SECRET={type:'secret_text',value:signing.key};
const route=`/accounts/${accountId}/pages/projects/thirdrailify-lab`,before=await cloudflare(route);
if(before.source?.type!=='github')throw new Error('Git-integrated Pages required');
await cloudflare(route,{method:'PATCH',body:{deployment_configs:{production:{env_vars:secrets,fail_open:false},preview:{fail_open:false}}}});
const after=await cloudflare(route);for(const k of Object.keys(secrets))if(after.deployment_configs.production.env_vars[k]?.type!=='secret_text')throw new Error('Secret not provisioned: '+k);
console.log(JSON.stringify({project:after.id,encryptedSecretNames:Object.keys(secrets),signingSecretSource:'Replicate documented authenticated endpoint',valuesPrinted:false}));
