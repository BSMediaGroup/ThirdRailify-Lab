import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { createHash, createHmac } from 'node:crypto';
import { apiRoute } from '../lib/api.mjs';
import { authorize, proxyAuth } from '../lib/auth.mjs';
import { workshopAccess } from '../lib/workshop-policy.js';
import { enqueue, receiveWebhook, recover } from '../lib/jobs.mjs';
import { consume } from '../backend/queue.mjs';
import { onRequest } from '../functions/_middleware.js';
import { resolveCredential } from '../lib/provider-profiles.mjs';
import { searchStockMedia, selectStockResult } from '../lib/stock-media.mjs';
import { recordUsage, usageDashboard } from '../lib/usage.mjs';
import {labAssetReference} from '../public/model-schema.js';
import { pathToFileURL } from 'node:url';
const adminRoot=process.env.LAB_TEST_ADMIN_ROOT ? pathToFileURL(process.env.LAB_TEST_ADMIN_ROOT.replace(/[\\/]?$/, '/')) : new URL('../../ThirdRailify-Admin/',import.meta.url);
const {onRequest:authHandler}=await import(new URL('functions/api/auth/[[path]].js',adminRoot));
const {onRequest:accessHandler}=await import(new URL('functions/api/workshop/[[path]].js',adminRoot));
const {createSession,createHandoff,consumeHandoff}=await import(new URL('functions/_shared/auth-core.js',adminRoot));
const origin='https://lab.thirdrailify.com',projectA=crypto.randomUUID(),projectB=crypto.randomUUID();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const hash=s=>createHash('sha256').update(s).digest('base64url');
async function schema(db,path){const source=(await readFile(path,'utf8')).replace(/^--.*$/gm,'');let part='';for(const line of source.split(/\r?\n/)){part+=line+'\n';if(line.trim().endsWith(';')){await db.prepare(part).run();part='';}}if(part.trim())throw new Error('Unterminated SQL');}
test('real local D1/R2: authority, revisions, isolation, webhook, recovery and fail-closed routes',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-01-20',d1Databases:['LAB_DB','THIRDRAILIFY_AUTH_DB'],r2Buckets:['LAB_FILES']});
  t.after(()=>mf.dispose());
  const env=await mf.getBindings();env.LAB_JOBS={async send(){}};Object.assign(env,{LAB_ENABLED:'true',LAB_PAID_ENABLED:'true',LAB_ORIGIN:origin,REPLICATE_API_TOKEN:'local-fixture-token',OPENAI_API_KEY:'local-openai-token',PEXELS_API_KEY:'local-pexels-token',PIXABAY_API_KEY:'local-pixabay-token',UNSPLASH_ACCESS_KEY:'local-unsplash-token',REPLICATE_WEBHOOK_SIGNING_SECRET:'whsec_'+Buffer.from('local-test-signature-key-32-bytes!').toString('base64'),LAB_ASSET_DELIVERY_SIGNING_SECRET:Buffer.alloc(32,9).toString('base64url'),GOOGLE_PSE_CX:'fixture-google-cx',LAB_VAULT_MASTER_KEY_V1:Buffer.alloc(32,7).toString('base64url')});
  await schema(env.LAB_DB,new URL('../migrations/0001_lab.sql',import.meta.url));
  await schema(env.LAB_DB,new URL('../migrations/0002_provider_vault_stock_usage.sql',import.meta.url));
  await schema(env.LAB_DB,new URL('../migrations/0003_provider_cost_intelligence.sql',import.meta.url));
  await schema(env.LAB_DB,new URL('../migrations/0004_usage_classification_repair.sql',import.meta.url));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('migrations/0001_auth_foundation.sql',adminRoot));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('migrations/0002_full_admin_capability_denials.sql',adminRoot));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('migrations/0003_workshop_access.sql',adminRoot));
  await schema(env.THIRDRAILIFY_AUTH_DB,new URL('migrations/0004_workshop_provider_profile_restrictions.sql',adminRoot));
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
  let uploadedAsset;
  await t.test('project create, stale revision race, private R2 and forged file ownership',async()=>{
    for(const [owner,p]of [['a',projectA],['b',projectB]])assert.equal((await (await api(owner,'/api/projects',{id:p,name:owner,project:{},revision:0})).json()).project.revision,1);
    const race=await Promise.allSettled([api('a','/api/projects',{id:projectA,name:'first',project:{},revision:1}),api('a','/api/projects',{id:projectA,name:'second',project:{},revision:1})]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
    await assert.rejects(api('b','/api/projects',{id:projectA,name:'forged',project:{},revision:2}),/changed/);
    const r=await (await api('a','/api/import',{projectId:projectA,dataUrl:'data:image/png;base64,'+png.toString('base64')})).json();const asset=uploadedAsset=r.asset;assert.deepEqual(Buffer.from(await (await api('a',asset.url)).arrayBuffer()),png);await assert.rejects(api('b',asset.url),/not found/);
    await assert.rejects(api('b','/api/projects',{id:projectB,name:'forged ref',project:{assetId:asset.id},revision:1}),/not found/);
    await api('a','/api/projects',{id:projectA,name:'with image',project:{assetId:asset.id},revision:2});await assert.rejects(api('a',`/api/assets/${asset.id}/delete`,{}),/referenced/);
  });
  await t.test('Google Standard Search Element activity is local and callback metadata imports only a verified image',async()=>{
    const originalFetch=globalThis.fetch;let requested;
    try{
      globalThis.fetch=async input=>{requested=String(input);if(requested.startsWith('https://cloudflare-dns.com/'))return Response.json({Answer:[{type:1,data:'93.184.216.34'}]});if(requested==='https://images.example/reference.png')return new Response(png,{headers:{'Content-Type':'image/png','Content-Length':String(png.length)}});throw new Error('unexpected outbound request '+requested);};
      const activity=await (await api('a','/api/research/images/activity',{projectId:projectA,action:'search_started',activityId:'fixture-search',query:'violet studio'})).json();assert.equal(activity.recorded,true);const result={title:'Fixture reference',url:'https://example.com/story',visibleUrl:'example.com/story',contextUrl:'https://example.com/story',image:{url:'https://images.example/reference.png',width:1,height:1},thumbnailImage:{url:'https://images.example/thumb.png',width:1,height:1},fileFormat:'image/png',activityId:'fixture-search'};
      await assert.rejects(api('b','/api/research/images/import',{projectId:projectA,result,destination:'chat'}),/not found/);
      const imported=await (await api('a','/api/research/images/import',{projectId:projectA,result,destination:'chat'})).json();assert.equal(imported.asset.source,'google-images');assert.equal(imported.asset.sourceHostname,'example.com');assert.deepEqual(Buffer.from(await(await api('a',imported.asset.url)).arrayBuffer()),png);await assert.rejects(api('b',imported.asset.url),/not found/);assert.equal(requested,'https://images.example/reference.png');
      assert.equal((await env.LAB_DB.prepare("SELECT count(*) AS n FROM provider_usage_events WHERE owner_id='a' AND provider='google'").first()).n,2);
      const originalWarn=console.warn;let warning;try{console.warn=(...parts)=>{warning=parts.join(' ');};const diagnostic=await(await api('a','/api/diagnostics/csp',{directive:'script-src',blockedHost:'evil.example/path?secret=never-log',documentPath:'/research?prompt=never-log',timestamp:'2026-09-13T00:00:00.000Z',correlationId:'11111111-1111-4111-8111-111111111111'})).json();assert.equal(diagnostic.recorded,true);}finally{console.warn=originalWarn;}assert.match(warning,/script-src.*evil\.example.*\/research/);assert.doesNotMatch(warning,/never-log|prompt=/);
      const missing=env.GOOGLE_PSE_CX;delete env.GOOGLE_PSE_CX;assert.equal((await(await api('a','/api/state')).json()).config.googleImages.configured,false);env.GOOGLE_PSE_CX=missing;
    }finally{globalThis.fetch=originalFetch;}
  });
  await t.test('Replicate job snapshot retains asset IDs and resolves once immediately before provider submission',async()=>{
    const model={id:'fixture/image-edit',version:'b'.repeat(64),official:false,schema:{type:'object',properties:{image:{type:'string',format:'uri',title:'Image',description:'Image file'}},required:['image']}};let submissions=0,preparedInput;
    const provider={key(){return 'fixture';},async model(){return model;},async createReplicate(snapshot){submissions++;preparedInput=snapshot.input;return {id:'typed-input-prediction',status:'processing'};},async request(){return {id:'typed-input-prediction',status:'processing'};}};
    const request={provider:'replicate',model:'fixture/image-edit',prompt:'',input:{image:labAssetReference(uploadedAsset.id)},options:{},projectId:projectA,requestId:crypto.randomUUID()},created=await enqueue(env,auth('a'),request,provider),stored=await env.LAB_DB.prepare('SELECT snapshot FROM jobs WHERE id=?').bind(created.id).first();
    assert.deepEqual(JSON.parse(stored.snapshot).input.image,labAssetReference(uploadedAsset.id));assert.equal((await env.LAB_DB.prepare('SELECT count(*) n FROM job_files WHERE job_id=? AND file_id=?').bind(created.id,uploadedAsset.id).first()).n,1);
    await recover(env,provider,created.id);await recover(env,provider,created.id);assert.equal(submissions,1);assert.match(preparedInput.image,/^data:image\/png;base64,/);assert.equal(JSON.stringify(stored).includes(preparedInput.image),false);
    await env.LAB_DB.prepare("UPDATE jobs SET status='canceled' WHERE id=?").bind(created.id).run();
  });
  await t.test('encrypted key profiles, stock contracts, 24-hour cache, Unsplash tracking and usage idempotency',async()=>{
    const secret='named-openai-secret-value-123',created=await(await api('a','/api/provider-profiles',{provider:'openai',label:'Editorial key',secret,isDefault:true})).json();assert.equal(JSON.stringify(created).includes(secret),false);const stored=await env.LAB_DB.prepare('SELECT * FROM provider_key_profiles WHERE id=?').bind(created.profile.id).first();assert.notEqual(stored.ciphertext,secret);assert.equal(await resolveCredential(env,'a','openai','',created.profile.id).then(x=>x.secret),secret);
    await api('a','/api/provider-profiles/'+created.profile.id,{enabled:false});await assert.rejects(resolveCredential(env,'a','openai','',created.profile.id),/disabled or unavailable/);
    const pexelsFetch=async()=>Response.json({total_results:1,photos:[{id:4,width:1200,height:800,url:'https://www.pexels.com/photo/4',photographer:'Fixture Artist',photographer_url:'https://www.pexels.com/@fixture',alt:'Fixture photo',src:{original:'https://images.example/pexels.png',large:'https://images.example/pexels-preview.png'}}]},{headers:{'x-ratelimit-limit':'200','x-ratelimit-remaining':'199'}});const pexels=await searchStockMedia(env,'a',projectA,origin+'/api/research/stock?provider=pexels&q=studio&page=1&orientation=landscape&size=large&color=violet',pexelsFetch);assert.equal(pexels.items[0].attribution.provider,'Pexels');assert.equal(pexels.items[0].creator,'Fixture Artist');
    let pixabayCalls=0;const pixabayFetch=async()=>{pixabayCalls++;return Response.json({totalHits:1,hits:[{id:7,type:'photo',tags:'violet studio',pageURL:'https://pixabay.com/photos/7',largeImageURL:'https://images.example/pixabay.png',webformatURL:'https://images.example/pixabay-preview.png',imageWidth:1200,imageHeight:800,user:'Fixture',user_id:9}]});};const pixabayUrl=origin+'/api/research/stock?provider=pixabay&q=violet&page=1&orientation=horizontal&type=photo&category=backgrounds&color=lilac&safe=true';assert.equal((await searchStockMedia(env,'a',projectA,pixabayUrl,pixabayFetch)).cacheHit,false);assert.equal((await searchStockMedia(env,'a',projectA,pixabayUrl,pixabayFetch)).cacheHit,true);assert.equal(pixabayCalls,1);
    let tracked=false;const unsplashFetch=async input=>String(input).includes('/download')?(tracked=true,new Response(null,{status:200})):Response.json({total:1,total_pages:1,results:[{id:'u1',width:1200,height:800,alt_description:'Unsplash fixture',urls:{regular:'https://images.unsplash.com/u1',small:'https://images.unsplash.com/u1-small'},links:{html:'https://unsplash.com/photos/u1',download_location:'https://api.unsplash.com/photos/u1/download'},user:{name:'Unsplash Artist',links:{html:'https://unsplash.com/@artist'}}}]});const unsplash=await searchStockMedia(env,'a',projectA,origin+'/api/research/stock?provider=unsplash&q=night&page=1&orientation=landscape',unsplashFetch);const selected=await selectStockResult(env,'a',projectA,unsplash.items[0].token,'chat',unsplashFetch);assert.equal(tracked,true);assert.equal(selected.externalAsset.providerBacked,true);assert.equal(selected.compatible.compose,false);assert.match(selected.externalAsset.attribution.creatorUrl,/utm_source=third_railify_lab/);
    await recordUsage(env,{idempotencyKey:'usage-fixture',logicalRequestId:'operation-one',ownerId:'a',provider:'openai',model:'unknown-fixture',operation:'chat',outcome:'started'});await recordUsage(env,{idempotencyKey:'usage-fixture',logicalRequestId:'operation-one',ownerId:'a',provider:'openai',model:'unknown-fixture',operation:'chat',outcome:'succeeded',inputTokens:10,outputTokens:5});await recordUsage(env,{idempotencyKey:'usage-fixture-two',logicalRequestId:'operation-two',ownerId:'a',provider:'openai',model:'unknown-fixture',operation:'chat',outcome:'succeeded',inputTokens:1,outputTokens:1});await recordUsage(env,{idempotencyKey:'discovery-fixture',ownerId:'a',provider:'openai',operation:'model_discovery',outcome:'succeeded'});await recordUsage(env,{idempotencyKey:'authority-fixture',ownerId:'a',provider:'xai',model:'grok-fixture',operation:'research_chat',outcome:'processing',inputTokens:10,outputTokens:2,xaiPricing:{id:'grok-fixture',prompt_text_token_price:10000,cached_prompt_text_token_price:1000,completion_text_token_price:20000}});await recordUsage(env,{idempotencyKey:'authority-fixture',ownerId:'a',provider:'xai',model:'grok-fixture',operation:'research_chat',outcome:'succeeded',inputTokens:10,outputTokens:2,actualCostTicks:9000000});const authority=await env.LAB_DB.prepare("SELECT cost_basis,actual_cost_ticks,estimated_cost_nanos,pricing_rate_id FROM provider_usage_events WHERE idempotency_key='authority-fixture'").first();assert.deepEqual(authority,{cost_basis:'actual_provider',actual_cost_ticks:9000000,estimated_cost_nanos:null,pricing_rate_id:null});const report=await usageDashboard(env,auth('a'),new URL(origin+'/api/usage?range=24h&provider=openai'));assert.equal(report.providers.some(row=>row.tokens===17),true);assert.equal((await env.LAB_DB.prepare("SELECT count(*) n FROM provider_usage_events WHERE idempotency_key='usage-fixture'").first()).n,1);assert.equal((await env.LAB_DB.prepare("SELECT count(*) n FROM provider_usage_events WHERE idempotency_key IN ('usage-fixture','usage-fixture-two')").first()).n,2);assert.equal((await env.LAB_DB.prepare("SELECT cost_basis FROM provider_usage_events WHERE idempotency_key='discovery-fixture'").first()).cost_basis,'not_applicable');
  });
  let job;
  await t.test('prompt-free job persisted once, replay conflict, callback before response and duplicates',async()=>{
    const provider={key(){return 'fixture';},async model(){return{id:'fixture/prompt-free',version:'a'.repeat(64),schema:{type:'object',properties:{},required:[]},official:false};}};
    const input={provider:'replicate',model:'fixture/prompt-free',prompt:'',input:{},options:{},projectId:projectA,requestId:crypto.randomUUID()};job=await enqueue(env,auth('a'),input,provider);assert.equal(job.status,'queued');assert.equal((await enqueue(env,auth('a'),input,provider)).id,job.id);await assert.rejects(enqueue(env,auth('a'),{...input,prompt:'different'},provider),/reused/);
    await env.LAB_DB.prepare("UPDATE jobs SET status='submitting',lease_until=? WHERE id=?").bind(Date.now()+60000,job.id).run();
    const row=await env.LAB_DB.prepare('SELECT * FROM jobs WHERE id=?').bind(job.id).first();const body=JSON.stringify({id:'prediction-fixture',status:'succeeded',output:['https://replicate.delivery/fixture.png']});const stamp=String(Math.floor(Date.now()/1000)),receipt='receipt-fixture';const signature=createHmac('sha256',Buffer.from(env.REPLICATE_WEBHOOK_SIGNING_SECRET.slice(6),'base64')).update(`${receipt}.${stamp}.${body}`).digest('base64');
    const req=()=>new Request(`${origin}/api/webhooks/replicate?job=${job.id}&nonce=${row.webhook_nonce}`,{method:'POST',headers:{'webhook-id':receipt,'webhook-timestamp':stamp,'webhook-signature':'v1,'+signature},body});assert.equal((await receiveWebhook(env,req())).status,200);assert.equal((await receiveWebhook(env,req())).status,200);const final=await env.LAB_DB.prepare('SELECT * FROM jobs WHERE id=?').bind(job.id).first();assert.equal(final.provider_id,'prediction-fixture');assert.equal(final.status,'import_pending');const usage=await env.LAB_DB.prepare('SELECT count(*) n,max(outcome) outcome,max(provider_request_id) provider_id FROM provider_usage_events WHERE job_id=?').bind(job.id).first();assert.equal(usage.n,1);assert.equal(usage.outcome,'succeeded');assert.equal(usage.provider_id,'prediction-fixture');
    await assert.rejects(receiveWebhook(env,new Request(req().url,{method:'POST',body})),/signature/);
  });
  await t.test('unknown API is JSON; preview and missing config never serve static protected content',async()=>{
    await assert.rejects(api('a','/api/unknown'),/not found/);let served=false;const next=()=>{served=true;return new Response('private');};let r=await onRequest({env:{},request:new Request(origin+'/'),next});assert.equal(r.status,503);assert.equal(served,false);
    r=await onRequest({env,request:new Request('https://immutable.thirdrailify-lab.pages.dev/'),next});assert.equal(r.status,503);assert.equal(served,false);
    r=await onRequest({env,request:new Request(origin+'/app.js'),next});assert.equal(r.status,401);assert.equal(served,false);assert.equal(r.headers.get('X-Frame-Options'),'DENY');r=await onRequest({env,request:new Request(origin+'/api/research/images?projectId='+projectA+'&q=test'),next});assert.equal(r.status,401);assert.match(r.headers.get('content-type'),/application\/json/);
  });
  await t.test('Pages canonical login and existing OAuth callback paths reach the login gate',async()=>{
    for(const path of ['/login','/login.html']){const r=await onRequest({env,request:new Request(origin+path),next:()=>new Response('login fixture')});assert.equal(r.status,200);assert.equal(await r.text(),'login fixture');}
    const social=await onRequest({env,request:new Request(origin+'/backgrounds/labseo.webp'),next:()=>new Response(png,{headers:{'Content-Type':'image/webp'}})});assert.equal(social.status,200);assert.equal(social.headers.get('content-type'),'image/webp');assert.equal(social.headers.get('cache-control'),'public, max-age=604800, immutable');assert.deepEqual(Buffer.from(await social.arrayBuffer()),png);
    const r=await onRequest({env,request:new Request(origin+'/account/login?handoff=single-use-code'),next:()=>{throw new Error('Must not serve protected assets');}});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/login?handoff=single-use-code');
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
  await t.test('queue dispatch is awaited; redelivery never repurchases; failed dispatch is visible and missing bindings fail closed',async()=>{
    const messages=[];env.LAB_JOBS={async send(body){messages.push(body);}};
    let purchases=0;
    const provider={key(){},async directImage(){purchases++;return {data:[{b64_json:png.toString('base64')}],usage:{}};},async request(){throw new Error('No provider cleanup expected');}};
    const input={projectId:projectA,provider:'openai',model:'fixture-image',prompt:'Controlled fixture',requestId:crypto.randomUUID()};
    const job=await enqueue(env,auth('a'),input,provider);assert.deepEqual(messages,[{jobId:job.id}]);
    let acknowledgments=0;const batch={messages:[{body:{jobId:job.id},attempts:1,ack(){acknowledgments++;},retry(){throw new Error('Completed job should be acknowledged');}}]};
    await consume(batch,env,provider);await consume(batch,env,provider);assert.equal(purchases,1);assert.equal(acknowledgments,2);
    const row=await env.LAB_DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first();assert.equal(row.status,'succeeded');
    env.LAB_JOBS={async send(){throw new Error('Queue unavailable');}};
    const failed=await enqueue(env,auth('a'),{...input,requestId:crypto.randomUUID()},provider);assert.equal(failed.status,'failed');assert.match(failed.phase,/dispatch failed/);
    delete env.LAB_JOBS;await assert.rejects(enqueue(env,auth('a'),{...input,requestId:crypto.randomUUID()},provider),/processor is unavailable/);assert.equal(purchases,1);
    env.LAB_JOBS={async send(){}};
  });
  await t.test('Admin grants audited atomically, CAS race rejected, delegation and Master recovery protected; target-bound handoff single use',async()=>{
    Object.assign(env,{THIRDRAILIFY_AUTH_RATE_LIMIT_SECRET:'fixture-only-secret',THIRDRAILIFY_ADMIN_ORIGIN:'https://admin.thirdrailify.com',THIRDRAILIFY_LAB_ORIGIN:origin});
    const adminRequest=new Request('https://admin.thirdrailify.com/api/workshop/accounts');
    const master=await createSession(env,adminRequest,await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT * FROM accounts WHERE id='master1'").first(),'https://admin.thirdrailify.com');
    const full=await createSession(env,adminRequest,await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT * FROM accounts WHERE id='full'").first(),'https://admin.thirdrailify.com');
    const invoke=(who,target,body,extra={})=>accessHandler({env,request:new Request('https://admin.thirdrailify.com/api/workshop/accounts/'+target,{method:'PUT',headers:{Origin:'https://admin.thirdrailify.com','Content-Type':'application/json',Cookie:who.cookie.split(';')[0],'X-CSRF-Token':who.csrfToken,...extra},body:JSON.stringify(body)})});
    const profileInvoke=(who,target,method='GET',body)=>accessHandler({env,request:new Request('https://admin.thirdrailify.com/api/workshop/accounts/'+target+'/profiles',{method,headers:{Origin:'https://admin.thirdrailify.com','Content-Type':'application/json',Cookie:who.cookie.split(';')[0],'X-CSRF-Token':who.csrfToken},body:body?JSON.stringify(body):undefined})});
    assert.equal((await profileInvoke(full,'a')).status,403);const profileRead=await profileInvoke(master,'a');assert.equal(profileRead.status,200);const profileView=await profileRead.json();assert.equal(profileView.providers.find(item=>item.provider==='replicate').profiles.some(profile=>profile.id==='runtime:replicate'),true);const restricted=await profileInvoke(master,'a','PUT',{provider:'replicate',mode:'selected',profileIds:['runtime:replicate'],defaultProfileId:'runtime:replicate',revision:0});assert.equal(restricted.status,200);assert.equal((await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT count(*) n FROM workshop_provider_profile_audit WHERE account_id='a' AND provider='replicate'").first()).n,1);assert.equal((await profileInvoke(master,'a','PUT',{provider:'replicate',mode:'all',profileIds:[],defaultProfileId:null,revision:1})).status,200);
    const body={state:'suspended',revision:1};assert.equal((await invoke(full,'full',{state:'granted',revision:0})).status,403);assert.equal((await invoke(master,'master2',{state:'suspended',revision:0})).status,403);assert.equal((await invoke(master,'b',body,{'X-CSRF-Token':'wrong'})).status,403);
    const attempts=await Promise.all([invoke(master,'b',body),invoke(master,'b',body)]);assert.deepEqual(attempts.map(x=>x.status).sort(),[200,409]);assert.equal((await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT count(*) AS n FROM workshop_access_audit WHERE account_id='b'").first()).n,1);
    assert.equal((await workshopAccess(env.THIRDRAILIFY_AUTH_DB,'b')).allowed,false);
    const transfer=await createHandoff(env,'a',origin,'/research');const req=new Request(origin+'/api/auth/handoff');await assert.rejects(consumeHandoff(env,req,transfer.code,'https://evil.example'),/invalid/);await consumeHandoff(env,req,transfer.code,origin);await assert.rejects(consumeHandoff(env,req,transfer.code,origin),/invalid/);
  });
  await t.test('Lab logout forwards CSRF to canonical authority, revokes the session and clears a host-only cookie',async()=>{
    const account=await env.THIRDRAILIFY_AUTH_DB.prepare("SELECT * FROM accounts WHERE id='master1'").first();
    const login=await createSession(env,new Request(origin+'/api/auth/handoff'),account,origin);
    const request=new Request(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:login.cookie.split(';')[0],'X-CSRF-Token':login.csrfToken,'Content-Type':'application/json'},body:'{}'});
    const originalFetch=globalThis.fetch;
    try{globalThis.fetch=(url,options)=>authHandler({env,request:new Request(url,options)});const response=await proxyAuth(env,request,'logout');assert.equal(response.status,200);assert.equal((await response.json()).authenticated,false);assert.match(response.headers.get('set-cookie'),/Max-Age=0/i);assert.doesNotMatch(response.headers.get('set-cookie'),/Domain=/i);assert.ok((await env.THIRDRAILIFY_AUTH_DB.prepare('SELECT revoked_at FROM sessions WHERE id=?').bind(login.session.id).first()).revoked_at);await assert.rejects(authorize(env,new Request(origin+'/api/state',{headers:{Cookie:login.cookie.split(';')[0]}})),/Sign in/);}finally{globalThis.fetch=originalFetch;}
  });

});
