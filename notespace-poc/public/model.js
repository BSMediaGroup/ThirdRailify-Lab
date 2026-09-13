/* Notespace document primitives. No remote services or database dependencies. */
(function(root){
'use strict';
const TYPES=new Set(['note','text','checklist','frame','media','shape','drawing']);
const clone=v=>JSON.parse(JSON.stringify(v));
const id=()=>{if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();const a=new Uint8Array(16);globalThis.crypto.getRandomValues(a);a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const h=[...a].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
function slug(){const chars='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';let out='';while(out.length<7){const a=new Uint8Array(12);globalThis.crypto.getRandomValues(a);for(const v of a){if(v<248)out+=chars[v%62];if(out.length===7)break;}}return out;}
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const cleanText=(v,n=10000)=>String(v??'').slice(0,n);
const color=(v,f='#9a85b8')=>/^#[0-9a-f]{6}$/i.test(v||'')?v:f;
function node(type,extra={}){return {id:id(),type,x:0,y:0,w:260,h:210,parentId:null,title:'',text:'',tags:[],fields:[],owner:'',tint:'#a18cc9',fill:'#2a2433',ink:'#ece6f3',locked:false,createdAt:Date.now(),...extra};}
function board(title='Untitled notespace'){return {schemaVersion:1,id:slug(),title,description:'',createdAt:Date.now(),updatedAt:Date.now(),revision:0,background:{color:'#131415',pattern:'dots',mode:'solid',gradientEnd:'#211c2a',angle:135,imageId:null,opacity:0.25},objects:[],edges:[]};}
function index(b){return new Map(b.objects.map(n=>[n.id,n]));}
function worldPosition(n,map,seen=new Set()){if(!n||seen.has(n.id))return{x:0,y:0};seen.add(n.id);const p=n.parentId?map.get(n.parentId):null;const q=p?worldPosition(p,map,seen):{x:0,y:0};return{x:q.x+n.x,y:q.y+n.y};}
function descendants(b,ids){const s=new Set(ids);let changed=true;while(changed){changed=false;for(const n of b.objects)if(n.parentId&&s.has(n.parentId)&&!s.has(n.id)){s.add(n.id);changed=true;}}return s;}
function canParent(b,nodeId,parentId){if(!parentId)return true;const p=b.objects.find(n=>n.id===parentId);return p?.type==='frame'&&nodeId!==parentId&&!descendants(b,[nodeId]).has(parentId);}
function reparent(b,nodeId,parentId){if(!canParent(b,nodeId,parentId))return false;const map=index(b),n=map.get(nodeId);if(!n)return false;const a=worldPosition(n,map),p=parentId?worldPosition(map.get(parentId),map):{x:0,y:0};n.parentId=parentId||null;n.x=a.x-p.x;n.y=a.y-p.y;return true;}
function bounds(b,ids=null){const map=index(b);const nodes=ids?b.objects.filter(n=>ids.has(n.id)):b.objects;let x=Infinity,y=Infinity,r=-Infinity,d=-Infinity;for(const n of nodes){const p=worldPosition(n,map);x=Math.min(x,p.x);y=Math.min(y,p.y);r=Math.max(r,p.x+n.w);d=Math.max(d,p.y+n.h);}return Number.isFinite(x)?{x,y,w:Math.max(1,r-x),h:Math.max(1,d-y)}:{x:0,y:0,w:1100,h:700};}
function group(b,ids){const roots=b.objects.filter(n=>ids.has(n.id)&&!ids.has(n.parentId));if(!roots.length)return null;const box=bounds(b,new Set(roots.map(n=>n.id)));const f=node('frame',{title:'New collection',x:box.x-24,y:box.y-65,w:box.w+48,h:box.h+90,fill:'#19171e'});b.objects.push(f);for(const n of roots)reparent(b,n.id,f.id);return f;}
function remove(b,ids){const s=descendants(b,ids);b.objects=b.objects.filter(n=>!s.has(n.id));b.edges=b.edges.filter(e=>!s.has(e.from.nodeId)&&!s.has(e.to.nodeId));}
function ungroup(b,fid){const f=b.objects.find(n=>n.id===fid);if(f?.type!=='frame')return;const children=b.objects.filter(n=>n.parentId===fid);for(const n of children)reparent(b,n.id,f.parentId);b.objects=b.objects.filter(n=>n.id!==fid);b.edges=b.edges.filter(e=>e.from.nodeId!==fid&&e.to.nodeId!==fid);}
function search(b,q){q=String(q).trim().toLowerCase();if(!q)return[];return b.objects.filter(n=>[n.title,n.text,n.owner,...n.tags,...(n.items||[]).flatMap(i=>[i.text,i.owner]),...n.fields.flatMap(f=>[f.key,String(f.value)])].join(' ').toLowerCase().includes(q));}
function safeURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||value.length>4096)return null;const h=u.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h==='[::1]'||h.startsWith('[fc')||h.startsWith('[fd')||h.startsWith('[fe80')||/^(0|10|127|169\.254|192\.168)\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h))return null;return u.href;}catch{return null;}}
function validate(raw){
 if(!raw||raw.schemaVersion!==1||!Array.isArray(raw.objects)||!Array.isArray(raw.edges))throw Error('Not a Notespace version 1 board.');
 if(raw.objects.length>1500||raw.edges.length>2000)throw Error('This POC supports 1,500 objects and 2,000 connections per board.');
 const b=board(cleanText(raw.title,150));b.id=/^[A-Za-z0-9]{7}$/.test(raw.id)?raw.id:slug();b.description=cleanText(raw.description,2000);b.createdAt=finite(raw.createdAt,Date.now());b.updatedAt=Date.now();
 const bg=raw.background||{};b.background={color:color(bg.color,'#131415'),mode:['solid','gradient','image'].includes(bg.mode)?bg.mode:'solid',pattern:['dots','grid','lines','none'].includes(bg.pattern)?bg.pattern:'dots',gradientEnd:color(bg.gradientEnd,'#211c2a'),angle:Math.max(0,Math.min(360,finite(bg.angle,135))),imageId:typeof bg.imageId==='string'?bg.imageId:null,opacity:Math.max(0,Math.min(1,finite(bg.opacity,.25)))};
 const seen=new Set();
 for(const o of raw.objects){if(!o||!TYPES.has(o.type)||typeof o.id!=='string'||o.id.length>100||seen.has(o.id))throw Error('The board contains an invalid or duplicate object.');seen.add(o.id);
  const n=node(o.type,{id:o.id,title:cleanText(o.title,500),text:cleanText(o.text),x:Math.max(-100000,Math.min(100000,finite(o.x))),y:Math.max(-100000,Math.min(100000,finite(o.y))),w:Math.max(40,Math.min(10000,finite(o.w,260))),h:Math.max(30,Math.min(10000,finite(o.h,210))),parentId:typeof o.parentId==='string'?o.parentId:null,owner:cleanText(o.owner,80),tint:color(o.tint),fill:color(o.fill,'#2a2433'),ink:color(o.ink,'#ece6f3'),locked:!!o.locked,tags:Array.isArray(o.tags)?o.tags.slice(0,30).map(x=>cleanText(x,80)):[],fields:[]});
  if(Array.isArray(o.fields))n.fields=o.fields.slice(0,40).filter(f=>f&&['text','number','boolean','date','url','reference'].includes(f.type)).map(f=>({key:cleanText(f.key,80),type:f.type,value:f.type==='number'?finite(f.value):f.type==='boolean'?!!f.value:cleanText(f.value,2000)}));
  if(o.type==='checklist')n.items=(Array.isArray(o.items)?o.items:[]).slice(0,100).map(t=>({id:typeof t.id==='string'?t.id:id(),text:cleanText(t.text,500),done:!!t.done,owner:cleanText(t.owner,80),due:cleanText(t.due,40)}));
  if(o.type==='media'){n.assetId=typeof o.assetId==='string'?o.assetId:null;n.url=safeURL(o.url);n.provider=['giphy','tenor'].includes(o.provider)?o.provider:null;n.providerId=cleanText(o.providerId,100);n.source=safeURL(o.source);n.fileName=cleanText(o.fileName,250);n.mime=cleanText(o.mime,80);n.fit=o.fit==='cover'?'cover':'contain';}
  if(o.type==='frame')n.clip=!!o.clip;
  if(o.type==='shape')n.shape=o.shape==='ellipse'?'ellipse':'rect';
  if(o.type==='text')n.fontSize=Math.max(12,Math.min(140,finite(o.fontSize,44)));
  if(o.type==='drawing'){n.points=(Array.isArray(o.points)?o.points:[]).slice(0,10000).map(p=>[finite(p[0]),finite(p[1])]);n.strokeWidth=Math.max(1,Math.min(30,finite(o.strokeWidth,3)));}
  b.objects.push(n);
 }
 for(const n of b.objects)if(!canParent(b,n.id,n.parentId))throw Error('Invalid container hierarchy (cycle or missing parent).');
 const endpoint=e=>e&&typeof e.nodeId==='string'&&seen.has(e.nodeId)?{nodeId:e.nodeId}:{x:finite(e?.x),y:finite(e?.y)};
 const edgeIds=new Set();for(const e of raw.edges){if(!e||typeof e.id!=='string'||edgeIds.has(e.id))throw Error('Invalid connector.');edgeIds.add(e.id);b.edges.push({id:e.id,from:endpoint(e.from),to:endpoint(e.to),label:cleanText(e.label,150),color:color(e.color,'#ab92cb'),style:['curve','straight','elbow'].includes(e.style)?e.style:'curve',arrow:e.arrow!==false});}
 return b;
}
function diff(before,after){const changes={meta:{},upserts:[],deletes:[],edges:null,order:null};for(const k of ['title','description','background'])if(JSON.stringify(before[k])!==JSON.stringify(after[k]))changes.meta[k]=clone(after[k]);const old=index(before),now=index(after);for(const n of after.objects){const was=old.get(n.id);if(!was){changes.upserts.push({id:n.id,create:clone(n)});continue;}const patch={};for(const k of new Set([...Object.keys(was),...Object.keys(n)]))if(JSON.stringify(was[k])!==JSON.stringify(n[k]))patch[k]=n[k]===undefined?null:clone(n[k]);if(Object.keys(patch).length)changes.upserts.push({id:n.id,patch});}for(const n of before.objects)if(!now.has(n.id))changes.deletes.push(n.id);if(JSON.stringify(before.edges)!==JSON.stringify(after.edges))changes.edges=clone(after.edges);if(JSON.stringify(before.objects.map(n=>n.id))!==JSON.stringify(after.objects.map(n=>n.id)))changes.order=after.objects.map(n=>n.id);return changes;}
function apply(b,change){Object.assign(b,change.meta);for(const item of change.upserts){const n=b.objects.find(x=>x.id===item.id);if(item.create){if(!n)b.objects.push(clone(item.create));}else if(n)Object.assign(n,item.patch);}if(change.deletes.length)remove(b,change.deletes);if(change.edges)b.edges=clone(change.edges);if(change.order){const ranks=new Map(change.order.map((id,i)=>[id,i]));b.objects.sort((a,c)=>(ranks.get(a.id)??999999)-(ranks.get(c.id)??999999));}b.updatedAt=Date.now();b.revision=(b.revision||0)+1;return b;}
root.NSModel={clone,id,slug,node,board,index,worldPosition,descendants,canParent,reparent,bounds,group,ungroup,remove,search,validate,safeURL,diff,apply,color};
if(typeof module!=='undefined'&&module.exports)module.exports=root.NSModel;
})(typeof window!=='undefined'?window:globalThis);
