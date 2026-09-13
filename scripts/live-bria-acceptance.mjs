import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';

function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),check=Buffer.alloc(4);size.writeUInt32BE(data.length);check.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,check]);}
function acceptancePng(width=640,height=400){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;const raw=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){const row=y*(width*3+1);for(let x=0;x<width;x++){const offset=row+1+x*3,gold=x>width*.58&&y>height*.16&&y<height*.84;raw[offset]=gold?232:28+Math.floor(x/width*48);raw[offset+1]=gold?189:20+Math.floor(y/height*36);raw[offset+2]=gold?85:46+Math.floor(x/width*56);}}return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}

export async function acceptance({page,directory}){
  assert.equal(new URL(page.url()).origin,'https://lab.thirdrailify.com','Sign in to the stable Lab before acceptance.');
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});page.on('response',response=>{if(response.status()>=500)errors.push(`${response.status()} ${new URL(response.url()).pathname}`);});

  await page.locator('#libraryButton').click();await page.locator('#libraryNew').click();await page.waitForFunction(()=>document.querySelector('.document-tab.active')?.dataset.doc);
  await page.locator('#modelPicker').click();await page.locator('#modelQuery').fill('bria/expand-image');await page.locator('#searchModels').click();await page.locator('#modelsDialog').waitFor({state:'hidden'});await page.locator('#schemaStatus').filter({hasText:'Live inputs loaded'}).waitFor();
  assert.equal(await page.locator('[data-field="image"] input[type=file]').count(),1);assert.equal(await page.locator('[data-field="image_url"] input[type=file]').count(),0);assert.equal(await page.locator('[data-param="image_url"]').getAttribute('type'),'url');
  await page.locator('[data-reference="image"]').setInputFiles({name:'bria-expand-acceptance.png',mimeType:'image/png',buffer:acceptancePng()});await page.locator('[data-preview="image"] img').waitFor();await page.locator('#resultImage:not([hidden])').waitFor();assert.match(await page.locator('#canvasLabel').textContent(),/REFERENCE.*Image/i);
  await page.locator('[data-param="image_url"]').fill('');await page.locator('[data-param="aspect_ratio"]').selectOption('16:9');await page.locator('#prompt').fill('');
  await page.locator('#saveSession').click();await page.locator('#sessionDialog').waitFor({state:'visible'});await page.locator('#sessionNameInput').fill('Bria Expand private-input acceptance');await page.locator('#sessionConfirm').click();await page.getByText('Project and research saved to your account.',{exact:true}).waitFor();

  const responsePromise=page.waitForResponse(response=>response.url()==='https://lab.thirdrailify.com/api/generate'&&response.request().method()==='POST',{timeout:30000});await page.locator('#generate').click();const response=await responsePromise;
  const request=response.request().postDataJSON(),body=await response.json();if(!response.ok())throw new Error(`The single authorized Bria submission was not accepted (HTTP ${response.status()}): ${body.message||body.error||'unknown error'}`);
  assert.equal(request.input.image.kind,'lab_asset');assert.equal(request.input.image_url,undefined);assert.equal(request.input.prompt,undefined);assert.equal(request.input.aspect_ratio,'16:9');
  const jobId=body.job?.id;assert.match(jobId||'',/^[a-f0-9-]{36}$/);
  const terminal=await page.evaluate(async jobId=>{const deadline=Date.now()+12*60*1000;while(Date.now()<deadline){const response=await fetch('/api/jobs'),body=await response.json(),job=body.jobs?.find(item=>item.id===jobId);if(job&&['succeeded','failed','canceled','submission_uncertain','download_failed'].includes(job.status))return job;await new Promise(resolve=>setTimeout(resolve,5000));}throw new Error('Timed out waiting for the known Bria prediction.');},jobId);
  if(terminal.status!=='succeeded')throw new Error(`The known Bria prediction ended as ${terminal.status}: ${terminal.error||terminal.phase||'no detail'}`);assert.ok(terminal.providerId);assert.equal(terminal.assets.length,1);
  await page.reload();await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.locator('[data-preview="image"] img').waitFor();await page.locator('#resultImage:not([hidden])').waitFor();await page.locator('#saveSession').click();await page.getByText('Project and research saved to your account.',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.locator('[data-preview="image"] img').waitFor();await page.locator('#resultImage:not([hidden])').waitFor();
  await page.screenshot({path:directory+'/bria-expand-private-input.png',fullPage:true});
  assert.deepEqual(errors,[]);
  const evidence={stableOrigin:true,model:'bria/expand-image',schema:{image:'uri_file',image_url:'plain_string',prompt:'optional'},sourceDimensions:'640x400',requestedAspectRatio:'16:9',submittedOnce:true,sanitizedInputTypes:{image:'lab_asset',aspect_ratio:'string'},providerPredictionKnown:true,status:terminal.status,privateOutputCount:terminal.assets.length,projectSavedAndReloadedTwice:true,inputPreviewRestored:true,canvasImageRestored:true,consoleOrNetworkErrors:errors};await writeFile(directory+'/bria-expand-private-input.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
