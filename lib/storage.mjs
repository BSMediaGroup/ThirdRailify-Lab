import { LabError, imageType, imageDimensions } from './core.mjs';
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2,'0')).join(''); }
export function dbOf(env) { if (!env.LAB_DB?.prepare || !env.LAB_FILES?.get) throw new LabError('Private storage is unavailable.',503,'storage_unavailable'); return env.LAB_DB; }
export async function ready(env) { const db=dbOf(env); const schema=await db.prepare('SELECT version FROM lab_schema WHERE version>=2').first(); if(!schema) throw new LabError('Workshop schema is unavailable.',503,'schema_unavailable'); return db; }
export async function project(env, owner, projectId) { const row=await dbOf(env).prepare('SELECT * FROM projects WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(projectId,owner).first(); if(!row)throw new LabError('Project not found.',404,'project_not_found'); return row; }
export function projectView(row) { return {id:row.id,name:row.name,project:JSON.parse(row.body),revision:row.revision,updatedAt:row.updated_at}; }
export async function file(env, owner, fileId) { const row=await dbOf(env).prepare("SELECT f.* FROM files f WHERE f.id=? AND f.owner_id=? AND f.status='ready'").bind(fileId,owner).first(); if(!row)throw new LabError('File not found.',404,'file_not_found'); return row; }
export async function bytesFor(env,owner,fileId) {const row=await file(env,owner,fileId), obj=await env.LAB_FILES.get(row.object_key);if(!obj)throw new LabError('Stored original is unavailable.',503);return {...JSON.parse(row.metadata),bytes:Buffer.from(await obj.arrayBuffer())};}
export function references(value) {
  const found=new Set(); let visits=0;
  function walk(v,key='',depth=0) { if(depth>25||++visits>40000)throw new LabError('Project structure is too complex.');
    if(typeof v==='string') { const match=v.match(/^\/(?:assets|attachments)\/([a-f0-9-]{36}(?:\.(?:png|jpg|webp))?)$/);if(match)found.add(match[1]); if(['assetId'].includes(key)&&v)found.add(v); }
    else if(Array.isArray(v)){for(const x of v){if(key==='attachments'&&typeof x==='string'&&!x.startsWith('stock:'))found.add(x);else walk(x,key,depth+1);}}
    else if(v&&typeof v==='object')for(const [k,x]of Object.entries(v))walk(x,k,depth+1);
  } walk(value); return [...found];
}
export async function validateReferences(env,owner,value) {const refs=references(value);if(refs.length>160)throw new LabError('Too many project attachments.');for(const ref of refs)await file(env,owner,ref);return refs;}
export async function materialize(env,owner,value,depth=0,budget={bytes:0}) {
  if(depth>20)throw new LabError('Input nesting is too deep.');
  if(typeof value==='string'&&/^\/(?:assets|attachments)\//.test(value)){
    const ref=value.split('/').at(-1),row=await file(env,owner,ref),meta=JSON.parse(row.metadata);budget.bytes+=meta.bytes;
    if(budget.bytes>16*1024*1024)throw new LabError('Image references exceed the 16 MB combined request limit.',413);
    const a=await bytesFor(env,owner,ref);if(!a.mime.startsWith('image/'))throw new LabError('Model image input requires an image.');return `data:${a.mime};base64,${a.bytes.toString('base64')}`;
  }
  if(Array.isArray(value)){const out=[];for(const v of value)out.push(await materialize(env,owner,v,depth+1,budget));return out;}
  if(value&&typeof value==='object'){const out={};for(const[k,v]of Object.entries(value))out[k]=await materialize(env,owner,v,depth+1,budget);return out;}
  if(typeof value==='string'&&/^https?:|^data:/i.test(value))throw new LabError('Upload reference files to this private project before submission.',400,'remote_input_denied');return value;
}
export async function storeFile(env,owner,projectId,bytes,metadata={},fixedId=null) {
  if(bytes.length>32*1024*1024)throw new LabError('File exceeds 32 MB.',413);
  if(projectId)await project(env,owner,projectId);
  const type=metadata.kind&&metadata.kind!=='image'?{mime:metadata.mime,ext:''}:imageType(bytes);
  const fileId=fixedId||id()+(type.ext?'.'+type.ext:''), objectKey=`private/${owner}/${fileId}`;
  const dimensions=type.ext?imageDimensions(bytes):null;
  const meta={...metadata,...(dimensions||{}),id:fileId,mime:type.mime,bytes:bytes.length,url:(metadata.kind&&metadata.kind!=='image'?'/attachments/':'/assets/')+fileId,createdAt:now()};
  const db=dbOf(env);
  await db.prepare("INSERT INTO files(id,owner_id,project_id,object_key,metadata,status,created_at) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(id) DO NOTHING").bind(fileId,owner,projectId||null,objectKey,JSON.stringify(meta),now()).run();
  await env.LAB_FILES.put(objectKey,new Uint8Array(bytes).buffer,{httpMetadata:{contentType:type.mime}});
  const updated=await db.prepare("UPDATE files SET status='ready' WHERE id=? AND owner_id=? AND status='pending' AND (project_id IS NULL OR EXISTS(SELECT 1 FROM projects WHERE id=files.project_id AND deleted_at IS NULL))").bind(fileId,owner).run();
  if(!updated.meta.changes) {const existing=await db.prepare("SELECT status FROM files WHERE id=? AND owner_id=?").bind(fileId,owner).first();if(existing?.status!=='ready'){await env.LAB_FILES.delete(objectKey);throw new LabError('Project was deleted during import.',409);}}
  return meta;
}
export async function rate(env,subject,category) {
  const limits={read:600,upload:40,discovery:80,image:12,chat:30,auth:30,settings:30,image_search:20,image_thumbnail:160,image_import:12,stock_search:30,stock_import:12,usage:60};const limit=limits[category];if(!limit)throw new Error('Unknown rate category');const window=Math.floor(Date.now()/60000);
  const row=await dbOf(env).prepare('INSERT INTO rate_limits(subject,category,window,count) VALUES(?,?,?,1) ON CONFLICT(subject,category,window) DO UPDATE SET count=count+1 RETURNING count').bind(subject,category,window).first();
  if(row.count>limit)throw new LabError('Request limit reached. Try again in a minute.',429,'rate_limited');
}
export async function readBody(request,max=1024*1024) {if(!request.headers.get('content-type')?.startsWith('application/json'))throw new LabError('JSON required.',415);const chunks=[];let n=0;for await(const c of request.body||[]){n+=c.length;if(n>max)throw new LabError('Request is too large.',413);chunks.push(Buffer.from(c));}try{const b=JSON.parse(Buffer.concat(chunks).toString());if(!b||Array.isArray(b)||typeof b!=='object')throw 0;return b;}catch{throw new LabError('Invalid JSON.');}}
