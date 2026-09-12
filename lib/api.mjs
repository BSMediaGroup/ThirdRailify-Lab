import { LabError, CATALOG, SECRET_KEYS, decodeImage, sanitize } from './core.mjs';
import { Providers } from './providers.mjs';
import { ModelCatalog } from './models.mjs';
import { normalizeProfile, profileKey, validateAttachment } from './research.mjs';
import { dbOf, now, id, project, projectView, file, bytesFor, storeFile, validateReferences, readBody, rate } from './storage.mjs';
import { enqueue, jobView, jobAction } from './jobs.mjs';
import { streamResearch } from './stream.mjs';
const json = x => Response.json({ok:true,...x});
export async function apiRoute(env, request, auth, context) {
  const url=new URL(request.url),path=url.pathname,owner=auth.owner,db=dbOf(env),provider=new Providers(()=>env),method=request.method;
  await rate(env,owner,method==='GET'?'read':path.includes('generate')?'image':path==='/api/chat'?'chat':/import|export|attachments/.test(path)?'upload':'settings');
  if(/^\/(assets|attachments)\//.test(path)) {
    if(!['GET','HEAD'].includes(method))throw new LabError('Method not allowed.',405);
    const row=await file(env,owner,path.split('/').at(-1)),meta=JSON.parse(row.metadata),object=await env.LAB_FILES.get(row.object_key);
    if(!object)throw new LabError('Stored file is unavailable.',503);
    return new Response(method==='HEAD'?null:object.body,{headers:{'Content-Type':meta.mime,'Content-Length':String(object.size),'Content-Disposition':`${url.searchParams.has('download')||!meta.mime.startsWith('image/')?'attachment':'inline'}; filename="${String(meta.name||meta.id).replace(/[^\w. -]/g,'_')}"`}});
  }
  const preferencesRow=await db.prepare('SELECT * FROM preferences WHERE owner_id=?').bind(owner).first();const preferences=preferencesRow?JSON.parse(preferencesRow.body):{};
  async function config(){const rows=await db.prepare('SELECT * FROM provider_status').all();return {keys:Object.fromEntries(SECRET_KEYS.map(k=>[k,Boolean(env[k])])),models:preferences.models||{},fonts:['display','body','bodybold','mono'],brand:{logo:true,logoSource:'assets/logos/labs0.svg',fonts:{display:'American Captain'},providers:{replicate:true,openai:true,xai:true}},keyTests:Object.fromEntries(rows.results.map(r=>[r.provider,{status:r.state,at:r.checked_at}])),version:'0.4.0',localOnly:false,webhooks:Boolean(env.REPLICATE_WEBHOOK_SIGNING_SECRET),canManageProviders:auth.policy.canManageProviders};}
  if(method==='GET'&&path==='/api/state') {
    const [projects,files,jobs]=await Promise.all([db.prepare('SELECT id,name,revision,updated_at FROM projects WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200').bind(owner).all(),db.prepare("SELECT f.* FROM files f WHERE owner_id=? AND status='ready' ORDER BY created_at DESC LIMIT 500").bind(owner).all(),db.prepare('SELECT * FROM jobs WHERE owner_id=? AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM projects WHERE id=jobs.project_id AND deleted_at IS NULL) ORDER BY created_at DESC LIMIT 100').bind(owner).all()]);
    const items=files.results.map(r=>JSON.parse(r.metadata));return json({accountId:owner,config:await config(),projects:projects.results.map(p=>({id:p.id,name:p.name,revision:p.revision,updatedAt:p.updated_at,partial:true})),assets:items.filter(a=>!a.kind||a.kind==='image'),attachments:items.filter(a=>a.kind),jobs:jobs.results.map(jobView),catalog:CATALOG,preferences,preferencesRevision:preferencesRow?.revision||0});
  }
  if(method==='GET'&&/^\/api\/projects\/[a-f0-9-]{36}$/.test(path))return json({project:projectView(await project(env,owner,path.split('/').at(-1)))});
  if(method==='GET'&&path==='/api/jobs')return json({jobs:(await db.prepare('SELECT * FROM jobs WHERE owner_id=? AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM projects WHERE id=jobs.project_id AND deleted_at IS NULL) ORDER BY created_at DESC LIMIT 100').bind(owner).all()).results.map(jobView)});
  if(method==='GET'&&['/api/model','/api/models/search','/api/provider-models'].includes(path)) {await rate(env,owner,'discovery');if(path==='/api/model')return json({model:await provider.model(url.searchParams.get('id'))});if(path==='/api/models/search')return json({items:await provider.search(url.searchParams.get('q'))});return json(await new ModelCatalog(provider).list(url.searchParams.get('provider'),url.searchParams.get('kind')));}
  if(method==='GET'&&path==='/api/research/profile')return json({profile:normalizeProfile(url.searchParams.get('defaults')==='1'?{}:preferences.researchProfiles?.[profileKey(url.searchParams.get('provider'),url.searchParams.get('model'))])});
  if(method==='GET'&&path==='/api/research/runs'){await project(env,owner,url.searchParams.get('projectId'));return json({runs:(await db.prepare('SELECT id,provider,model,status,text,metadata,created_at FROM research_runs WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 20').bind(owner,url.searchParams.get('projectId')).all()).results});}
  if(method!=='POST')throw new LabError('API route not found.',404,'not_found');
  const b=await readBody(request,['/api/import','/api/export','/api/attachments'].includes(path)?24*1024*1024:1024*1024);
  if(['owner','ownerId','owner_id','r2Key','object_key'].some(k=>Object.hasOwn(b,k)))throw new LabError('Ownership and storage keys are assigned by the server.',403,'forged_owner');
  if(path==='/api/render-check'){
    if(!auth.policy.canManageProviders)throw new LabError('Not allowed.',403);
    // Temporary release diagnostic: no account, project, URL, cookie or content.
    const colors={};for(const key of ['border','logo','scheme','button'])colors[key]=typeof b[key]==='string'&&/^[a-zA-Z0-9#(),.% -]{1,300}$/.test(b[key])?b[key]:'unavailable';
    console.log(JSON.stringify({event:'lab-render-check-v1',...colors,stylesheet:b.stylesheet===true,darkReader:b.darkReader===true,forcedColors:b.forcedColors===true,late:b.late===true}));return json({});
  }
  if(path==='/api/projects') {
    if(!/^[a-f0-9-]{36}$/.test(b.id||'')||!Number.isSafeInteger(b.revision)||b.revision<0||!b.project||typeof b.project!=='object'||Array.isArray(b.project)||JSON.stringify(b.project).length>900000)throw new LabError('Valid project, ID and revision required.');
    const refs=await validateReferences(env,owner,b.project),name=String(b.name||'Untitled project').trim().slice(0,100),write=id(),timestamp=now();
    const ops=[db.prepare(`INSERT INTO projects(id,owner_id,name,body,revision,write_token,created_at,updated_at) SELECT ?,?,?,?,1,?,?,? WHERE ?=0
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,body=excluded.body,revision=projects.revision+1,write_token=excluded.write_token,updated_at=excluded.updated_at
      WHERE projects.owner_id=? AND projects.revision=? AND projects.deleted_at IS NULL`).bind(b.id,owner,name,JSON.stringify(b.project),write,timestamp,timestamp,b.revision,owner,b.revision)];
    // For updates, INSERT SELECT must still yield a row; the conflict WHERE is the CAS.
    if(b.revision>0)ops[0]=db.prepare('UPDATE projects SET name=?,body=?,revision=revision+1,write_token=?,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL').bind(name,JSON.stringify(b.project),write,timestamp,b.id,owner,b.revision);
    ops.push(db.prepare('DELETE FROM project_files WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)').bind(b.id,b.id,write));
    for(const ref of refs)ops.push(db.prepare('INSERT INTO project_files(project_id,file_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)').bind(b.id,ref,b.id,write));
    const results=await db.batch(ops);if(results[0].meta.changes!==1)throw new LabError('Project changed in another window. Reload before saving.',409,'revision_conflict');return json({project:projectView(await project(env,owner,b.id))});
  }
  const projectAction=path.match(/^\/api\/projects\/([a-f0-9-]{36})\/(rename|delete)$/);
  if(projectAction){const p=await project(env,owner,projectAction[1]);if(b.revision!==p.revision)throw new LabError('Project changed. Reload before saving.',409,'revision_conflict');const write=id();let result;
    if(projectAction[2]==='rename'){const name=String(b.name||'').trim();if(!name||name.length>100)throw new LabError('Use a project name of 1–100 characters.');const body=JSON.parse(p.body);body.name=name;result=await db.prepare('UPDATE projects SET name=?,body=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL').bind(name,JSON.stringify(body),now(),p.id,owner,b.revision).run();}
    else {const r=await db.batch([db.prepare("UPDATE projects SET body='{}',deleted_at=?,revision=revision+1,write_token=? WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL").bind(now(),write,p.id,owner,b.revision),db.prepare('DELETE FROM project_files WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)').bind(p.id,p.id,write),db.prepare("UPDATE jobs SET status='canceled',phase='Project deleted before submission' WHERE project_id=? AND status='queued' AND EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)").bind(p.id,p.id,write),db.prepare("DELETE FROM research_runs WHERE project_id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)").bind(p.id,p.id,write),db.prepare("UPDATE files SET status='deleting' WHERE project_id=? AND status='ready' AND NOT EXISTS(SELECT 1 FROM project_files WHERE file_id=files.id) AND NOT EXISTS(SELECT 1 FROM job_files jf JOIN jobs j ON j.id=jf.job_id WHERE jf.file_id=files.id AND j.status IN ('submitting','processing','import_pending')) AND EXISTS(SELECT 1 FROM projects WHERE id=? AND write_token=?)").bind(p.id,p.id,write)]);result=r[0];}
    if(result.meta.changes!==1)throw new LabError('Project changed. Reload before saving.',409,'revision_conflict');return projectAction[2]==='rename'?json({project:projectView(await project(env,owner,p.id))}):json({message:'Project deleted. In-flight results cannot restore it.'});
  }
  if(['/api/import','/api/export','/api/attachments'].includes(path)){await project(env,owner,b.projectId);const attachment=path==='/api/attachments'?validateAttachment(b):null;const bytes=attachment?.bytes||decodeImage(b.dataUrl);const meta=attachment?{name:attachment.name,mime:attachment.mime,kind:attachment.kind}:{source:path==='/api/export'?'thumbnail':'import',title:String(b.title||'Untitled').slice(0,160)};const saved=await storeFile(env,owner,b.projectId,bytes,meta);return json(attachment?{attachment:saved}:{asset:saved});}
  if(path==='/api/generate')return json({job:await enqueue(env,auth,b,provider)});
  const jobMatch=path.match(/^\/api\/jobs\/([a-f0-9-]{36})\/(cancel|download|delete)$/);if(jobMatch)return json(await jobAction(env,auth,jobMatch[1],jobMatch[2],provider));
  const fileMatch=path.match(/^\/api\/(?:assets|attachments)\/([a-f0-9-]{36}(?:\.(?:png|jpg|webp))?)\/delete$/);
  if(fileMatch){const row=await file(env,owner,fileMatch[1]);const r=await db.prepare("UPDATE files SET status='deleting' WHERE id=? AND owner_id=? AND status='ready' AND NOT EXISTS(SELECT 1 FROM project_files WHERE file_id=files.id) AND NOT EXISTS(SELECT 1 FROM job_files jf JOIN jobs j ON j.id=jf.job_id WHERE jf.file_id=files.id AND j.status IN ('queued','submitting','processing','import_pending'))").bind(row.id,owner).run();if(!r.meta.changes)throw new LabError('File is referenced by a project or active job.',409,'file_in_use');await env.LAB_FILES.delete(row.object_key);await db.prepare("UPDATE files SET status='deleted' WHERE id=?").bind(row.id).run();return json({message:'Private file deleted.'});}
  if(path==='/api/preferences'||path==='/api/research/profile'||path==='/api/settings') {
    if(b.revision!==(preferencesRow?.revision||0))throw new LabError('Preferences changed. Reload before saving.',409,'revision_conflict');
    if(path==='/api/preferences'){const presets={};for(const k of ['original','cinematic','thumbnail','railify']){if(typeof b.presets?.[k]!=='string'||b.presets[k].length>8000)throw new LabError('Invalid preset.');presets[k]=b.presets[k];}preferences.presets=presets;}
    if(path==='/api/research/profile')preferences.researchProfiles={...preferences.researchProfiles,[profileKey(b.provider,b.model)]:normalizeProfile(b.profile)};
    if(path==='/api/settings'){if(SECRET_KEYS.some(k=>b[k]))throw new LabError('Runtime credentials require the secure Pages provisioning flow.',403,'credential_action_denied');preferences.models={...preferences.models};for(const [key,value]of Object.entries({OPENAI_IMAGE_MODEL:'openaiImage',OPENAI_CHAT_MODEL:'openaiChat',XAI_IMAGE_MODEL:'xaiImage',XAI_CHAT_MODEL:'xaiChat'})){if(b[key]&&/^[\w.:-]{1,180}$/.test(b[key]))preferences.models[value]=b[key];}}
    const r=await db.prepare('INSERT INTO preferences(owner_id,body,revision) VALUES(?,?,1) ON CONFLICT(owner_id) DO UPDATE SET body=excluded.body,revision=preferences.revision+1 WHERE preferences.revision=?').bind(owner,JSON.stringify(preferences),b.revision).run();if(!r.meta.changes)throw new LabError('Preferences changed.',409,'revision_conflict');return json({preferences,preferencesRevision:b.revision+1,profile:b.profile?normalizeProfile(b.profile):undefined,config:await config()});
  }
  if(path==='/api/settings/test'){if(!auth.policy.canManageProviders)throw new LabError('Provider configuration capability required.',403);if(!['replicate','openai','xai'].includes(b.provider))throw new LabError('Invalid provider.');let result,state;try{result=await provider.test(b.provider);state='verified';}catch(e){state=[401,403].includes(e.status)?'rejected':'unavailable';await db.prepare('INSERT OR REPLACE INTO provider_status VALUES(?,?,?,?)').bind(b.provider,state,now(),owner).run();throw e;}await db.prepare('INSERT OR REPLACE INTO provider_status VALUES(?,?,?,?)').bind(b.provider,state,now(),owner).run();return json({...result,config:await config()});}
  if(path==='/api/settings/webhook-key')throw new LabError('Webhook signing credentials are managed through secure Pages provisioning.',403);
  if(path==='/api/chat')return streamResearch(env,request,auth,b,preferences,context);
  throw new LabError('API route not found.',404,'not_found');
}
