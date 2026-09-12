import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicImageUrl, fetchBoundedImage, searchGoogleImages, verifyImageResultToken} from '../lib/google-images.mjs';

const env={GOOGLE_CUSTOM_SEARCH_API_KEY:'fixture-secret-key',GOOGLE_CUSTOM_SEARCH_CX:'fixture-engine'};
const owner='account-a',projectId='11111111-1111-4111-8111-111111111111';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');

test('Google Custom Search request uses supported image filters and returns only sanitized signed results',async()=>{
  let target;const fetcher=async input=>{target=new URL(input);return Response.json({items:[{title:'  Fixture\nimage  ',link:'https://cdn.example/image.png',mime:'image/png',snippet:'not returned',image:{thumbnailLink:'https://cdn.example/thumb.png',contextLink:'https://example.com/page',width:1200,height:800,byteSize:999}}],queries:{nextPage:[{startIndex:11}]},searchInformation:{totalResults:'8000'}});};
  const result=await searchGoogleImages(env,owner,projectId,'https://lab.thirdrailify.com/api/research/images?q=night+train&safe=active&type=photo&size=large&color=color&dominant=purple&site=example.com',fetcher);
  assert.equal(target.origin,'https://customsearch.googleapis.com');assert.equal(target.searchParams.get('key'),env.GOOGLE_CUSTOM_SEARCH_API_KEY);assert.equal(target.searchParams.get('cx'),env.GOOGLE_CUSTOM_SEARCH_CX);assert.equal(target.searchParams.get('searchType'),'image');assert.equal(target.searchParams.get('imgType'),'photo');assert.equal(target.searchParams.get('imgSize'),'large');assert.equal(target.searchParams.get('imgColorType'),'color');assert.equal(target.searchParams.get('imgDominantColor'),'purple');assert.equal(target.searchParams.get('siteSearch'),'example.com');
  assert.equal(result.total,100);assert.equal(result.nextStart,11);assert.equal(result.items[0].title,'Fixture image');assert.equal(result.items[0].snippet,undefined);assert.doesNotMatch(JSON.stringify(result),/fixture-secret-key/);assert.equal(verifyImageResultToken(env,result.items[0].token,{owner,projectId}).imageUrl,'https://cdn.example/image.png');assert.throws(()=>verifyImageResultToken(env,result.items[0].token,{owner:'account-b',projectId}),/invalid or expired/);
});

test('search rejects missing configuration, unsupported controls and out-of-range pagination',async()=>{
  await assert.rejects(searchGoogleImages({},owner,projectId,'https://lab.test/api/research/images?q=test'),/not configured/);await assert.rejects(searchGoogleImages(env,owner,projectId,'https://lab.test/api/research/images?q=test&type=wallpaper'),/Unsupported image type/);await assert.rejects(searchGoogleImages(env,owner,projectId,'https://lab.test/api/research/images?q=test&start=92'),/outside Google/);await assert.rejects(searchGoogleImages(env,owner,projectId,'https://lab.test/api/research/images?q=test&site=http%3A%2F%2Flocalhost'),/Enter a domain/);
});

test('Google provider failures are mapped to bounded configuration, quota and service errors',async()=>{
  await assert.rejects(searchGoogleImages(env,owner,projectId,'https://lab.test/api/research/images?q=test',async()=>Response.json({error:{errors:[{reason:'dailyLimitExceeded'}]}},{status:429})),error=>error.code==='google_images_quota'&&error.status===429);
  await assert.rejects(searchGoogleImages(env,owner,projectId,'https://lab.test/api/research/images?q=test',async()=>Response.json({error:{errors:[{reason:'keyInvalid'}]}},{status:400})),error=>error.code==='google_images_configuration_rejected'&&error.status===503);
  await assert.rejects(searchGoogleImages(env,owner,projectId,'https://lab.test/api/research/images?q=test',async()=>new Response('<html>upstream failure</html>',{status:502})),error=>error.code==='google_images_provider_error'&&error.status===502);
});

test('remote image import rejects local, private, reserved and credential-bearing destinations',()=>{
  for(const url of ['http://example.com/a.png','https://localhost/a.png','https://127.0.0.1/a.png','https://10.0.0.1/a.png','https://169.254.169.254/latest','https://192.168.1.1/a','https://[::1]/a','https://[fd00::1]/a','https://user:pass@example.com/a.png'])assert.throws(()=>assertPublicImageUrl(url),/HTTPS|Private/);
  assert.equal(assertPublicImageUrl('https://images.example/path.png').hostname,'images.example');
});

test('remote fetch revalidates redirects, bounds bytes and verifies content type and signature',async()=>{
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}})),/Private/);
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response('<html></html>',{headers:{'Content-Type':'text/html'}})),/public HTTPS|image sources|image/);
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response('not an image',{headers:{'Content-Type':'image/png'}})),/supported PNG/);
  await assert.rejects(fetchBoundedImage('https://images.example/a',async()=>new Response(png,{headers:{'Content-Type':'image/png','Content-Length':String(13*1024*1024)}})),/12 MB import limit/);
  const valid=await fetchBoundedImage('https://images.example/a',async()=>new Response(png,{headers:{'Content-Type':'image/png'}}));assert.equal(valid.type.mime,'image/png');assert.deepEqual(valid.size,{width:1,height:1});
});
