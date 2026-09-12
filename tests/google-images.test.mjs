import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicImageUrl,fetchBoundedImage,googleImageConfiguration,normalizeGoogleResult} from '../lib/google-images.mjs';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const publicResolver=async()=>true;

test('Google Standard Search Element config exposes only the non-secret CX and truthful scope',()=>{
  const configured=googleImageConfiguration({GOOGLE_PSE_CX:'fixture-engine',GOOGLE_CUSTOM_SEARCH_API_KEY:'must-be-ignored'});
  assert.deepEqual(configured,{configured:true,cx:'fixture-engine',provider:'Google Programmable Search Element',integration:'standard_search_element',imageSearchAvailable:true,scope:'configured_engine',scopeLabel:'Configured engine',adSupported:true,legacyJsonApi:false});
  assert.equal(googleImageConfiguration({}).configured,false);
});

test('documented callback result metadata is normalized without a Google DOM scrape',()=>{
  const result=normalizeGoogleResult({title:'  Fixture\n image  ',url:'https://images.example/image.png',visibleUrl:'images.example/image.png',contextUrl:'https://example.com/page',image:{url:'https://images.example/image.png',width:1200,height:800},thumbnailImage:{url:'https://images.example/thumb.png',width:300,height:200},fileFormat:'image/png',ignored:'not returned'});
  assert.equal(result.title,'Fixture image');assert.equal(result.contextUrl,'https://example.com/page');assert.equal(result.imageUrl,'https://images.example/image.png');assert.equal(result.thumbnailUrl,'https://images.example/thumb.png');assert.equal(result.sourceHostname,'example.com');assert.equal(result.ignored,undefined);
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
