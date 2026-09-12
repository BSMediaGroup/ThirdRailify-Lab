import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs';

const origin='http://127.0.0.1:8798';
const directory=path.resolve('.artifacts/browser/model-explorer-'+Date.now());
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});

try{
  for(const [width,height] of [[1440,1000],[390,844]]){
    const context=await browser.newContext({viewport:{width,height}});
    await context.addCookies([{name:'thirdrailify_session',value:'local-browser-fixture-token-12345678901234567890',url:origin,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage(),errors=[];
    await page.route('https://fixture.images.example/**',route=>{
      const name=decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)).replace(/\.png$/,'');
      const hue=[...name].reduce((sum,char)=>sum+char.charCodeAt(0),0)%90+250;
      const label=name.split('/').at(-1).replaceAll('-',' ').toUpperCase();
      return route.fulfill({status:200,contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 38% 25%)"/><stop offset=".55" stop-color="#17101f"/><stop offset="1" stop-color="#b48736"/></linearGradient><radialGradient id="r"><stop stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="720" height="720" fill="url(#g)"/><circle cx="560" cy="130" r="280" fill="url(#r)"/><path d="M0 560L230 330l130 122 98-92 262 248v112H0z" fill="#08070b" opacity=".62"/><text x="52" y="90" fill="#f5d473" font-family="Arial" font-size="18" font-weight="700" letter-spacing="5">REPLICATE MODEL</text><text x="52" y="620" fill="white" font-family="Arial" font-size="38" font-weight="800">${label}</text></svg>`});
    });
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=500)errors.push(`${response.status()} ${response.url()}`);});
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});

    await page.goto(origin);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('#modelPicker').click();
    const cards=page.locator('#modelResults .model-result');
    await assert.doesNotReject(()=>cards.first().waitFor({state:'visible'}));
    await page.waitForFunction(()=>[...document.querySelectorAll('#modelResults .model-cover')].length===4&&[...document.querySelectorAll('#modelResults .model-cover')].every(image=>image.complete&&image.naturalWidth>0));
    assert.equal(await cards.count(),4,'all four featured cards render');
    const geometry=await cards.evaluateAll(nodes=>nodes.map(card=>{
      const visual=card.querySelector('.model-result-visual'),image=card.querySelector('.model-cover'),rect=visual.getBoundingClientRect();
      return {ratio:rect.width/rect.height,fit:getComputedStyle(image).objectFit};
    }));
    assert.equal(geometry.every(item=>Math.abs(item.ratio-1)<.02),true,'featured media canvases are square');
    assert.equal(geometry.every(item=>item.fit==='cover'),true,'featured images fill their square canvases');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'modal causes no horizontal overflow');
    await page.screenshot({path:path.join(directory,`featured-${width}.png`)});

    const fallbackTest=cards.nth(1).locator('.model-result-visual');
    await fallbackTest.locator('img').evaluate(image=>image.dispatchEvent(new Event('error')));
    await page.waitForFunction(()=>document.querySelectorAll('#modelResults .model-cover').length===3);
    const fallbackBackground=await fallbackTest.locator('.model-cover-empty').evaluate(node=>getComputedStyle(node).backgroundImage);
    assert.match(fallbackBackground,/radial-gradient/);
    assert.doesNotMatch(fallbackBackground,/rgb\(53, 51, 27\)|rgb\(19, 21, 12\)/,'old olive fallback is gone');
    await page.screenshot({path:path.join(directory,`fallback-${width}.png`)});

    await cards.first().click();
    await page.locator('#modelsDialog').waitFor({state:'hidden'});
    const info=page.locator('#modelInfoPanel');
    if(await info.isHidden())await page.locator('#modelInfoChip').evaluate(button=>button.click());
    await info.waitFor({state:'visible'});
    const infoMedia=await info.locator('.model-info-visual').evaluate(node=>{const rect=node.getBoundingClientRect(),panel=node.parentElement.getBoundingClientRect(),image=node.querySelector('.model-cover');return {height:rect.height,ratio:rect.width/rect.height,panelShare:rect.height/panel.height,fit:getComputedStyle(image).objectFit};});
    assert.ok(infoMedia.height<=132,'model detail feature image stays compact');
    assert.ok(infoMedia.ratio>2.4,'model detail feature image uses a discreet banner crop');
    assert.ok(infoMedia.panelShare<.32,'model detail feature image never dominates the panel');
    assert.equal(infoMedia.fit,'cover','detail image cleanly fills its compact canvas');
    await page.screenshot({path:path.join(directory,`details-${width}.png`)});
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log(directory);
}finally{await browser.close();}
