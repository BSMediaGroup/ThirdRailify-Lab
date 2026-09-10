import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createLab} from '../server.mjs';
import {modelMetadata} from '../lib/providers.mjs';
import {workflowFor,preparePrompt,missingInputs,safeImageUrl} from '../public/model-schema.js';
import {validateInput} from '../lib/core.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN0cAAAAASUVORK5CYII=','base64');
const dataUrl='data:image/png;base64,'+png.toString('base64');
const twoImages={type:'object',required:['input_image','swap_image'],properties:{input_image:{type:'string',format:'uri',title:'Target image'},swap_image:{type:'string',format:'uri',title:'Source image'}}};
const prompts={type:'object',required:['prompt'],properties:{prompt:{type:'string',minLength:1},seed:{type:'integer',default:0}}};
const optional={type:'object',properties:{prompt:{type:'string',default:'A quiet night'},steps:{type:'integer',default:1}}};
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw new Error('Local job did not complete');}
async function fixture(fn){
 const root=await mkdtemp(path.join(os.tmpdir(),'lab-workspace-'));let app;const calls=[];
 const request=async(url,options={})=>{
  calls.push({url,options});
  if(url.includes('/models/fixture/')){const name=url.split('/').at(-1),schema=name==='images'?twoImages:name==='optional'?optional:prompts;return json({owner:'fixture',name,description:'Synthetic test model',cover_image_url:'https://replicate.delivery/test-cover.png',run_count:321,latest_version:{id:'c'.repeat(64),created_at:'2026-01-01T00:00:00Z',openapi_schema:{components:{schemas:{Input:schema}}}}});}
  if(url==='https://api.replicate.com/v1/predictions')return json({id:'prediction-'+calls.length,status:'succeeded',output:'https://replicate.delivery/local-test.png'});
  if(url.startsWith('https://replicate.delivery/'))return new Response(png,{headers:{'content-type':'image/png'}});
  throw new Error('Unexpected provider request: '+url);
 };
 const start=async()=>{app=await createLab({root,discoverBrand:false,fetchImpl:request,pollDelay:1});const port=await app.start(0);return 'http://127.0.0.1:'+port;};
 try{
  await writeFile(path.join(root,'.env'),'REPLICATE_API_TOKEN=test-fixture-only\nOPENAI_API_KEY=test-fixture-only\nCUSTOM=keep-this\n');
  let base=await start(),csrf=(await(await fetch(base+'/api/state')).json()).csrf;
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Lab-CSRF':csrf},body:JSON.stringify(body)});
  const restart=async()=>{await app.close();base=await start();csrf=(await(await fetch(base+'/api/state')).json()).csrf;};
  await fn({root,post,calls,restart,get app(){return app;},get base(){return base;}});
 }finally{if(app)await app.close();await rm(root,{recursive:true,force:true});}
}
function generation(extra={}){return {provider:'replicate',model:'fixture/images',requestId:randomUUID(),sessionId:randomUUID(),input:{input_image:dataUrl,swap_image:'https://images.example.test/source.png'},...extra};}

test('workflow derives prompt requirements from actual schema, not model name',()=>{
 assert.equal(workflowFor({name:'prompt-engine',schema:twoImages}).hasPrompt,false);
 assert.deepEqual(workflowFor({promptKey:'prompt',schema:prompts}),{promptKey:'prompt',hasPrompt:true,promptRequired:true,imageKeys:[]});
 assert.equal(workflowFor({promptKey:'prompt',schema:optional}).promptRequired,false);
 assert.deepEqual(preparePrompt({input_image:dataUrl},{schema:twoImages},'DO NOT INJECT'),{input_image:dataUrl});
 assert.equal(preparePrompt({}, {schema:optional,promptKey:'prompt'},'').prompt,'A quiet night');
 assert.equal(preparePrompt({prompt:'Advanced value'}, {schema:optional,promptKey:'prompt'},'').prompt,'Advanced value');
});
test('actual HTTP generation runs a two-image model without a prompt and keeps session identity',()=>fixture(async t=>{
 const b=generation(),response=await t.post('/api/generate',b);assert.equal(response.status,202);const {job}=await response.json();assert.equal(job.sessionId,b.sessionId);
 await waitFor(()=>t.app.state.jobs[0].status==='succeeded');
 const submitted=JSON.parse(t.calls.find(c=>c.options.method==='POST').options.body);
 assert.deepEqual(Object.keys(submitted.input).sort(),['input_image','swap_image']);assert.equal(submitted.version,'c'.repeat(64));assert.equal(t.app.state.jobs[0].assets.length,1);
 assert.equal((await(await fetch(t.base+'/api/jobs')).json()).jobs[0].sessionId,b.sessionId);
}));
test('image-only model ignores unrelated main prompt instead of inventing model text',()=>fixture(async t=>{
 const r=await t.post('/api/generate',generation({prompt:'This prior document text is not a model parameter'}));assert.equal(r.status,202);await waitFor(()=>t.app.state.jobs[0].status==='succeeded');assert.equal(JSON.parse(t.calls.find(c=>c.options.method==='POST').options.body).input.prompt,undefined);
}));
test('missing required image or unknown input fails before submitting or persisting a job',()=>fixture(async t=>{
 for(const input of [{input_image:dataUrl},{input_image:dataUrl,swap_image:'https://images.example.test/x.png',prompt:'not in schema'}]){
  const r=await t.post('/api/generate',generation({input}));assert.equal(r.status,422);assert.equal((await r.json()).code,'model_input_invalid');
 }
 assert.equal(t.app.state.jobs.length,0);assert.equal(t.calls.filter(c=>c.options.method==='POST').length,0);
}));
test('required prompt model and direct GPT still reject an empty prompt',()=>fixture(async t=>{
 const p=await t.post('/api/generate',generation({model:'fixture/required',input:{}}));assert.equal(p.status,422);assert.match((await p.json()).error,/prompt is required/);
 const direct=await t.post('/api/generate',generation({provider:'openai',model:'gpt-image-fixture',input:{}}));assert.equal(direct.status,400);assert.equal(t.app.state.jobs.length,0);
}));
test('optional model prompt uses its declared default without requiring user text',()=>fixture(async t=>{
 const r=await t.post('/api/generate',generation({model:'fixture/optional',input:{}}));assert.equal(r.status,202);await waitFor(()=>t.app.state.jobs[0].status==='succeeded');assert.equal(JSON.parse(t.calls.find(c=>c.options.method==='POST').options.body).input.prompt,'A quiet night');
}));
test('input uploads materialize locally and saved project protects all referenced inputs',()=>fixture(async t=>{
 const {asset}=await(await t.post('/api/import',{dataUrl,title:'Local reference'})).json();const input={input_image:asset.url,swap_image:asset.url};
 const id=randomUUID(),project={version:3,assetId:null,generation:{input},research:{chats:{openai:[{role:'user',content:'A separate research note'}],xai:[]},drafts:{openai:'Unsent note',xai:''}}};
 const saved=await t.post('/api/projects',{id,name:'Shared document',project});assert.equal(saved.status,200);
 assert.equal((await t.post('/api/assets/'+asset.id+'/delete',{})).status,409);
 const r=await t.post('/api/generate',generation({input,sessionId:id}));assert.equal(r.status,202);await waitFor(()=>t.app.state.jobs[0].status==='succeeded');const sent=JSON.parse(t.calls.find(c=>c.options.method==='POST').options.body).input;
 assert.equal(sent.input_image,dataUrl);assert.equal(sent.swap_image,dataUrl);assert.equal(t.calls.some(c=>c.url.includes('/assets/')),false);
 await t.restart();const state=await(await fetch(t.base+'/api/state')).json();assert.deepEqual(state.projects[0].project,project);assert.ok(state.assets.some(a=>a.id===asset.id));assert.equal((await fetch(t.base+asset.url)).status,200);
}));
test('missing local reference fails without a charged provider submission',()=>fixture(async t=>{
 const r=await t.post('/api/generate',generation({input:{input_image:'/assets/'+randomUUID()+'.png',swap_image:dataUrl}}));assert.equal(r.status,400);assert.equal(t.app.state.jobs.length,0);assert.equal(t.calls.filter(c=>c.options.method==='POST').length,0);
}));
test('provider cover/avatar metadata keeps only actual safe data',()=>{
 const m=modelMetadata({owner:'artist',name:'model',cover_image_url:'https://replicate.delivery/cover.webp',owner_avatar_url:'https://example.com/avatar.png',run_count:77,latest_version:{created_at:'2026-09-01'},github_url:'javascript:alert(1)'});
 assert.equal(m.id,'artist/model');assert.equal(m.runCount,77);assert.equal(m.coverImageUrl,'https://replicate.delivery/cover.webp');assert.equal(m.ownerAvatarUrl,'https://example.com/avatar.png');assert.equal(m.githubUrl,null);
 const absent=modelMetadata({owner:'artist',name:'plain',run_count:'made up'});assert.equal(absent.ownerAvatarUrl,null);assert.equal(absent.coverImageUrl,null);assert.equal(absent.runCount,null);
});
test('preview URL and required-array validation rejects invalid URLs, scripts and wrong item counts',()=>{
 assert.equal(safeImageUrl('javascript:alert(1)'), '');assert.equal(safeImageUrl('https://user:pass@example.com/x.png'),'');assert.equal(safeImageUrl('file:///C:/private.png'),'');assert.equal(safeImageUrl(dataUrl),dataUrl);
 const schema={required:['images'],properties:{images:{type:'array',minItems:1,maxItems:4,items:{type:'string',format:'uri'}}}};
 assert.deepEqual(missingInputs({images:[]},schema),['images']);assert.throws(()=>validateInput({images:[]},schema));assert.throws(()=>validateInput({images:['javascript:bad']},schema));assert.throws(()=>validateInput({images:Array(5).fill('https://example.com/a.png')},schema));validateInput({images:[dataUrl]},schema);
});
test('prompt preset edits persist across restart without changing keys',()=>fixture(async t=>{
 const before=await readFile(path.join(t.root,'.env'),'utf8');const presets={original:'',cinematic:'Muted movie light',thumbnail:'Clear text space',railify:'Gold rim, dark background'};
 assert.equal((await t.post('/api/preferences',{presets})).status,200);await t.restart();assert.deepEqual((await(await fetch(t.base+'/api/state')).json()).preferences.presets,presets);assert.equal(await readFile(path.join(t.root,'.env'),'utf8'),before);
 assert.equal((await t.post('/api/preferences',{presets:{...presets,railify:'x'.repeat(8001)}})).status,400);assert.equal((await(await fetch(t.base+'/api/state')).json()).preferences.presets.railify,presets.railify);
}));
test('legacy saved projects are read without requiring the new project structure',()=>fixture(async t=>{
 const project={assetId:null,settings:{thumbTitle:'Old project'},generation:{prompt:'old prompt'}};await t.post('/api/projects',{name:'Existing 0.2',project});await t.restart();const result=(await(await fetch(t.base+'/api/state')).json()).projects;assert.equal(result[0].name,'Existing 0.2');assert.deepEqual(result[0].project,project);
}));
test('new shared module, workspace styles and Research route are served as correct static types',()=>fixture(async t=>{
 await mkdir(path.join(t.root,'public'),{recursive:true});await cp(new URL('../public/',import.meta.url),path.join(t.root,'public'),{recursive:true});
 for(const [route,type] of [['/workspace.css','text/css'],['/model-schema.js','text/javascript'],['/research','text/html']]){const r=await fetch(t.base+route);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),new RegExp(type));}
 assert.equal((await fetch(t.base+'/.data/state.json')).status,404);assert.equal((await fetch(t.base+'/.env')).status,404);
 const page=await readFile(path.join(t.root,'public/index.html'),'utf8');const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length);
}));
