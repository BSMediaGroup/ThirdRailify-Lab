import { LabError, sanitize } from './core.mjs';
import { Providers } from './providers.mjs';
import { modelKind } from './models.mjs';
import { normalizeProfile, profileKey } from './research.mjs';
import { dbOf, project, validateReferences, bytesFor, storeFile, id, now } from './storage.mjs';
import { workshopAccess } from './workshop-policy.js';
export async function streamResearch(env,request,auth,b,preferences,context){
  if(env.LAB_PAID_ENABLED!=='true')throw new LabError('Provider submissions are paused.',503);
  await project(env,auth.owner,b.projectId);const key=profileKey(b.provider,b.model);
  if(modelKind(b.provider,b.model)==='image')throw new LabError('Choose a research model.');
  if(!Array.isArray(b.messages)||!b.messages.length||b.messages.length>120||JSON.stringify(b.messages).length>600000)throw new LabError('Conversation exceeds the request limit.');
  for(const m of b.messages){if(!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>150000||m.attachments&&(!Array.isArray(m.attachments)||m.attachments.length>8||m.role!=='user'&&m.attachments.length))throw new LabError('Invalid conversation.');}
  const refs=await validateReferences(env,auth.owner,b.messages);let total=0;for(const ref of refs){const a=await bytesFor(env,auth.owner,ref);total+=a.bytes.length;}if(total>32*1024*1024)throw new LabError('Conversation attachments exceed 32 MB.',413);
  const db=dbOf(env),runId=id(),provider=new Providers(()=>env),profile=normalizeProfile(preferences.researchProfiles?.[key]);provider.key(b.provider);
  const inserted=await db.prepare("INSERT INTO research_runs(id,owner_id,project_id,provider,model,status,created_at,updated_at) SELECT ?,?,?,?,?,'streaming',?,? WHERE (SELECT count(*) FROM research_runs WHERE owner_id=? AND status='streaming' AND updated_at>?)<1 AND (SELECT count(*) FROM research_runs WHERE status='streaming' AND updated_at>?)<4").bind(runId,auth.owner,b.projectId,b.provider,b.model,now(),now(),auth.owner,new Date(Date.now()-900000).toISOString(),new Date(Date.now()-900000).toISOString()).run();if(!inserted.meta.changes)throw new LabError('A research response is already active. Wait or stop it first.',429);
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),900000);request.signal.addEventListener('abort',()=>abort.abort(),{once:true});let closed=false,text='',lastSave=Date.now(),chain=Promise.resolve();
  const encoder=new TextEncoder();let controller;
  const stream=new ReadableStream({start(c){controller=c;},cancel(){closed=true;abort.abort();}});
  const emit=(type,data)=>{if(!closed)try{controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));}catch{closed=true;abort.abort();}};
  const persist=(status='streaming',metadata={})=>{const snapshot=text;chain=chain.then(()=>db.prepare('UPDATE research_runs SET text=?,status=?,metadata=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM projects WHERE id=? AND deleted_at IS NULL)').bind(snapshot,status,JSON.stringify(metadata),now(),runId,b.projectId).run());return chain;};
  const run=(async()=>{try{
    if(!(await workshopAccess(env.THIRDRAILIFY_AUTH_DB,auth.owner)).allowed)throw new LabError('Workshop access was revoked.',403);
    emit('status',{message:'Preparing '+b.model,runId});
    const result=await provider.chat(b.provider,b.messages,b.model,delta=>{text+=delta;emit('delta',{text:delta});if(Date.now()-lastSave>2000){lastSave=Date.now();persist().catch(()=>abort.abort());}},abort.signal,{profile,resolveAttachment:ref=>bytesFor(env,auth.owner,ref),onStatus:message=>emit('status',{message}),
      onUploadStart:async ref=>{await db.prepare("INSERT INTO provider_cleanup(id,owner_id,provider,state,created_at) VALUES(?,?,?,'uploading',?)").bind(runId+':'+ref,auth.owner,b.provider,now()).run();},
      onUploaded:async(ref,fileId)=>{await db.prepare("UPDATE provider_cleanup SET file_id=?,state='pending',next_at=? WHERE id=?").bind(fileId,Date.now()+960000,runId+':'+ref).run();},
      onDeleted:async fileId=>{await db.prepare("UPDATE provider_cleanup SET state='deleted' WHERE provider=? AND file_id=? AND owner_id=?").bind(b.provider,fileId,auth.owner).run();},
    });
    const artifacts=[];for(const f of result.files||[]){if(b.provider!=='openai')continue;try{const r=await provider.fetch(`https://api.openai.com/v1/containers/${encodeURIComponent(f.containerId)}/files/${encodeURIComponent(f.fileId)}/content`,{headers:{Authorization:'Bearer '+provider.key('openai')},redirect:'manual',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Artifact download failed.');const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>32*1024*1024)throw new Error('Artifact too large.');chunks.push(Buffer.from(c));}artifacts.push(await storeFile(env,auth.owner,b.projectId,Buffer.concat(chunks),{name:f.name,kind:'artifact',mime:'application/octet-stream'}));}catch{result.warning=[result.warning,'An analysis artifact could not be imported.'].filter(Boolean).join(' ');}}
    const metadata={...result,text:undefined,files:undefined,artifacts,cleanup:result.cleanup?.length?'Provider file cleanup is pending; recovery will retry.':null};await persist(result.completed?'completed':'partial',metadata);emit('done',metadata);
  }catch(e){const message=sanitize(e.message,env);await persist(abort.signal.aborted?'stopped':'failed',{warning:message}).catch(()=>{});emit('error',{message});}
  finally{clearTimeout(timer);if(!closed){closed=true;controller.close();}}})();
  context.waitUntil(run);
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Research-Run':runId}});
}
