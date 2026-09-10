import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ModelCatalog,modelKind} from '../lib/models.mjs';
import {Providers} from '../lib/providers.mjs';
import {discoverBrandAssets} from '../lib/brand.mjs';
import {createLab} from '../server.mjs';
const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json'}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN0cAAAAASUVORK5CYII=','base64');
const env={OPENAI_API_KEY:'fixture-openai',XAI_API_KEY:'fixture-xai'};

test('GPT model lists are provider-returned, task-filtered, cached and refreshed without inference',async()=>{
 let calls=0;const providers=new Providers(()=>env,async(url,o)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models');assert.equal(o.method,'GET');return json({data:[{id:'gpt-image-new',created:3},{id:'gpt-image-old',created:1},{id:'gpt-6-fixture',created:5},{id:'text-embedding-fixture'},{id:'gpt-realtime-fixture'},{id:'gpt-6-audio-fixture'}]});});
 const catalog=new ModelCatalog(providers);const images=await catalog.list('openai','image');assert.deepEqual(images.items.map(m=>m.id),['gpt-image-new','gpt-image-old']);assert.equal(images.source,'live');
 assert.equal((await catalog.list('openai','image')).source,'cache');assert.equal(calls,1);await catalog.list('openai','image',{refresh:true});assert.equal(calls,2);
 assert.deepEqual((await catalog.list('openai','chat')).items.map(m=>m.id),['gpt-6-fixture']);
});
test('Grok uses typed image/language endpoints and provider aliases',async()=>{
 const calls=[];const providers=new Providers(()=>env,async(url)=>{calls.push(url);return json({models:[{id:url.endsWith('language-models')?'grok-chat-fixture':'grok-image-fixture',aliases:['model-alias'],output_modalities:[url.endsWith('language-models')?'text':'image']}]});});
 const c=new ModelCatalog(providers);assert.equal((await c.list('xai','image')).items.length,2);assert.equal((await c.list('xai','chat')).items[0].kind,'chat');assert.ok(calls[0].endsWith('/image-generation-models'));assert.ok(calls[1].endsWith('/language-models'));
});
test('Grok missing typed endpoint falls back to provider models, not static guesses',async()=>{
 const p=new Providers(()=>env,async(url)=>url.endsWith('/models')?json({data:[{id:'grok-image-fixture'},{id:'grok-4-fixture'}]}):json({error:'Not found'},404));
 assert.deepEqual((await new ModelCatalog(p).list('xai','image')).items.map(m=>m.id),['grok-image-fixture']);
});
test('catalogue network fallback is labelled stale, but rejected keys cannot reuse authentication',async()=>{
 let fail=0;const p=new Providers(()=>env,async()=>fail?json({error:'Bad key or unavailable'},fail):json({data:[{id:'gpt-image-fixture'}]}));const c=new ModelCatalog(p);await c.list('openai','image');fail=503;assert.equal((await c.list('openai','image',{refresh:true})).source,'stale');fail=401;await assert.rejects(()=>c.list('openai','image',{refresh:true}),e=>e.status===401);
});
test('concurrent catalog requests coalesce and unknown types are rejected',async()=>{
 let calls=0;const p=new Providers(()=>env,async()=>{calls++;await new Promise(r=>setTimeout(r,5));return json({data:[]});});const c=new ModelCatalog(p);await Promise.all([c.list('openai','image'),c.list('openai','image')]);assert.equal(calls,1);await assert.rejects(()=>c.list('replicate','image'));assert.equal(modelKind('openai','text-embedding-x'),'other');
});
test('nested /poc brand resolution prefers Lab American Captain OTF and labs0, then sibling body font',async()=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'lab-brand-'));
 try{const lab=path.join(base,'ThirdRailify-Lab'),poc=path.join(lab,'poc');await mkdir(poc,{recursive:true});const head=path.join(lab,'assets/fonts/headings');await mkdir(head,{recursive:true});await writeFile(path.join(head,'American Captain.otf'),'OTTO-fixture');const logo=path.join(lab,'assets/logos');await mkdir(logo,{recursive:true});await writeFile(path.join(logo,'labs0.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');const body=path.join(base,'ThirdRailify/assets/fonts/body');await mkdir(body,{recursive:true});await writeFile(path.join(body,'Blinker-Regular.ttf'),'font-fixture');const b=await discoverBrandAssets(poc);assert.equal(b.fonts.display,path.join(head,'American Captain.otf'));assert.ok(b.fonts.body.endsWith('Blinker-Regular.ttf'));assert.equal(b.logo,path.join(logo,'labs0.svg'));assert.equal(b.logoSource,'../assets/logos/labs0.svg');}finally{await rm(base,{recursive:true,force:true});}
});
async function testServer(fn){const root=await mkdtemp(path.join(os.tmpdir(),'lab-upgrade-'));let app;const calls=[];try{
 await writeFile(path.join(root,'.env'),'OPENAI_API_KEY=fixture-openai\nXAI_API_KEY=fixture-xai\nCUSTOM=untouched\n');
 app=await createLab({root,discoverBrand:false,fetchImpl:async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/models'))return json({data:[{id:'gpt-image-selected'},{id:'gpt-6-selected'}]});if(url.endsWith('/responses'))return new Response('data: {"type":"response.output_text.delta","delta":"Selected model responded"}\n\ndata: {"type":"response.completed"}\n\n');return json({data:[{b64_json:png.toString('base64')}]});}});
 const port=await app.start(0),base='http://127.0.0.1:'+port,init=await(await fetch(base+'/api/state')).json();const post=(url,body={})=>fetch(base+url,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Lab-CSRF':init.csrf},body:JSON.stringify(body)});
 await fn({app,root,base,post,calls});
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}}
test('selected chat model passes through the actual HTTP/SSE route instead of .env default',()=>testServer(async({post,calls})=>{const res=await post('/api/chat',{provider:'openai',model:'gpt-6-selected',messages:[{role:'user',content:'hello'}]});assert.match(await res.text(),/Selected model responded/);assert.equal(JSON.parse(calls.at(-1).opts.body).model,'gpt-6-selected');}));
test('selected image model is submitted exactly; a catalogue GET is not a paid request',()=>testServer(async({post,base,app,calls})=>{const list=await(await fetch(base+'/api/provider-models?provider=openai&kind=image')).json();assert.equal(list.items[0].id,'gpt-image-selected');const res=await post('/api/generate',{requestId:'selected-image-123456789',provider:'openai',model:list.items[0].id,prompt:'Fixture',options:{size:'1024x1024'}});assert.equal(res.status,202);for(let i=0;i<50&&app.state.jobs[0].status!=='succeeded';i++)await new Promise(r=>setTimeout(r,5));assert.equal(app.state.jobs[0].status,'succeeded');assert.equal(JSON.parse(calls.find(c=>c.url.endsWith('/images/generations')).opts.body).model,'gpt-image-selected');}));
test('saved work delete persists, protects referenced images and preserves .env',()=>testServer(async({post,root,base,app})=>{
 const before=await readFile(path.join(root,'.env'),'utf8');const {asset}=await(await post('/api/import',{dataUrl:'data:image/png;base64,'+png.toString('base64')})).json();const {project}=await(await post('/api/projects',{name:'Retained until deletion',project:{assetId:asset.id,mode:'generate',generation:{prompt:'example'}}})).json();
 assert.equal((await post('/api/assets/'+asset.id+'/delete')).status,409);assert.equal((await post('/api/projects/'+project.id+'/delete')).status,200);assert.equal((await fetch(base+asset.url)).status,200);assert.equal((await post('/api/assets/'+asset.id+'/delete')).status,200);assert.equal((await fetch(base+asset.url)).status,404);
 const stored=JSON.parse(await readFile(path.join(root,'.data/state.json'),'utf8'));assert.equal(stored.projects.length,0);assert.equal(Object.keys(stored.assets).length,0);assert.equal(await readFile(path.join(root,'.env'),'utf8'),before);
}));
test('history deletion retains idempotency tombstone and images; active jobs cannot be hidden',()=>testServer(async({post,app,base,calls})=>{
 const body={requestId:'history-delete-123456789',provider:'openai',model:'gpt-image-selected',prompt:'Fixture'};const created=await(await post('/api/generate',body)).json();for(let i=0;i<50&&app.state.jobs[0].status!=='succeeded';i++)await new Promise(r=>setTimeout(r,5));const count=calls.length;
 assert.equal((await post('/api/jobs/'+created.job.id+'/delete')).status,200);assert.equal((await(await fetch(base+'/api/jobs')).json()).jobs.length,0);assert.equal(Object.keys(app.state.assets).length,1);const replay=await(await post('/api/generate',body)).json();assert.equal(replay.job.id,created.job.id);assert.equal(calls.length,count);
 app.state.jobs.push({id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',status:'processing'});assert.equal((await post('/api/jobs/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/delete')).status,409);
}));
test('deletion still requires local Origin and CSRF',()=>testServer(async({base})=>{assert.equal((await fetch(base+'/api/projects/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/delete',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);}));

test('new installs do not invent GPT or Grok model defaults',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'lab-defaults-'));
 try{const {DEFAULTS}=await import('../lib/core.mjs');for(const k of ['OPENAI_IMAGE_MODEL','OPENAI_CHAT_MODEL','XAI_IMAGE_MODEL','XAI_CHAT_MODEL'])assert.equal(DEFAULTS[k],'');}finally{await rm(root,{recursive:true,force:true});}
});
test('research route serves the shared app, and brand endpoints only expose allowlisted local assets',async()=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'lab-routes-'));const root=path.join(base,'ThirdRailify-Lab','poc');let app;
 try{
  await mkdir(path.join(root,'public'),{recursive:true});await writeFile(path.join(root,'public','index.html'),'<main>Shared Research UI</main>');
  await mkdir(path.join(base,'ThirdRailify-Lab','assets/fonts/headings'),{recursive:true});await writeFile(path.join(base,'ThirdRailify-Lab','assets/fonts/headings/American Captain.otf'),'OTTO-fixture');
  await mkdir(path.join(base,'ThirdRailify-Lab','assets/logos'),{recursive:true});await writeFile(path.join(base,'ThirdRailify-Lab','assets/logos/labs0.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  app=await createLab({root});const port=await app.start(0),origin='http://127.0.0.1:'+port;
  assert.match(await(await fetch(origin+'/research?tab=chat')).text(),/Shared Research UI/);
  const font=await fetch(origin+'/brand-fonts/display');assert.equal(font.headers.get('content-type'),'font/otf');assert.equal(await font.text(),'OTTO-fixture');
  assert.equal((await fetch(origin+'/brand-assets/labs0.svg')).headers.get('content-type'),'image/svg+xml');
  assert.equal((await fetch(origin+'/brand-assets/other.svg')).status,404);assert.equal((await fetch(origin+'/.env')).status,404);
 }finally{if(app)await app.close();await rm(base,{recursive:true,force:true});}
});
