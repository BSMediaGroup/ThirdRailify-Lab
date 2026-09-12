// Local fixtures only. Not part of the allowlisted release or production auth.
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const origin='http://127.0.0.1:8798';
const account={id:'local-browser-fixture',displayName:'Workshop Test',role:'admin',adminLevel:'master',status:'active',avatarUrl:null};
const csrf='local-browser-fixture-csrf',token='local-browser-fixture-token-12345678901234567890';
const hash=s=>createHash('sha256').update(s).digest('base64url');
const mime=p=>p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':p.includes('/brand-fonts/')?'font/ttf':'text/html';
const manifest=JSON.parse(await readFile(new URL('../build-assets.json',import.meta.url),'utf8'));
const allowed=new Set([...Object.values(manifest),'lab.css']);
const mf=new Miniflare({host:'127.0.0.1',port:8798,modules:true,scriptPath:new URL('../.artifacts/functions-build/index.js',import.meta.url).pathname.slice(1),compatibilityDate:'2026-09-12',compatibilityFlags:['nodejs_compat'],d1Databases:['LAB_DB','THIRDRAILIFY_AUTH_DB'],r2Buckets:['LAB_FILES'],bindings:{LAB_ENABLED:'true',LAB_PAID_ENABLED:'false',LAB_ORIGIN:origin,THIRDRAILIFY_ADMIN_ORIGIN:'https://admin.thirdrailify.com'},
 serviceBindings:{ASSETS:async request=>{let path=new URL(request.url).pathname.slice(1);if(!path||path==='research')path='index.html';if(!allowed.has(path))return new Response('Not found',{status:404});return new Response(await readFile(new URL('../dist/'+path,import.meta.url)),{headers:{'Content-Type':mime('/'+path)}});}},
 outboundService:async request=>{if(request.url==='https://admin.thirdrailify.com/api/workshop/session')return Response.json({ok:true,authenticated:true,account,csrfToken:csrf,workshop:{allowed:true,source:'local_test_fixture',canManageAccess:true,canManageProviders:true}});return Response.json({error:{message:'External providers are disabled in this local fixture.'}},{status:503});},
});
const env=await mf.getBindings();
async function migration(db,url){let part='';for(const line of (await readFile(url,'utf8')).replace(/^--.*$/gm,'').split(/\r?\n/)){part+=line+'\n';if(line.trim().endsWith(';')){await db.prepare(part).run();part='';}}}
await migration(env.LAB_DB,new URL('../migrations/0001_lab.sql',import.meta.url));
for(const name of ['0001_auth_foundation.sql','0002_full_admin_capability_denials.sql','0003_workshop_access.sql'])await migration(env.THIRDRAILIFY_AUTH_DB,new URL('../../ThirdRailify-Admin/migrations/'+name,import.meta.url));
await env.THIRDRAILIFY_AUTH_DB.prepare("INSERT INTO accounts(id,display_name,role,admin_level,status,created_at,updated_at,source) VALUES(?,'Workshop Test','admin','master','active','2026-01-01','2026-01-01','test')").bind(account.id).run();
await env.THIRDRAILIFY_AUTH_DB.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?)').bind('browser-fixture',account.id,hash(token),hash(csrf),'2026-01-01','2099-01-01','2026-01-01',null,origin,null).run();
console.log('Local Pages runtime ready at '+origin+' (local fixtures, providers disabled).');
process.on('SIGINT',async()=>{await mf.dispose();process.exit(0);});
