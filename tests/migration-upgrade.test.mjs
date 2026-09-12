import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Miniflare} from 'miniflare';
test('existing account schema upgrades preserve account rows; fresh Lab schema has independent ownership constraints',async t=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response()}}',compatibilityDate:'2026-01-20',d1Databases:['AUTH','LAB']});t.after(()=>mf.dispose());const auth=await mf.getD1Database('AUTH'),lab=await mf.getD1Database('LAB');
 async function apply(db,url){let sql='';for(const line of (await readFile(url,'utf8')).replace(/^--.*$/gm,'').split(/\r?\n/)){sql+=line+'\n';if(line.trim().endsWith(';')){await db.prepare(sql).run();sql='';}}}
 const adminRoot=process.env.LAB_TEST_ADMIN_ROOT ? pathToFileURL(process.env.LAB_TEST_ADMIN_ROOT.replace(/[\\/]?$/, '/')) : new URL('../../ThirdRailify-Admin/',import.meta.url);
 const base=new URL('migrations/',adminRoot);
 await apply(auth,new URL('0001_auth_foundation.sql',base));await auth.prepare("INSERT INTO accounts(id,display_name,role,admin_level,status,created_at,updated_at,source) VALUES('preserved','Existing account','user','none','active','2026-01-01','2026-01-01','test')").run();const before=await auth.prepare('SELECT * FROM accounts').all();
 await apply(auth,new URL('0002_full_admin_capability_denials.sql',base));await apply(auth,new URL('0003_workshop_access.sql',base));assert.deepEqual((await auth.prepare('SELECT * FROM accounts').all()).results,before.results);assert.equal((await auth.prepare('SELECT count(*) n FROM workshop_access').first()).n,0);assert.deepEqual((await auth.prepare('PRAGMA foreign_key_check').all()).results,[]);
 await apply(lab,new URL('../migrations/0001_lab.sql',import.meta.url));assert.equal((await lab.prepare('SELECT version FROM lab_schema').first()).version,1);await apply(lab,new URL('../migrations/0002_provider_vault_stock_usage.sql',import.meta.url));await apply(lab,new URL('../migrations/0003_provider_cost_intelligence.sql',import.meta.url));assert.equal((await lab.prepare('SELECT version FROM lab_schema').first()).version,3);assert.deepEqual((await lab.prepare('PRAGMA foreign_key_check').all()).results,[]);
});
