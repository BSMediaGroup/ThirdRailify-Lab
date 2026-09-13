'use strict';
const{test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const port=44000+Math.floor(Math.random()*15000);
function get(p,method='GET',host=`127.0.0.1:${port}`){return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port,path:p,method,headers:{Host:host}},s=>{const b=[];s.on('data',c=>b.push(c));s.on('end',()=>resolve({status:s.statusCode,headers:s.headers,body:Buffer.concat(b).toString('utf8')}));});r.on('error',reject);r.setTimeout(3000,()=>r.destroy(Error('Local test timed out')));r.end();});}
test('read-only loopback server and nested board routes',async t=>{
 const proc=spawn(process.execPath,[path.join(ROOT,'server.cjs')],{cwd:ROOT,env:{...process.env,NOTESPACE_PORT:String(port)},stdio:'pipe'});
 try{
  let ready=false;for(let i=0;i<50;i++){try{if((await get('/health.json')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,40));}assert.ok(ready,'local server ready');
  await t.test('health states no Cloudflare and no secret values',async()=>{const r=await get('/health.json'),d=JSON.parse(r.body);assert.equal(d.cloudflare,false);assert.equal(d.version,'0.1.0');assert.ok(!r.body.includes('API_KEY'));});
  await t.test('deep-linked board uses root-relative script/style paths',async()=>{const r=await get('/notespace/vn7TnJ5?cinema=1');assert.equal(r.status,200);for(const f of ['/styles.css','/model.js','/seed.js','/app.js']){assert.ok(r.body.includes(`"${f}"`));const resource=await get(f);assert.equal(resource.status,200);assert.ok(resource.body.length>100);}});
  await t.test('headers preserve static CSP and no-store',async()=>{const r=await get('/');assert.match(r.headers['content-security-policy'],/script-src 'self';/);assert.ok(!r.headers['content-security-policy'].includes('unsafe-eval'));assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers['x-content-type-options'],'nosniff');});
  await t.test('writes, other hosts and hidden files are rejected',async()=>{assert.equal((await get('/','POST')).status,405);assert.equal((await get('/','GET','evil.example')).status,403);assert.equal((await get('/.env')).status,403);assert.notEqual((await get('/%2e%2e/server.cjs')).status,200);});
  await t.test('single-file package has no script or stylesheet dependency',()=>{const s=fs.readFileSync(path.join(ROOT,'OPEN-NOTESPACE.html'),'utf8');assert.ok(!/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(s));assert.match(s,/data:image\/gif;base64,/);assert.match(s,/ThirdRailify-Notespace-POC/);});
 }finally{proc.kill();await new Promise(r=>proc.once('exit',r));}
});
