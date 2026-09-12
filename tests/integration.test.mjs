import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { createHash, createHmac } from 'node:crypto';
import { apiRoute } from '../lib/api.mjs';
import { authorize } from '../lib/auth.mjs';
import { workshopAccess } from '../lib/workshop-policy.js';
import { enqueue, receiveWebhook, recover } from '../lib/jobs.mjs';
import { onRequest } from '../functions/_middleware.js';
import { onRequest as accessHandler } from '../../ThirdRailify-Admin/functions/api/workshop/[[path]].js';
import { createSession, createHandoff, consumeHandoff } from '../../ThirdRailify-Admin/functions/_shared/auth-core.js';
const origin='https://lab.thirdrailify.com',projectA=crypto.randomUUID(),projectB=crypto.randomUUID();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const hash=s=>createHash('sha256').update(s).digest('base64url');
async function schema(db,path){const source=(await readFile(path,'utf8')).replace(/^--.*$/gm,'');let part='';for(const line of source.split(/\r?\n/)){part+=line+'\n';if(line.trim().endsWith(';')){await db.prepare(part).run();part='';}}if(part.trim())throw new Error('Unterminated SQL');}
test('real local D1/R2: authority, revisions, isolation, webhook, recovery and fail-closed routes',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-01-20',d1Databases:['LAB_DB','THIRDRAILIFY_AUTH_DB'],r2Buckets:['LAB_FILES']});
  t.after(()=>mf.dispose());
  const env=await mf.getBindings();Object.assign(env,{LAB_ENABLED:'true',LAB_PAID_ENABLED:'true',LAB_ORIGIN:origin,REPLICATE_API_TOKEN:'local-fixture-token',REPLICATE_WEBHOOK_SIGNING_SECRET:'whsec_'+Buffer.from('local-test-signature-key-32-bytes!').toString('base64')});
  await schema(env.LAB_DB,new URL('../migrations/0001_lab.sql',import.meta.url));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('../../ThirdRailify-Admin/migrations/0001_auth_foundation.sql',import.meta.url));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('../../ThirdRailify-Admin/migrations/0002_full_admin_capability_denials.sql',import.meta.url));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('../../ThirdRailify-Admin/migrations/0003_workshop_access.sql',import.meta.url));
  for(const [id,level,status]of [['master1','master','active'],['master2','master','active'],['full','full','active'],['a','none','active'],['b','none','active'],['disabled','none','disabled']])await env.THIRDRAILIFY_AUTH_DB.prepare('INSERT INTO accounts(id,display_name,role,admin_level,status,created_at,updated_at,source) VALUES(?,?,?,?,?,?,?,?)').bind(id,id,level==='none'?'user':'admin',level,status,'2026-01-01','2026-01-01',level==='master'?'env_master':'test').run();
  const auth=owner=>({owner,policy:{canManageProviders:true}});
  async function api(owner,path,body){return apiRoute(env,new Request(origin+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),auth(owner),{waitUntil(){}});}
  await t.test('Master 1, Master 2, Full Admin defaults; regular denied, explicit grant; disabled denied',async()=>{
    for(const owner of ['master1','master2','full'])assert.equal((await workshopAccess(env.THIRDRAILIFY_AUTH_DB,owner)).allowed,true);
    assert.equal((await workshopAccess(env.THIRDRAILIFY_AUTH_DB,'a')).allowed,false);
    for(const owner of ['a','b','disabled'])await env.THIRDRAILIFY_AUTH_DB.prepare("INSERT INTO workshop_access VALUES(?,'granted',NULL,1,'master1','2026-01-01','test')").bind(owner).run();
    assert.equal((await workshopAccess(env.THIRDRAILIFY_AUTH_DB,'a')).allowed,true);assert.equal((await workshopAccess(env.THIRDRAILIFY_AUTH_DB,'disabled')).allowed,false);
    assert.equal((await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT role FROM accounts WHERE id='a'").first()).role,'user');
  });
  await t.test('current session revocation and exact origin/CSRF/account isolation',async()=>{
    const token='a'.repeat(43),csrf='valid-csrf';await env.THIRDRAILIFY_AUTH_DB.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)').bind('session-a','a',hash(token),hash(csrf),'2026-01-01','2099-01-01','2026-01-01',null,origin,null).run();
    const req=(extra={})=>new Request(origin+'/api/projects',{method:'POST',headers:{Cookie:'thirdrailify_session='+token,Origin:origin,'X-Lab-CSRF':csrf,...extra}});
    assert.equal((await authorize(env,req())).owner,'a');await assert.rejects(authorize(env,req({Origin:'https://evil.example'})),/origin denied/);await assert.rejects(authorize(env,req({'X-Lab-CSRF':'wrong'})),/verification/);await assert.rejects(authorize(env,req({'X-Lab-Account':'b'})),/account changed/);
    await env.THIRDRAILIFY_AUTH_DB.prepare("UPDATE workshop_access SET state='revoked' WHERE account_id='a'").run();await assert.rejects(authorize(env,req()),/not enabled/);await env.THIRDRAILIFY_AUTH_DB.prepare("UPDATE workshop_access SET state='granted' WHERE account_id='a'").run();
  });
  await t.test('project create, stale revision race, private R2 and forged file ownership',async()=>{
    for(const [owner,p]of [['a',projectA],['b',projectB]])assert.equal((await (await api(owner,'/api/projects',{id:p,name:owner,project:{},revision:0})).json()).project.revision,1);
    const race=await Promise.allSettled([api('a','/api/projects',{id:projectA,name:'first',project:{},revision:1}),api('a','/api/projects',{id:projectA,name:'second',project:{},revision:1})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
    await assert.rejects(api('b','/api/projects',{id:projectA,name:'forged',project:{},revision:2}),/changed/);
    const r=await (await api('a','/api/import',{projectId:projectA,dataUrl:'data:image/png;base64,'+png.toString('base64')})).json();const asset=r.asset;assert.deepEqual(Buffer.from(await (await api('a',asset.url)).arrayBuffer()),png);await assert.rejects(api('b',asset.url),/not found/);
    await assert.rejects(api('b','/api/projects',{id:projectB,name:'forged ref',project:{assetId:asset.id},revision:1}),/not found/);
    await api('a','/api/projects',{id:projectA,name:'with image',project:{assetId:asset.id},revision:2});await assert.rejects(api('a',`/api/assets/${asset.id}/delete`,{}),/referenced/);
  });
  let job;
  await t.test('prompt-free job persisted once, replay conflict, callback before response and duplicates',async()=>{
    const provider={key(){return 'fixture';},async model(){return{id:'fixture/prompt-free',version:'a'.repeat(64),schema:{type:'object',properties:{},required:[]},official:false};}};
    const input={provider:'replicate',model:'fixture/prompt-free',prompt:'',input:{},options:{},projectId:projectA,requestId:crypto.randomUUID()};job=await enqueue(env,auth('a'),input,provider);assert.equal(job.status,'queued');assert.equal((await enqueue(env,auth('a'),input,provider)).id,job.id);await assert.rejects(enqueue(env,auth('a'),{...input,prompt:'different'},provider),/reused/);
    await env.LAB_DB.prepare("UPDATE jobs SET status='submitting',lease_until=? WHERE id=?").bind(Date.now()+60000,job.id).run();
    const row=await env.LAB_DB.prepare('SELECT * FROM jobs WHERE id=?').bind(job.id).first();const body=JSON.stringify({id:'prediction-fixture',status:'succeeded',output:['https://replicate.delivery/fixture.png']});const stamp=String(Math.floor(Date.now()/1000)),receipt='receipt-fixture';const signature=createHmac('sha256',Buffer.from(env.REPLICATE_WEBHOOK_SIGNING_SECRET.slice(6),'base64')).update(`${receipt}.${stamp}.${body}`).digest('base64');
    const req=()=>new Request(`${origin}/api/webhooks/replicate?job=${job.id}&nonce=${row.webhook_nonce}`,{method:'POST',headers:{'webhook-id':receipt,'webhook-timestamp':stamp,'webhook-signature':'v1,'+signature},body});assert.equal((await receiveWebhook(env,req())).status,200);assert.equal((await receiveWebhook(env,req())).status,200);const final=await env.LAB_DB.prepare('SELECT * FROM jobs WHERE id=?').bind(job.id).first();assert.equal(final.provider_id,'prediction-fixture');assert.equal(final.status,'import_pending');
    await assert.rejects(receiveWebhook(env,new Request(req().url,{method:'POST',body})),/signature/);
  });
  await t.test('unknown API is JSON; preview and missing config never serve static protected content',async()=>{
    await assert.rejects(api('a','/api/unknown'),/not found/);let served=false;const next=()=>{served=true;return new Response('private');};let r=await onRequest({env:{},request:new Request(origin+'/'),next});assert.equal(r.status,503);assert.equal(served,false);
    r=await onRequest({env,request:new Request('https://immutable.thirdrailify-lab.pages.dev/'),next});assert.equal(r.status,503);assert.equal(served,false);
    r=await onRequest({env,request:new Request(origin+'/app.js'),next});assert.equal(r.status,401);assert.equal(served,false);assert.equal(r.headers.get('X-Frame-Options'),'DENY');
  });
  await t.test('durable import resumes after browser closure, retries downloads without paid resubmission, revocation stops queued work',async()=>{
    await env.LAB_DB.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').bind(job.id).run();
    let downloads=0,submissions=0;
    const provider={async downloadReplicate(){downloads++;if(downloads===1)throw new Error('interrupted download');return png;},async createReplicate(){submissions++;throw new Error('must not submit');},async request(){throw new Error('unexpected provider call');}};
    await recover(env,provider);let row=await env.LAB_DB.prepare('SELECT * FROM jobs WHERE id=?').bind(job.id).first();assert.equal(row.status,'import_pending');assert.equal(submissions,0);
    await env.LAB_DB.prepare('UPDATE jobs SET next_at=0 WHERE id=?').bind(job.id).run();await recover(env,provider);row=await env.LAB_DB.prepare('SELECT * FROM jobs WHERE id=?').bind(job.id).first();assert.equal(row.status,'succeeded');assert.equal(JSON.parse(row.assets).length,1);assert.equal(submissions,0);
    const original=JSON.parse(row.assets)[0];assert.deepEqual(Buffer.from(await(await api('a',original.url)).arrayBuffer()),png);
    await env.LAB_DB.prepare("UPDATE jobs SET status='queued' WHERE id=?").bind(job.id).run();await env.THIRDRAILIFY_AUTH_DB.prepare("UPDATE workshop_access SET state='revoked' WHERE account_id='a'").run();await recover(env,provider);assert.equal((await env.LAB_DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first()).status,'canceled');assert.equal(submissions,0);await env.THIRDRAILIFY_AUTH_DB.prepare("UPDATE workshop_access SET state='granted' WHERE account_id='a'").run();
    await env.LAB_DB.prepare("UPDATE jobs SET status='submitting',lease_until=0 WHERE id=?").bind(job.id).run();await recover(env,provider);assert.equal((await env.LAB_DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first()).status,'submission_uncertain');assert.equal(submissions,0);
  });
  await t.test('Admin grants audited atomically, CAS race rejected, delegation and Master recovery protected; target-bound handoff single use',async()=>{
    Object.assign(env,{THIRDRAILIFY_AUTH_RATE_LIMIT_SECRET:'fixture-only-secret',THIRDRAILIFY_ADMIN_ORIGIN:'https://admin.thirdrailify.com',THIRDRAILIFY_LAB_ORIGIN:origin});
    const adminRequest=new Request('https://admin.thirdrailify.com/api/workshop/accounts');
    const master=await createSession(env,adminRequest,await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT * FROM accounts WHERE id='master1'").first(),'https://admin.thirdrailify.com');
    const full=await createSession(env,adminRequest,await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT * FROM accounts WHERE id='full'").first(),'https://admin.thirdrailify.com');
    const invoke=(who,target,body,extra={})=>accessHandler({env,request:new Request('https://admin.thirdrailify.com/api/workshop/accounts/'+target,{method:'PUT',headers:{Origin:'https://admin.thirdrailify.com','Content-Type':'application/json',Cookie:who.cookie.split(';')[0],'X-CSRF-Token':who.csrfToken,...extra},body:JSON.stringify(body)})});
    const body={state:'suspended',revision:1};assert.equal((await invoke(full,'full',{state:'granted',revision:0})).status,403);assert.equal((await invoke(master,'master2',{state:'suspended',revision:0})).status,403);assert.equal((await invoke(master,'b',body,{'X-CSRF-Token':'wrong'})).status,403);
    const attempts=await Promise.all([invoke(master,'b',body),invoke(master,'b',body)]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);assert.equal((await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT count(*) AS n FROM workshop_access_audit WHERE account_id='b'").first()).n,1);
    assert.equal((await workshopAccess(env.THIRDRAILIFY_AUTH_DB,'b')).allowed,false);
    const transfer=await createHandoff(env,'a',origin,'/research');const req=new Request(origin+'/api/auth/handoff');await assert.rejects(consumeHandoff(env,req,transfer.code,'https://evil.example'),/invalid/);await consumeHandoff(env,req,transfer.code,origin);await assert.rejects(consumeHandoff(env,req,transfer.code,origin),/invalid/);
  });
});
