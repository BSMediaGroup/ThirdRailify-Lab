import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertPublicImageUrl,fetchBoundedImage,googleImageConfiguration,normalizeGoogleResult} from '../lib/google-images.mjs';
import {normalizeGoogleImageResult,normalizeGooglePromotion} from '../public/google-image-renderer.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const publicResolver=async()=>true;

test('Google Standard Search Element config exposes only the non-secret CX and truthful scope',()=>{
  const configured=googleImageConfiguration({GOOGLE_PSE_CX:'fixture-engine',GOOGLE_CUSTOM_SEARCH_API_KEY:'must-be-ignored'});
  assert.deepEqual(configured,{configured:true,cx:'fixture-engine',provider:'Google Programmable Search Element',integration:'standard_search_element',imageSearchAvailable:true,scope:'configured_engine',scopeLabel:'Configured engine',adSupported:true,legacyJsonApi:false});
  assert.equal(googleImageConfiguration({}).configured,false);
});

test('documented callback result metadata is normalized without a Google DOM scrape',()=>{
  const result=normalizeGoogleResult({title:'<b>Formatted</b>',titleNoFormatting:'  Fixture\n image  ',url:'https://images.example/image.png',visibleUrl:'images.example/image.png',contextUrl:'https://example.com/page',image:{url:'https://images.example/image.png',width:1200,height:800},thumbnailImage:{url:'https://images.example/thumb.png',width:300,height:200},fileFormat:'image/png',ignored:'not returned'});
  assert.equal(result.title,'Fixture image');assert.equal(result.titleNoFormatting,'Fixture image');assert.equal(result.contextUrl,'https://example.com/page');assert.equal(result.imageUrl,'https://images.example/image.png');assert.equal(result.thumbnailUrl,'https://images.example/thumb.png');assert.equal(result.sourceHostname,'example.com');assert.equal(result.ignored,undefined);
});

test('native client normalization binds documented fields to account, project, instance and generation',()=>{
  const binding={accountId:'account-a',projectId:'project-a',gname:'images-7',generation:4,query:'COBE MANSION',activityId:'activity-a'};
  const result=normalizeGoogleImageResult({title:'<img src=x onerror=alert(1)>',titleNoFormatting:'Cobe Mansion',url:'https://images.example/image.png',visibleUrl:'example.com/mansion',contextUrl:'https://example.com/mansion',image:{url:'https://images.example/image.png',width:'1200',height:800},thumbnailImage:{url:'https://images.example/thumb.png',width:300,height:200},fileFormat:'image/png',content:'must not be copied',ignored:true},binding,2);
  assert.deepEqual({id:result.resultId,account:result.accountId,project:result.projectId,instance:result.searchInstance,generation:result.generation,query:result.query,title:result.title}, {id:'4:2',account:'account-a',project:'project-a',instance:'images-7',generation:4,query:'COBE MANSION',title:'Cobe Mansion'});
  assert.equal(result.content,undefined);assert.equal(result.ignored,undefined);assert.equal(result.image.width,1200);assert.ok(Object.isFrozen(result));
  assert.throws(()=>normalizeGoogleImageResult({image:{url:'javascript:alert(1)'},contextUrl:'https://example.com'},binding,0),/safe image/);
  assert.equal(normalizeGooglePromotion({title:'Sponsored result',url:'https://example.com/promo',visibleUrl:'example.com'}).title,'Sponsored result');
});

test('Google callbacks install before cse.js and ready always bypasses the eval-dependent default renderer',async()=>{
  const [app,renderer,middleware]=await Promise.all([readFile(new URL('../public/app.js',import.meta.url),'utf8'),readFile(new URL('../public/google-image-renderer.js',import.meta.url),'utf8'),readFile(new URL('../functions/_middleware.js',import.meta.url),'utf8')]);
  assert.ok(app.indexOf('window.__gcse=')<app.indexOf("document.createElement('script')",app.indexOf('window.__gcse=')));
  assert.match(app,/ready:googleReady/);assert.match(app,/function googleReady[\s\S]*return true;/);assert.doesNotMatch(app,/attachGoogleActions|return false/);
  assert.match(app,/state\.activeSessionId!==run\.projectId/);assert.match(app,/item\.projectId/);assert.match(app,/googleResultRegistry\.get\(item\.resultId\)!==item/);
  assert.doesNotMatch(renderer,/innerHTML|insertAdjacentHTML/);assert.match(renderer,/\.textContent =/);assert.match(renderer,/replaceChildren\(fragment\)/);
  const csp=middleware.match(/'Content-Security-Policy':"([^"]+)"/)?.[1]||'';
  assert.ok(csp);assert.doesNotMatch(csp,/'unsafe-eval'/);for(const origin of ['https://cse.google.com','https://www.google.com','https://www.gstatic.com'])assert.match(csp,new RegExp(origin.replaceAll('.','\\.')));
});

test('remote image import rejects local, private, reserved and credential-bearing destinations',()=>{
  for(const url of ['http://example.com/a.png','https://localhost/a.png','https://127.0.0.1/a.png','https://10.0.0.1/a.png','https://169.254.169.254/latest','https://192.168.1.1/a','https://[::1]/a','https://[fd00::1]/a','https://user:pass@example.com/a.png'])assert.throws(()=>assertPublicImageUrl(url),/HTTPS|Private/);
  assert.equal(assertPublicImageUrl('https://images.example/path.png').hostname,'images.example');
});

test('remote fetch revalidates redirects, bounds bytes and verifies content type and signature',async()=>{
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}}),publicResolver),/Private/);
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}}),publicResolver),/supported image/);
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response('not an image',{headers:{'Content-Type':'image/png'}}),publicResolver),/supported PNG/);
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response(png,{headers:{'Content-Type':'image/png','Content-Length':String(13*1024*1024)}}),publicResolver),/12 MB import limit/);
  const valid=await fetchBoundedImage('https://images.example/a',async()=>new Response(png,{headers:{'Content-Type':'image/png'}}),publicResolver);assert.equal(valid.type.mime,'image/png');assert.deepEqual(valid.size,{width:1,height:1});
});
