import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cloudflare,accountId} from './cloudflare-client.mjs';
const root='X:/GIT/ThirdRailify-Admin/.artifacts/workshop-migrations';await mkdir(root+'/migrations',{recursive:true});
const names=['0001_auth_foundation.sql','0002_full_admin_capability_denials.sql','0003_workshop_access.sql'];
const manifest=[];for(const name of names){const bytes=await readFile('X:/GIT/ThirdRailify-Admin/migrations/'+name);await copyFile('X:/GIT/ThirdRailify-Admin/migrations/'+name,root+'/migrations/'+name);manifest.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});}
const accountDb='b8be3879-7aa1-4d70-af3f-617abce7a929';
const remote=await cloudflare(`/accounts/${accountId}/d1/database/${accountDb}/query`,{method:'POST',body:{sql:'SELECT name FROM d1_migrations ORDER BY id'}});
if(remote[0].results.some(x=>!names.includes(x.name)))throw new Error('Unexpected account migration ledger; review before applying');
await writeFile(root+'/wrangler.jsonc',JSON.stringify({name:'workshop-migration-check',account_id:accountId,compatibility_date:'2026-09-12',d1_databases:[{binding:'THIRDRAILIFY_AUTH_DB',database_name:'thirdrailify-accounts',database_id:accountDb,migrations_dir:'migrations'}]},null,2));
await writeFile(root+'/reviewed-manifest.json',JSON.stringify({checkedAt:new Date().toISOString(),databaseId:accountDb,applied:remote[0].results,reviewed:manifest},null,2));
console.log(JSON.stringify({config:root+'/wrangler.jsonc',pending:names.filter(n=>!remote[0].results.some(x=>x.name===n)),manifest},null,2));
