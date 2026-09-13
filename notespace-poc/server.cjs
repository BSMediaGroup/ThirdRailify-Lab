'use strict';
// Read-only loopback launcher. No npm dependencies, remote requests, auth bypass or Cloudflare calls.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.join(__dirname,'public');
const PORT=Number(process.env.NOTESPACE_PORT||4321);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('NOTESPACE_PORT must be an integer between 1024 and 65535.');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.gif':'image/gif','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.ico':'image/x-icon'};
const localAssets=new Map();
// Reference existing user-owned brand files in place. They are not copied or redistributed.
const brandRoots=[process.env.NOTESPACE_BRAND_ROOT,path.dirname(__dirname),path.dirname(path.dirname(__dirname)),process.platform==='win32'?'X:\\GIT\\ThirdRailify-Lab':null].filter(Boolean);
function walk(dir,depth=0){if(depth>4)return[];let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return[];}return list.flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name),depth+1):[path.join(dir,x.name)]);}
let available=[];for(const root of brandRoots){for(const sub of ['assets','public/assets','poc/assets'])available.push(...walk(path.join(root,sub)));}
const picks=[['headings',/^American Captain\.(ttf|otf)$/i],['body',/^Blinker-Regular\.(ttf|otf)$/i],['mono',/^GeistMono.*\.(ttf|otf|woff2)$/i],['motif',/^labs0\.svg$/i]];
for(const [key,regex]of picks){const found=available.find(p=>regex.test(path.basename(p)));if(found)localAssets.set(key,{path:found,type:MIME[path.extname(found).toLowerCase()]});}
let brandCSS='/* Existing local branding only; no bundled font files. */\n';
for(const [key,font]of [['headings','American Captain'],['body','Blinker'],['mono','Geist Mono']])if(localAssets.has(key))brandCSS+=`@font-face{font-family:'${font}';src:url('/local-assets/${key}');font-display:swap;}\n`;
if(localAssets.has('motif'))brandCSS+=".brand-mark{position:relative}.brand-mark>svg{visibility:hidden}.brand-mark:after{content:'';position:absolute;inset:8px;background:linear-gradient(135deg,#fff0b5,#d5a643);mask:url('/local-assets/motif') center/contain no-repeat;-webkit-mask:url('/local-assets/motif') center/contain no-repeat;}\n";
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' data: blob: https://api.giphy.com https://*.giphy.com https://tenor.googleapis.com; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
function send(res,status,body,type='text/plain; charset=utf-8',method='GET'){res.writeHead(status,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':CSP});res.end(method==='HEAD'?undefined:body);}
const server=http.createServer(async(req,res)=>{try{
 const allowed=new Set([`127.0.0.1:${PORT}`,`localhost:${PORT}`]);if(!allowed.has(req.headers.host))return send(res,403,'Loopback host only.');
 if(!['GET','HEAD'].includes(req.method))return send(res,405,'This local launcher only serves files.');
 const u=new URL(req.url,`http://127.0.0.1:${PORT}`);
 if(u.pathname==='/health.json')return send(res,200,JSON.stringify({app:'thirdrailify-notespace-poc',version:'0.1.0',cloudflare:false,localFonts:[...localAssets.keys()].filter(k=>k!=='motif')}),'application/json',req.method);
 if(u.pathname==='/local-brand.css')return send(res,200,brandCSS,'text/css; charset=utf-8',req.method);
 if(u.pathname.startsWith('/local-assets/')){const key=u.pathname.slice('/local-assets/'.length),item=localAssets.get(key);if(!item)return send(res,404,'Local asset not found.');return send(res,200,fs.readFileSync(item.path),item.type,req.method);}
 let pathname=decodeURIComponent(u.pathname);if(pathname==='/'||/^\/notespace\/[a-zA-Z0-9]{7}\/?$/.test(pathname))pathname='/index.html';
 const target=path.resolve(ROOT,'.'+pathname);if(!target.startsWith(ROOT+path.sep)||pathname.split('/').some(x=>x.startsWith('.')))return send(res,403,'Not available.');
 if(!['.html','.css','.js','.svg','.gif','.png','.jpg','.ico'].includes(path.extname(target)))return send(res,404,'Not available.');
 const stat=await fs.promises.stat(target);if(!stat.isFile())return send(res,404,'Not found.');const body=await fs.promises.readFile(target);send(res,200,body,MIME[path.extname(target)],req.method);
 }catch(err){send(res,err.code==='ENOENT'?404:400,'The local file could not be served.');}});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`Port ${PORT} is already in use. Close your earlier Notespace launcher, or set NOTESPACE_PORT to another port. No existing process was stopped.`:err.message);process.exitCode=1;});
server.listen(PORT,'127.0.0.1',()=>{const url=`http://127.0.0.1:${PORT}`;console.log(`\nTHIRD RAILIFY NOTESPACE · LOCAL POC 0.1.0\n\nOpen: ${url}\n\nNo Cloudflare, D1, Lab login or paid API is used.\nBoards and uploads autosave in this browser's local IndexedDB.\nUse Export to keep a portable backup.\nKeep this window open. Ctrl+C stops only this local server.\n`);if(localAssets.size)console.log('Local branding detected: '+[...localAssets.keys()].join(', '));if(process.argv.includes('--open')){const child=process.platform==='win32'?spawn('cmd.exe',['/c','start','',url],{stdio:'ignore',windowsHide:true}):process.platform==='darwin'?spawn('open',[url],{stdio:'ignore'}):spawn('xdg-open',[url],{stdio:'ignore'});child.on('error',()=>console.log('Open the local address manually in your browser.'));child.unref();}});
