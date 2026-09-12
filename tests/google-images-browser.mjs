import {chromium} from '../../ThirdRailify/node_modules/playwright-core/index.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base=process.env.LAB_BROWSER_BASE||'http://127.0.0.1:8798';
const directory=`X:/GIT/ThirdRailify-Lab/.artifacts/browser/google-images-${Date.now()}`;
await mkdir(directory,{recursive:true});
const thumbnail=await readFile(new URL('../assets/backgrounds/labseo.webp',import.meta.url));
const googleFixture=`(()=>{const elements={};window.__queries=[];window.google={search:{cse:{element:{render(options){const host=document.getElementById(options.div),control=document.createElement('div'),results=document.createElement('div');control.className='gsc-control-cse';results.className='gsc-results';control.append(results);host.replaceChildren(control);elements[options.gname]={execute(input){const callbacks=window.__gcse.searchCallbacks.image,query=callbacks.starting(options.gname,input);window.__queries.push(query);if(query==='provider challenge')return;const deliver=()=>{const items=query==='no results'?[]:query==='malformed result'?[{}]:Array.from({length:4},(_,index)=>({title:'<img src=x onerror="window.__injected=true">',titleNoFormatting:'COBE Mansion reference '+(index+1),url:'https://fixture.images.example/image-'+index+'.png',visibleUrl:'fixture.example/reference-'+index,contextUrl:'https://fixture.example/reference-'+index,image:{url:'https://fixture.images.example/image-'+index+'.png',width:1200+index,height:800+index},thumbnailImage:{url:query==='thumbnail failure'&&index===0?'https://fixture.images.example/missing.png':'https://fixture.images.example/image-'+index+'.png',width:300,height:200},fileFormat:'image/png'}));const promos=query==='callback failure'?{}:query==='no promotions'?null:[{title:'Workshop promotion',content:'Required promotional content',url:'https://fixture.example/promotion',visibleUrl:'fixture.example'}],values=query==='callback failure'?{}:items,handled=callbacks.ready(options.gname,query,promos,values,results);if(handled!==true)(0,eval)("results.textContent='DEFAULT GOOGLE RENDERER'");const branding=document.createElement('div');branding.className='gsc-branding';branding.textContent='Enhanced by Google';control.querySelector('.gsc-branding')?.remove();control.append(branding);callbacks.rendered(options.gname,query,[],[]);};if(query==='late project result')setTimeout(deliver,150);else deliver();}};},getElement(name){return elements[name];}}}}};window.__gcse.initializationCallback();})();`;

const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:process.env.LAB_BROWSER_HEADED!=='1'});
const evidence=[];
try{
  for(const [width,height] of [[1920,1080],[1440,900],[768,1024],[390,844]]){
    const context=await browser.newContext({viewport:{width,height}});
    await context.addCookies([{name:'thirdrailify_session',value:'local-browser-fixture-token-12345678901234567890',url:base,httpOnly:true,sameSite:'Lax'}]);
    await context.route('https://fixture.example/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture source</title>'}));
    await context.route('https://cse.google.com/cse.js**',route=>route.fulfill({contentType:'text/javascript',body:googleFixture}));
    await context.route('https://fixture.images.example/**',route=>route.request().url().endsWith('/missing.png')?route.fulfill({status:404}):route.fulfill({contentType:'image/webp',body:thumbnail}));
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});
    const response=await page.goto(base+'/');
    const csp=response.headers()['content-security-policy']||'';
    assert.ok(csp.includes("script-src 'self' https://cse.google.com"));
    assert.ok(!csp.includes("'unsafe-eval'"));
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    if(width<=1000){await page.locator('#researchVisibility').evaluate(element=>{element.style.display='flex';});await page.locator('#researchVisibility').click();}
    if(width===1920){await page.locator('#resizeHandle').focus();for(let index=0;index<4;index++)await page.keyboard.press('Shift+ArrowLeft');}
    await page.locator('#imagesTab').click();
    await page.locator('#googleQuery').fill('COBE MANSION');await page.locator('#googleSearch').click();
    await page.locator('.google-image-result').first().waitFor();
    assert.equal(await page.locator('.google-image-result').count(),4);
    assert.equal(await page.locator('.google-image-result img').first().evaluate(image=>image.complete&&image.naturalWidth>0),true);
    assert.equal(await page.getByText('DEFAULT GOOGLE RENDERER',{exact:true}).count(),0);
    assert.equal(await page.evaluate(()=>window.__injected),undefined);
    assert.equal(await page.getByText('Enhanced by Google',{exact:true}).count(),1);
    assert.equal(await page.locator('.google-promotions').count(),1);
    const rects=await page.locator('.google-image-result').evaluateAll(cards=>cards.map(card=>{const box=card.getBoundingClientRect();return {top:Math.round(box.top),width:Math.round(box.width)}}));
    const columns=new Set(rects.map(rect=>rect.top)).size<rects.length?2:1;
    if(width===1920)assert.equal(columns,2);else assert.equal(columns,1);
    await page.screenshot({path:`${directory}/google-images-${width}.png`,fullPage:true});
    await page.locator('#googleQuery').fill('violet railway station');await page.locator('#googleSearch').click();await page.getByText('COBE Mansion reference 1',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.__queries.slice(-2)),['COBE MANSION','violet railway station']);
    if(width===1440){
      const sourcePromise=context.waitForEvent('page');await page.locator('.google-result-actions').first().getByRole('link',{name:'SOURCE'}).click();const source=await sourcePromise;await source.waitForLoadState();assert.equal(source.url(),'https://fixture.example/reference-0');await source.close();
      await page.locator('.google-result-actions').first().getByRole('button',{name:'ADD TO CHAT'}).click();await page.getByText('Image added to the Research draft. It was not sent.',{exact:true}).waitFor();
      await page.locator('.google-result-actions').nth(1).getByRole('button',{name:'REFERENCE'}).click();await page.getByText(/active model has no compatible image input/).waitFor();
      await page.locator('.google-result-actions').nth(2).getByRole('button',{name:'COMPOSE'}).click();await page.waitForFunction(()=>document.querySelector('#sessionDialog')?.open||document.querySelector('#toast')?.textContent==='Imported image added to Compose as the base layer.');if(await page.locator('#sessionDialog').evaluate(dialog=>dialog.open))await page.locator('#sessionConfirm').click();await page.getByText('Imported image added to Compose as the base layer.',{exact:true}).waitFor();
      for(const [query,title] of [['no results','No image results.'],['malformed result','Google results could not be displayed.'],['callback failure','Google Images could not display these results.']]){await page.locator('#imagesTab').click();await page.locator('#googleQuery').fill(query);await page.locator('#googleSearch').click();await page.getByText(title,{exact:true}).waitFor();assert.ok(!(await page.locator('#googleSearchState').textContent()).includes('EvalError'));}
      await page.locator('#googleQuery').fill('no promotions');await page.locator('#googleSearch').click();await page.locator('.google-image-result').first().waitFor();assert.equal(await page.locator('.google-promotions').count(),0);
      await page.locator('#googleQuery').fill('provider challenge');await page.locator('#googleSearch').click();await page.getByText('Google Images took too long.',{exact:true}).waitFor({timeout:16_000});assert.match(await page.locator('#googleSearchState').textContent(),/open Google Images to complete any provider challenge/i);
      await page.locator('#googleQuery').fill('thumbnail failure');await page.locator('#googleSearch').click();await page.waitForFunction(()=>document.querySelector('.google-image-result img')?.src.includes('/image-0.png'));assert.equal(await page.locator('.google-image-result img').first().evaluate(image=>image.complete&&image.naturalWidth>0),true);
      await page.locator('#googleQuery').fill('late project result');await page.locator('#googleSearch').click();const project=await page.locator('.document-tab.active').getAttribute('data-doc');await page.locator('#libraryButton').click();await page.locator('#libraryNew').click();await page.waitForFunction(previous=>document.querySelector('.document-tab.active')?.dataset.doc!==previous,project);await page.waitForTimeout(250);await page.locator('#imagesTab').click();assert.equal(await page.locator('.google-image-result').count(),0);
      const popupPromise=context.waitForEvent('page');await page.locator('#popoutResearch').click();const popup=await popupPromise;await popup.waitForFunction(()=>document.body.dataset.ready==='true');assert.match(popup.url(),/\/research\?session=.*&tab=images/);await popup.locator('#imagesTab').click();await popup.locator('#googleQuery').fill('COBE MANSION');await popup.locator('#googleSearch').click();await popup.locator('.google-image-result').first().waitFor();await popup.screenshot({path:`${directory}/research-popout.png`,fullPage:true});await popup.close();
    }
    assert.deepEqual(errors,[]);
    evidence.push({width,height,columns,cspUnsafeEval:false,images:4,errors});
    await context.close();
  }
  await writeFile(`${directory}/checks.json`,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({directory,evidence}));
}finally{await browser.close();}
