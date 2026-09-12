import {chromium} from '../../ThirdRailify/node_modules/playwright-core/index.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory=`X:/GIT/ThirdRailify-Lab/.artifacts/browser/admin-toasts-${Date.now()}`;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:process.env.LAB_BROWSER_HEADED!=='1'});
const evidence=[];
try{
  for(const [width,height] of [[1440,900],[390,844]]){
    const context=await browser.newContext({viewport:{width,height}});
    await context.addCookies([{name:'thirdrailify_session',value:'local-browser-fixture-token-12345678901234567890',url:'http://127.0.0.1:8798',httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});
    await page.goto('http://127.0.0.1:8798/');
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    await page.locator('#saveSession').click();
    await page.locator('#sessionNameInput').fill(`Toast acceptance ${width}`);
    await page.locator('#sessionConfirm').click();
    const success=page.locator('.admin-toast--success').filter({hasText:'Project and research saved to your account.'});
    await success.waitFor();
    await page.waitForTimeout(300);
    assert.equal(await success.locator('.admin-toast__copy strong').textContent(),'Update complete');
    assert.equal(await success.locator('.admin-toast__icon use').getAttribute('href'),'/icons.svg#shield');
    const successGeometry=await success.evaluate(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return {top:box.top,right:document.documentElement.clientWidth-box.right,width:box.width,border:style.borderColor,position:getComputedStyle(element.parentElement).position,overflow:box.left<0||box.right>innerWidth};});
    assert.equal(successGeometry.position,'fixed');assert.equal(successGeometry.overflow,false);assert.ok(successGeometry.top>=76&&successGeometry.top<=79);assert.match(successGeometry.border,/114, 215, 165/);
    await page.screenshot({path:`${directory}/success-${width}.png`});
    await success.getByRole('button',{name:'Dismiss notification'}).click();
    await success.waitFor({state:'detached'});
    if(width<=1000){await page.locator('#researchVisibility').evaluate(element=>{element.style.display='flex';});await page.locator('#researchVisibility').click();}
    await page.locator('#imagesTab').click();
    await page.locator('#googleQuery').fill('x');
    await page.locator('#googleSearch').click();
    const warning=page.locator('.admin-toast--warning').filter({hasText:'Enter at least two characters.'});
    await warning.waitFor();
    await page.waitForTimeout(300);
    assert.equal(await warning.locator('.admin-toast__copy strong').textContent(),'Attention');
    assert.equal(await warning.locator('.admin-toast__icon path').getAttribute('d'),'M5 18h14M8 18l4-14 4 14M9.5 12h5M7 7 4 4M17 7l3-3');
    const warningGeometry=await warning.evaluate(element=>{const box=element.getBoundingClientRect(),style=getComputedStyle(element);return {top:box.top,right:document.documentElement.clientWidth-box.right,width:box.width,border:style.borderColor,overflow:box.left<0||box.right>innerWidth};});
    console.log(JSON.stringify({width,successGeometry,warningGeometry}));
    assert.equal(warningGeometry.overflow,false);assert.ok(warningGeometry.top>=76&&warningGeometry.top<=79);assert.match(warningGeometry.border,/243, 201, 40/);
    if(width===390){assert.ok(Math.abs(warningGeometry.right-12)<1);assert.ok(Math.abs(warningGeometry.width-366)<1);}
    await page.screenshot({path:`${directory}/warning-${width}.png`});
    await page.keyboard.press('Escape');await warning.waitFor({state:'detached'});
    assert.equal(errors.length,0,errors.join('\n'));
    evidence.push({width,height,successGeometry,warningGeometry,consoleErrors:errors});
    await context.close();
  }
  await writeFile(`${directory}/checks.json`,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({directory,evidence}));
}finally{await browser.close();}
