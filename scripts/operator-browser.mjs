import {chromium} from '../../ThirdRailify-Admin/node_modules/playwright-core/index.mjs';
import {mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline';
const directory='X:/GIT/ThirdRailify-Lab/.artifacts/live';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();await page.goto('https://lab.thirdrailify.com/login');
console.log('Operator Chrome opened on the real Lab login route. Sign in normally; no existing cookies/profile were copied.');
const lines=createInterface({input:process.stdin,terminal:false});
for await(const line of lines){try{
 if(line==='status')console.log(JSON.stringify({pages:await Promise.all(context.pages().map(async p=>({url:p.url(),title:await p.title(),headings:await p.locator('h1,h2').allTextContents()})))}));
 if(line==='capture'){for(const[i,p]of context.pages().entries())await p.screenshot({path:directory+'/operator-'+i+'.png',fullPage:true});console.log('Captured current pages.');}
 if(line==='accept'){const {acceptance}=await import('./live-acceptance.mjs?'+Date.now());await acceptance({browser,context,page,directory});}
 if(line==='close')break;
}catch(e){console.log('Operator step failed: '+e.message);}}
await browser.close();
