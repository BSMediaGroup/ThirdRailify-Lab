import {chromium} from '../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='X:/GIT/ThirdRailify-Lab/.artifacts/browser';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const evidence=[];
try{for(const [width,height]of [[1920,1080],[1440,900],[768,1024],[390,844]]){
 const context=await browser.newContext({viewport:{width,height}});await context.addCookies([{name:'thirdrailify_session',value:'local-browser-fixture-token-12345678901234567890',url:'http://127.0.0.1:8798',httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8798/');await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.locator('#accountTrigger').filter({hasText:'Workshop Test'}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${directory}/studio-${width}.png`,fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page width '+width);
 if(width===1440){await page.locator('#prompt').fill('Controlled private browser acceptance');await page.locator('#saveSession').click();await page.locator('#sessionNameInput').fill('Browser acceptance');await page.locator('#sessionConfirm').click();await page.getByText('Project and research saved to your account.',{exact:true}).waitFor();await page.reload();await page.waitForFunction(()=>document.body.dataset.ready==='true');assert.equal(await page.locator('#prompt').inputValue(),'Controlled private browser acceptance');
 const popupPromise=context.waitForEvent('page');await page.locator('#popoutResearch').click();const popup=await popupPromise;await popup.waitForLoadState();assert.match(popup.url(),/\/research\?session=/);await popup.screenshot({path:`${directory}/research-popout.png`});await popup.close();
 await page.locator('#accountTrigger').click();await page.screenshot({path:`${directory}/account-1440.png`});await page.locator('#accountTrigger').click();await page.locator('#settingsPageButton').click();await page.screenshot({path:`${directory}/settings-1440.png`});}
 evidence.push({width,height,errors:errors.length,horizontalOverflow:false});await context.close();
}await writeFile(directory+'/checks.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}finally{await browser.close();}
