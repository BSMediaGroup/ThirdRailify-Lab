import {Providers} from '../lib/providers.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHmac} from 'node:crypto';
import {parseEnv,parseModel,normalizeInputSchema,validateInput,decodeImage,imageType,isDeliveryUrl,flattenOutput,sanitize,verifyReplicateWebhook,updateConfig,readConfig} from '../lib/core.mjs';
import {createLab} from '../server.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN0cAAAAASUVORK5CYII=','base64');
const hash='a'.repeat(64);
const schema={components:{schemas:{Input:{type:'object',required:['prompt'],properties:{prompt:{type:'string'},num_outputs:{type:'integer',minimum:1,maximum:4,default:1},aspect_ratio:{$ref:'#/components/schemas/Aspect'},image:{type:'string',format:'uri'}}},Aspect:{type:'string',enum:['16:9','1:1'],default:'16:9'}}}};
const json=(b,status=200,headers={})=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json',...headers}});
async function waitFor(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Timed out');}

test('dotenv handles BOM, CRLF, quotes and export without Windows variable dependency',()=>{assert.deepEqual(parseEnv('\uFEFFA=x\r\n export B = "y"\r\nC=\n# comment'),{A:'x',B:'y',C:''});});
test('model IDs and real model URLs normalize; non-Replicate URLs are rejected',()=>{assert.equal(parseModel('https://replicate.com/black-forest-labs/flux-schnell/api').id,'black-forest-labs/flux-schnell');assert.equal(parseModel('owner/model:'+hash).version,hash);assert.throws(()=>parseModel('https://evil.example/model'));});
test('schema references and typed validation do not invent model fields',()=>{const s=normalizeInputSchema(schema);assert.deepEqual(s.properties.aspect_ratio.enum,['16:9','1:1']);assert.doesNotThrow(()=>validateInput({prompt:'Hello',num_outputs:1,aspect_ratio:'16:9'},s));assert.throws(()=>validateInput({prompt:'Hi',num_outputs:0},s));assert.throws(()=>validateInput({prompt:'Hi',unexpected:true},s));assert.throws(()=>validateInput({num_outputs:1},s));});
test('image input is bounded and SVG/HTML are rejected',()=>{assert.equal(decodeImage('data:image/png;base64,'+png.toString('base64')).length,png.length);assert.equal(imageType(png).ext,'png');assert.throws(()=>decodeImage('data:image/svg+xml;base64,PHN2Zz4='));assert.throws(()=>imageType(Buffer.from('<html>')));});
test('delivery allowlist is exact and outputs are deduplicated',()=>{assert.equal(isDeliveryUrl('https://replicate.delivery/p/a.png'),true);assert.equal(isDeliveryUrl('https://a.replicate.delivery/p/a.png'),true);for(const u of ['http://replicate.delivery/a','https://replicate.delivery.evil.example/a','https://127.0.0.1/a','https://evil@replicate.delivery/a'])assert.equal(isDeliveryUrl(u),false);assert.deepEqual(flattenOutput({a:['https://replicate.delivery/a','https://replicate.delivery/a'],b:'not URL'}),['https://replicate.delivery/a']);});
test('secret redaction strips configured values and recognized token shapes',()=>{const key='sample-secret-never-expose';assert.equal(sanitize('bad '+key,{REPLICATE_API_TOKEN:key}),'bad [redacted]');assert.match(sanitize('bad r8_abcdefghijklmnopqrstuv'),/redacted/);});
test('webhook verifier uses raw bytes, multi-signature support and timestamp window',()=>{const now=Date.now(),timestamp=String(Math.floor(now/1000)),secret=Buffer.alloc(32,4).toString('base64'),body=Buffer.from('{"id":"prediction"}'),id='event-1';const signature=createHmac('sha256',Buffer.from(secret,'base64')).update(`${id}.${timestamp}.`).update(body).digest('base64');const h={'webhook-id':id,'webhook-timestamp':timestamp,'webhook-signature':'v1,invalid v1,'+signature};assert.equal(verifyReplicateWebhook(body,h,'whsec_'+secret,now),true);assert.equal(verifyReplicateWebhook(Buffer.from('{ "id":"prediction"}'),h,'whsec_'+secret,now),false);assert.equal(verifyReplicateWebhook(body,h,'whsec_'+secret,now+400000),false);});
test('configuration updates preserve blanks and unrelated values, never rewrite another repo',async()=>{const root=await mkdtemp(path.join(os.tmpdir(),'lab-config-'));try{await writeFile(path.join(root,'.env'),'REPLICATE_API_TOKEN=existing-key\nOTHER_SETTING=keep\n');await updateConfig(root,{REPLICATE_API_TOKEN:'',OPENAI_API_KEY:'new-key'});const c=await readConfig(root);assert.equal(c.REPLICATE_API_TOKEN,'existing-key');assert.equal(c.OPENAI_API_KEY,'new-key');assert.equal(c.OTHER_SETTING,'keep');await assert.rejects(()=>updateConfig(root,{XAI_API_KEY:'bad\nvalue'}));}finally{await rm(root,{recursive:true,force:true});}});

test('real local server + mocked Replicate REST: schema, prediction, polling, durable download, replay guard and key isolation',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lab-integration-'));let app;const calls=[];let polls=0;
 const fakeFetch=async(url,options={})=>{
   calls.push({url,options});const u=new URL(url);
   if(u.hostname.endsWith('replicate.delivery')){assert.equal(options.headers.Authorization,'Bearer test-replicate-key');return new Response(png,{headers:{'content-type':'image/png'}});}
   assert.equal(options.headers.Authorization,'Bearer test-replicate-key');
   if(u.pathname==='/v1/account')return json({username:'test'});
   if(u.pathname==='/v1/models'&&options.method==='QUERY')return json({results:[{owner:'black-forest-labs',name:'flux-schnell'}]});
   if(u.pathname==='/v1/models/black-forest-labs/flux-schnell')return json({owner:'black-forest-labs',name:'flux-schnell',latest_version:{id:hash,openapi_schema:schema}});
   if(u.pathname==='/v1/models/black-forest-labs/flux-schnell/predictions'){assert.deepEqual(JSON.parse(options.body).input,{prompt:'A small image',aspect_ratio:'16:9',num_outputs:1});assert.equal(JSON.parse(options.body).webhook,undefined);return json({id:'prediction1',status:'starting'});}
   if(u.pathname==='/v1/predictions/prediction1'){polls++;return json({id:'prediction1',status:polls>1?'succeeded':'processing',output:polls>1?['https://replicate.delivery/output.png']:null});}
   if(u.pathname==='/v1/webhooks/default/secret')return json({key:'whsec_c2lnbmluZw=='});
   throw new Error('Unexpected fake provider URL '+url);
 };
 try{
  await writeFile(path.join(root,'.env'),'REPLICATE_API_TOKEN=test-replicate-key\n');
  app=await createLab({root,fetchImpl:fakeFetch,pollDelay:10,discoverBrand:false});const port=await app.start(0),base=`http://127.0.0.1:${port}`;
  let initial=await (await fetch(base+'/api/state')).json();assert.equal(initial.config.keys.REPLICATE_API_TOKEN,true);assert.equal(JSON.stringify(initial).includes('test-replicate-key'),false);
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Lab-CSRF':initial.csrf,Origin:base},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
  const m=await(await fetch(base+'/api/model?id=black-forest-labs/flux-schnell')).json();assert.equal(m.model.version,hash);
  const search=await(await fetch(base+'/api/models/search?q=flux')).json();assert.equal(search.items.length,1);
  const body={requestId:'request-1234567890123456',provider:'replicate',model:'black-forest-labs/flux-schnell',prompt:'A small image',input:{aspect_ratio:'16:9',num_outputs:1}};
  const pair=await Promise.all([post('/api/generate',body),post('/api/generate',body)]);const created=await pair[0].json();const concurrent=await pair[1].json();assert.ok(created.job.id);assert.equal(concurrent.job.id,created.job.id);
  const replay=await(await post('/api/generate',body)).json();assert.equal(replay.job.id,created.job.id);
  await waitFor(()=>app.state.jobs[0].status==='succeeded');assert.equal(app.state.jobs[0].assets.length,1);
  assert.equal(calls.filter(c=>c.url.endsWith('/predictions')&&c.options.method==='POST').length,1);
  const bytes=await(await fetch(base+app.state.jobs[0].assets[0].url)).arrayBuffer();assert.equal(bytes.byteLength,png.length);
  const asset=app.state.jobs[0].assets[0];await post('/api/projects',{name:'Saved',project:{assetId:asset.id,settings:{thumbTitle:'Saved title'}}});
  const wh=await(await post('/api/settings/webhook-key',{})).json();assert.equal(wh.config.keys.REPLICATE_WEBHOOK_SIGNING_SECRET,true);assert.equal(JSON.stringify(wh).includes('whsec_c2lnbmluZw=='),false);
  await app.close();app=null;const stored=JSON.parse(await readFile(path.join(root,'.data/state.json'),'utf8'));assert.equal(stored.projects.length,1);assert.equal(stored.jobs[0].status,'succeeded');assert.equal(JSON.stringify(stored).includes('test-replicate-key'),false);
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});

test('OpenAI and Grok direct images use different documented request contracts and save bytes',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lab-direct-'));let app;const seen=[];
 try{
  await writeFile(path.join(root,'.env'),'OPENAI_API_KEY=openai-test\nXAI_API_KEY=xai-test\n');
  app=await createLab({root,discoverBrand:false,fetchImpl:async(url,options)=>{seen.push({url,body:JSON.parse(options.body)});return json({data:[{b64_json:png.toString('base64')}],usage:{total_tokens:10}});}});
  const port=await app.start(0),base=`http://127.0.0.1:${port}`,init=await(await fetch(base+'/api/state')).json();
  for(const p of ['openai','xai']){const r=await fetch(base+'/api/generate',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Lab-CSRF':init.csrf},body:JSON.stringify({requestId:'test-direct-123456789-'+p,provider:p,model:p==='openai'?'gpt-image-fixture':'grok-image-fixture',prompt:'Test image',options:p==='openai'?{size:'1536x1024',quality:'low'}:{aspect_ratio:'16:9'}})});assert.equal(r.status,202);}
  await waitFor(()=>app.state.jobs.every(j=>j.status==='succeeded'));assert.equal(seen.length,2);
  assert.equal(seen[0].body.output_format,'png');assert.equal(seen[0].body.response_format,undefined);assert.equal(seen[1].body.response_format,'b64_json');assert.equal(seen[1].body.aspect_ratio,'16:9');assert.equal(Object.keys(app.state.assets).length,2);
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});

test('provider submission failure is not automatically retried or disguised as a generation',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lab-error-'));let app,calls=0;
 try{
  await writeFile(path.join(root,'.env'),'OPENAI_API_KEY=openai-test-key\n');
  app=await createLab({root,discoverBrand:false,fetchImpl:async()=>{calls++;throw new Error('network lost');}});
  const port=await app.start(0),base=`http://127.0.0.1:${port}`,init=await(await fetch(base+'/api/state')).json();
  await fetch(base+'/api/generate',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Lab-CSRF':init.csrf},body:JSON.stringify({requestId:'uncertain-1234567890',provider:'openai',model:'gpt-image-fixture',prompt:'A test'})});
  await waitFor(()=>app.state.jobs[0].status==='submission_uncertain');assert.equal(calls,1);assert.equal(app.state.jobs[0].assets.length,0);
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});

test('Responses chat streams only actual text deltas; no fabricated reasoning',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lab-chat-'));let app;
 try{
  await writeFile(path.join(root,'.env'),'OPENAI_API_KEY=openai-test\n');
  app=await createLab({root,discoverBrand:false,fetchImpl:async(url,options)=>{assert.ok(url.endsWith('/responses'));const b=JSON.parse(options.body);assert.equal(b.stream,true);assert.equal(b.store,false);assert.deepEqual(b.tools.map(t=>t.type),['web_search','code_interpreter']);return new Response('data: {"type":"response.output_text.delta","delta":"Actual text"}\n\ndata: {"type":"response.completed"}\n\n',{headers:{'Content-Type':'text/event-stream'}});}});
  const port=await app.start(0),base=`http://127.0.0.1:${port}`,init=await(await fetch(base+'/api/state')).json();
  const r=await fetch(base+'/api/chat',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Lab-CSRF':init.csrf},body:JSON.stringify({provider:'openai',model:'gpt-6-fixture',messages:[{role:'user',content:'Hello'}]})});const text=await r.text();assert.match(text,/Actual text/);assert.match(text,/event: done/);
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
});


test('explicit Replicate version is retained and uses the versioned prediction endpoint',async()=>{
 const hash='b'.repeat(64),calls=[];
 const providers=new Providers(()=>({REPLICATE_API_TOKEN:'fixture-key'}),async(url,options={})=>{
   calls.push({url,options});
   if(url.endsWith('/versions/'+hash))return json({id:hash,openapi_schema:schema});
   if(url.endsWith('/models/black-forest-labs/flux-schnell'))return json({name:'flux-schnell',is_official:true,latest_version:{id:'a'.repeat(64),openapi_schema:schema}});
   if(url.endsWith('/predictions'))return json({id:'pin-prediction',status:'starting'});
   throw new Error('Unexpected URL');
 });
 const ref='black-forest-labs/flux-schnell:'+hash;
 const loaded=await providers.model(ref);assert.equal(loaded.ref,ref);assert.equal(loaded.official,false);
 await providers.createReplicate({model:ref,input:{prompt:'Pin test',aspect_ratio:'16:9',num_outputs:1}});
 const call=calls.find(c=>c.options.method==='POST');assert.equal(call.url,'https://api.replicate.com/v1/predictions');assert.equal(JSON.parse(call.options.body).version,hash);
});
