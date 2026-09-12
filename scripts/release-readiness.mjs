import {cloudflare,accountId} from './cloudflare-client.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const authId='b8be3879-7aa1-4d70-af3f-617abce7a929';
const query=sql=>cloudflare(`/accounts/${accountId}/d1/database/${authId}/query`,{method:'POST',body:{sql}});
const [ledger,schema,accounts,sessions,pages,widgets]=await Promise.all([
 query('SELECT * FROM d1_migrations ORDER BY id'),
 query("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name"),
 query('SELECT role,admin_level,status,count(*) AS count FROM accounts GROUP BY role,admin_level,status'),
 query('SELECT count(*) AS sessions FROM sessions'),
 cloudflare(`/accounts/${accountId}/pages/projects/thirdrailify-lab`),
 cloudflare(`/accounts/${accountId}/challenges/widgets`).then(x=>x.map(w=>({sitekey:w.sitekey,name:w.name,domains:w.domains,mode:w.mode}))).catch(e=>({error:e.message})),
]);
const root='X:/GIT/_BACKUPS/ThirdRailify/workshop-20260912';
const sql=await readFile(root+'/thirdrailify-accounts-before-workshop.sql');
const hash=createHash('sha256').update(sql).digest('hex');
if(sql.length!==298032||hash!=='bcffb3516e409c2cadfb137f361ec0e1f102cee8ebf36be0414ae2e2273b0476')throw new Error('Backup verification failed');
const baseline={checkedAt:new Date().toISOString(),databaseId:authId,backup:{bytes:sql.length,sha256:hash},ledger,schema,accounts,sessions};
await writeFile(root+'/schema-row-baseline.json',JSON.stringify(baseline,null,2));
await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/turnstile-readiness.json',JSON.stringify(widgets,null,2));
console.log(JSON.stringify({backupVerified:true,ledger,accounts,pages:{id:pages.id,source:pages.source.type,deployments:pages.latest_deployment?.id||null},widgets},null,2));
