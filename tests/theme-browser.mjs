import {chromium} from '../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
const evidence=[];
for(const forceDark of [false,true]){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:forceDark?['--enable-features=WebContentsForceDark']:[]});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addCookies([{name:'thirdrailify_session',value:'local-browser-fixture-token-12345678901234567890',url:'http://127.0.0.1:8798',httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();await page.goto('http://127.0.0.1:8798');await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.evaluate(()=>document.fonts.ready);
  await page.locator('#accountTrigger').click();await page.waitForTimeout(250);
  for(const only of [false,true]){
   if(only)await page.addStyleTag({content:':root{color-scheme:only dark}'});
   const name=`theme-${forceDark?'auto':'normal'}-${only?'only':'before'}`;
   await page.screenshot({path:'.artifacts/browser/'+name+'.png'});
   evidence.push({name,...await page.evaluate(()=>({scheme:getComputedStyle(document.documentElement).colorScheme,logo:getComputedStyle(document.querySelector('#brandMark'),'::before').backgroundImage,border:getComputedStyle(document.querySelector('.stage-shell')).borderColor,logout:getComputedStyle(document.querySelector('#accountLogout')).color}))});
  }
 }finally{await browser.close();}
}
await writeFile('.artifacts/browser/theme-checks.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
