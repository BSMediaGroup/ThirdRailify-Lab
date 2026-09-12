import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs';

const origin='http://127.0.0.1:8798';
const directory='X:/GIT/ThirdRailify-Lab/.artifacts/browser/connections-disclosures-'+Date.now();
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
  for(const [width,height] of [[1440,900],[390,844]]){
    const context=await browser.newContext({viewport:{width,height}});
    await context.addCookies([{name:'thirdrailify_session',value:'local-browser-fixture-token-12345678901234567890',url:origin,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});
    await page.goto(origin);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    await page.locator('#connections').click();
    const summaries=page.locator('.key-profile-scaffold > summary, .settings-models > summary');
    assert.equal(await summaries.count(),7);
    assert.equal(await summaries.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node,'::after').content==='none')),true);
    await page.screenshot({path:`${directory}/collapsed-${width}.png`});
    const profiles=page.locator('.key-profile-scaffold > summary').first();
    await profiles.click();
    await page.waitForTimeout(250);
    assert.match(await profiles.locator('.disclosure-chevron .icon').evaluate(node=>getComputedStyle(node).transform),/matrix\(0, 1, -1, 0/);
    await page.locator('#settingsDialog .dialog-body').evaluate(node=>node.scrollTop=node.scrollHeight);
    const models=page.locator('.settings-models > summary');
    await models.click();
    await page.waitForFunction(()=>document.querySelector('.settings-models')?.open===true);
    await page.waitForFunction(()=>document.querySelector('.settings-models > summary')?.getAttribute('aria-expanded')==='true');
    assert.equal(await models.getAttribute('aria-expanded'),'true');
    await page.screenshot({path:`${directory}/expanded-${width}.png`});
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log(directory);
}finally{await browser.close();}
