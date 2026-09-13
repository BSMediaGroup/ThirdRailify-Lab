import { LabError, parseModel, verifyReplicateWebhook, sanitize, imageType } from './core.mjs';
import { preparePrompt } from '../public/model-schema.js';
import { Providers } from './providers.mjs';
import {prepareReplicateInputs,validateReplicateInputReferences} from './replicate-inputs.mjs';
import { workshopAccess } from './workshop-policy.js';
import { dbOf, ready, now, id, digest, project, materialize, validateReferences, storeFile } from './storage.mjs';
import {resolveCredential,resolveExistingJobCredential} from './provider-profiles.mjs';
import {providerCostFields,recordUsage,usageFromResponse} from './usage.mjs';
const terminal=new Set(['succeeded','failed','canceled','submission_uncertain','interrupted','download_failed']);
async function measuredMegapixels(env,row){
  const db=dbOf(env),inputs=(await db.prepare("SELECT f.metadata FROM files f JOIN job_files jf ON jf.file_id=f.id WHERE jf.job_id=? AND f.status='ready'").bind(row.id).all()).results||[],assetIds=JSON.parse(row.assets||'[]'),outputs=[];
  for(const asset of assetIds){const fileId=typeof asset==='string'?asset:asset?.id;if(!fileId)continue;const file=await db.prepare("SELECT metadata FROM files WHERE id=? AND owner_id=? AND status='ready'").bind(fileId,row.owner_id).first();if(file)outputs.push(file);}
  const convert=rows=>rows.map(item=>{const metadata=JSON.parse(item.metadata||'{}'),width=Number(metadata.width),height=Number(metadata.height);return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0?width*height/1_000_000:null;});
  return {inputMegapixels:convert(inputs),outputMegapixels:convert(outputs)};
}
async function recordJobUsage(env,row,prediction={},outcome=prediction.status||row.status){
  const snapshot=JSON.parse(row.snapshot),output=Array.isArray(prediction.output)?prediction.output:null,evidence=await measuredMegapixels(env,row);
  await recordUsage(env,{idempotencyKey:`job:${row.id}:provider`,logicalRequestId:row.id,ownerId:row.owner_id,projectId:row.project_id,jobId:row.id,provider:row.provider,profileId:snapshot.profileId,fingerprint:snapshot.profileFingerprint,model:snapshot.model,servedModel:prediction.model||snapshot.model,operation:'image_generation',outcome,providerRequestId:prediction.id||row.provider_id,generatedOutputs:output?output.length:(JSON.parse(row.assets||'[]').length||null),...usageFromResponse(prediction.metrics||prediction.usage||{}),...providerCostFields(prediction),evidence:{...evidence,quality:snapshot.options?.quality||null,size:snapshot.options?.size||null,resolution:snapshot.options?.resolution||null},metadata:{version:snapshot.version||null,predictTime:prediction.metrics?.predict_time??null}});
}
export async function dispatchJob(env,row){
  if(!row||terminal.has(row.status))return;
  if(!env.LAB_JOBS?.send)throw new LabError('Image processor is unavailable.',503,'processor_unavailable');
  await env.LAB_JOBS.send({jobId:row.id});
}
export function jobView(row){const s=JSON.parse(row.snapshot);return {provider:s.provider,model:s.model,prompt:s.prompt,id:row.id,sessionId:row.project_id,requestId:row.request_id,status:row.status,phase:row.phase,createdAt:row.created_at,updatedAt:row.updated_at,attempts:row.attempts,error:row.error,providerId:row.provider_id,assets:JSON.parse(row.assets),metrics:row.metrics?JSON.parse(row.metrics):null,providerUrl:row.provider==='replicate'&&row.provider_id?'https://replicate.com/p/'+encodeURIComponent(row.provider_id):null};}
export async function enqueue(env,auth,b,provider=null){
  const db=dbOf(env),owner=auth.owner;await project(env,owner,b.projectId);
  if(!/^[\w-]{16,80}$/.test(b.requestId||'')||!['replicate','openai','xai'].includes(b.provider))throw new LabError('Provider and idempotency key required.');
  const credential=await resolveCredential(env,owner,b.provider,b.model,b.profileId||''),effectiveProvider=provider||new Providers(()=>env,globalThis.fetch,{[b.provider]:credential});
  const snapshot={provider:b.provider,model:b.model,prompt:String(b.prompt||'').trim(),input:b.input||{},options:b.options||{},sessionId:b.projectId,profileId:credential.profileId,profileFingerprint:credential.fingerprint,profileLabel:credential.label};
  const hash=await digest(JSON.stringify(snapshot));const old=await db.prepare('SELECT * FROM jobs WHERE owner_id=? AND request_id=?').bind(owner,b.requestId).first();
  if(old){if(old.input_hash!==hash)throw new LabError('Idempotency key was reused for another request.',409,'idempotency_conflict');await dispatchJob(env,old);return jobView(old);}
  if(!env.LAB_JOBS?.send)throw new LabError('Image processor is unavailable.',503,'processor_unavailable');
  if(env.LAB_PAID_ENABLED!=='true')throw new LabError('Provider submissions are paused.',503,'submissions_paused');
  effectiveProvider.key(b.provider);if(snapshot.prompt.length>24000)throw new LabError('Prompt exceeds 24,000 characters.');
  let replicateRefs=[];
  if(b.provider==='replicate'){parseModel(b.model);const model=await effectiveProvider.model(b.model);snapshot.input=preparePrompt(snapshot.input,model,snapshot.prompt);snapshot.version=model.version;snapshot.validatedModel={id:model.id,version:model.version,official:model.official,schema:model.schema};replicateRefs=await validateReplicateInputReferences(env,owner,b.projectId,model.schema,snapshot.input);}
  else{if(!snapshot.prompt||!/^[\w.:-]{1,180}$/.test(b.model||''))throw new LabError('Choose a model and enter a prompt.');if(snapshot.options.references&&(!Array.isArray(snapshot.options.references)||snapshot.options.references.length>8))throw new LabError('Use at most eight image references.');}
  const refs=[...new Set([...(await validateReferences(env,owner,snapshot)),...replicateRefs])];if(b.provider!=='replicate')await materialize(env,owner,snapshot.input);await materialize(env,owner,snapshot.options.references||[]);
  const jobId=id(),timestamp=now(),nonce=id()+id();
  const result=await db.batch([db.prepare(`INSERT INTO jobs(id,owner_id,project_id,request_id,input_hash,snapshot,provider,webhook_nonce,status,phase,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,'queued','Queued for image generation',?,? WHERE (SELECT count(*) FROM jobs WHERE owner_id=? AND status IN ('queued','submitting','processing','import_pending'))<6 AND (SELECT count(*) FROM jobs WHERE status IN ('queued','submitting','processing','import_pending'))<24
    ON CONFLICT(owner_id,request_id) DO NOTHING`).bind(jobId,owner,b.projectId,b.requestId,hash,JSON.stringify(snapshot),b.provider,nonce,timestamp,timestamp,owner),...refs.map(ref=>db.prepare('INSERT INTO job_files(job_id,file_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM jobs WHERE id=?)').bind(jobId,ref,jobId))]);
  let row=await db.prepare('SELECT * FROM jobs WHERE owner_id=? AND request_id=?').bind(owner,b.requestId).first();if(!row)throw new LabError('Workshop concurrency limit reached.',429);if(row.input_hash!==hash)throw new LabError('Idempotency conflict.',409);
  try{await dispatchJob(env,row);}catch{await db.prepare("UPDATE jobs SET status='failed',phase='Processor dispatch failed; no generation submitted',error='Image processor is unavailable. Please try a new request later.',updated_at=? WHERE id=? AND status='queued'").bind(now(),row.id).run();row=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first();}
  return jobView(row);
}
export async function jobAction(env,auth,jobId,action,provider=null){const db=dbOf(env),row=await db.prepare('SELECT * FROM jobs WHERE id=? AND owner_id=? AND deleted_at IS NULL').bind(jobId,auth.owner).first();if(!row)throw new LabError('Job not found.',404);await project(env,auth.owner,row.project_id);
  if(action==='delete'){if(!terminal.has(row.status))throw new LabError('Wait for the active job to finish.',409);await db.prepare('UPDATE jobs SET deleted_at=? WHERE id=?').bind(now(),row.id).run();return {message:'Generation history removed; idempotency tombstone retained.'};}
  if(action==='download'){if(row.status!=='download_failed'||row.provider!=='replicate'||!row.provider_id)throw new LabError('This output cannot be retried.',409);await db.prepare("UPDATE jobs SET status='import_pending',next_at=0,attempts=0,error=NULL WHERE id=? AND status='download_failed'").bind(row.id).run();}
  else if(row.status==='queued')await db.prepare("UPDATE jobs SET status='canceled',phase='Canceled before submission' WHERE id=? AND status='queued'").bind(row.id).run();
  else if(row.provider==='replicate'&&row.provider_id&&!terminal.has(row.status)){const snapshot=JSON.parse(row.snapshot),credential=await resolveExistingJobCredential(env,row.provider,snapshot.profileId),activeProvider=provider||new Providers(()=>env,globalThis.fetch,{replicate:credential});await activeProvider.request('replicate',`/predictions/${encodeURIComponent(row.provider_id)}/cancel`,{method:'POST'});await db.prepare("UPDATE jobs SET phase='Cancellation requested; awaiting provider confirmation' WHERE id=?").bind(row.id).run();}
  else throw new LabError('This provider request cannot be reliably canceled after submission.',409);
  const updated=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first();if(action==='download')await dispatchJob(env,updated);return {job:jobView(updated)};
}
async function applyPrediction(env,row,prediction){if(!prediction.id||prediction.id!==row.provider_id)throw new LabError('Prediction mismatch.',409);const db=dbOf(env);if(prediction.status==='succeeded'){const outputs=new Providers(()=>env).outputUrls(prediction);if(!outputs.length)throw new LabError('Provider returned no image outputs.',422);await db.prepare("UPDATE jobs SET status='import_pending',phase='Provider completed; original import pending',outputs=?,metrics=?,updated_at=?,next_at=0 WHERE id=? AND status IN ('submitting','processing','submission_uncertain')").bind(JSON.stringify(outputs),JSON.stringify(prediction.metrics||{}),now(),row.id).run();}
  else if(['failed','canceled'].includes(prediction.status))await db.prepare("UPDATE jobs SET status=?,phase='Provider finished',error=?,updated_at=? WHERE id=? AND status IN ('submitting','processing','submission_uncertain')").bind(prediction.status,sanitize(prediction.error||'',env),now(),row.id).run();
  else await db.prepare("UPDATE jobs SET status='processing',phase='Provider is generating',updated_at=?,next_at=? WHERE id=? AND status IN ('submitting','processing','submission_uncertain')").bind(now(),Date.now()+60000,row.id).run();
  await recordJobUsage(env,await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first(),prediction);
}
export async function receiveWebhook(env,request){if(request.method!=='POST')throw new LabError('Method not allowed.',405);if(!env.REPLICATE_WEBHOOK_SIGNING_SECRET)throw new LabError('Webhook verification unavailable.',503);const chunks=[];let length=0;for await(const c of request.body||[]){length+=c.length;if(length>1024*1024)throw new LabError('Webhook body too large.',413);chunks.push(Buffer.from(c));}const raw=Buffer.concat(chunks);if(!verifyReplicateWebhook(raw,Object.fromEntries(request.headers),env.REPLICATE_WEBHOOK_SIGNING_SECRET))throw new LabError('Invalid webhook signature.',401);
  let p;try{p=JSON.parse(raw.toString());}catch{throw new LabError('Invalid webhook JSON.');}const url=new URL(request.url),db=dbOf(env);let row=await db.prepare("SELECT * FROM jobs WHERE id=? AND webhook_nonce=? AND provider='replicate'").bind(url.searchParams.get('job')||'',url.searchParams.get('nonce')||'').first();
  if(!row||!p.id||!/^[\w-]{1,120}$/.test(p.id))throw new LabError('Unknown callback job.',404);
  if(row.provider_id&&row.provider_id!==p.id)throw new LabError('Callback prediction mismatch.',409);
  const receipt=request.headers.get('webhook-id'),bodyHash=await digest(raw.toString());const old=await db.prepare('SELECT * FROM webhook_receipts WHERE id=?').bind(receipt).first();if(old&&(old.job_id!==row.id||old.body_hash!==bodyHash))throw new LabError('Callback replay mismatch.',409);
  // The nonce is persisted before submission and never returned to the browser.
  // It binds a verified provider callback to its known owner/project even if it
  // arrives before the submission response. No browser-supplied owner is used.
  await db.batch([db.prepare('INSERT INTO webhook_receipts VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(receipt,row.id,bodyHash,now()),db.prepare("UPDATE jobs SET provider_id=COALESCE(provider_id,?) WHERE id=? AND status IN ('submitting','processing','submission_uncertain')").bind(p.id,row.id)]);
  const committed=await db.prepare('SELECT * FROM webhook_receipts WHERE id=?').bind(receipt).first();if(committed.job_id!==row.id||committed.body_hash!==bodyHash)throw new LabError('Callback replay mismatch.',409);
  row=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first();
  const exists=await db.prepare('SELECT id FROM projects WHERE id=? AND deleted_at IS NULL').bind(row.project_id).first();if(!exists)return Response.json({ok:true,deleted:true});
  // Replay the monotonic transition even for a receipt already recorded: the
  // previous invocation could have ended between recording and applying it.
  if(row.provider_id===p.id)await applyPrediction(env,row,p);await dispatchJob(env,await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first());return Response.json({ok:true,...(old?{duplicate:true}:{})});
}
export async function recover(env,provider=null,jobId=null){await ready(env);const db=dbOf(env),time=Date.now();
  await db.prepare("UPDATE jobs SET status='submission_uncertain',phase='Submission interrupted; reconcile provider acceptance before retrying',lease_until=0 WHERE status='submitting' AND lease_until<?").bind(time).run();
  const uncertain=await db.prepare("SELECT id,provider FROM jobs WHERE status='submission_uncertain' AND provider!='replicate' AND deleted_at IS NULL LIMIT 20").all();
  for(const row of uncertain.results)if(await env.LAB_FILES.head(`results/${row.id}`))await db.prepare("UPDATE jobs SET status='import_pending',phase='Stored provider response recovered; original import pending',next_at=0 WHERE id=? AND status='submission_uncertain'").bind(row.id).run();
  const rows=await db.prepare("SELECT * FROM jobs WHERE status IN ('queued','processing','import_pending') AND next_at<=? AND lease_until<? AND (? IS NULL OR id=?) ORDER BY created_at LIMIT 8").bind(time,time,jobId,jobId).all();
  for(let row of rows.results){const claim=await db.prepare("UPDATE jobs SET lease_until=? WHERE id=? AND lease_until<? AND (SELECT count(*) FROM jobs WHERE lease_until>?)<2").bind(Date.now()+600000,row.id,Date.now(),Date.now()).run();if(!claim.meta.changes)continue;
    try{
      const exists=await db.prepare('SELECT id FROM projects WHERE id=? AND deleted_at IS NULL').bind(row.project_id).first();if(!exists){await db.prepare("UPDATE jobs SET status='canceled',phase='Originating project deleted' WHERE id=?").bind(row.id).run();continue;}
      if(row.status==='queued'){
        if(env.LAB_PAID_ENABLED!=='true')continue;
        if(!(await workshopAccess(env.THIRDRAILIFY_AUTH_DB,row.owner_id)).allowed){await db.prepare("UPDATE jobs SET status='canceled',phase='Access revoked before provider submission' WHERE id=? AND status='queued'").bind(row.id).run();continue;}
        const snapshot=JSON.parse(row.snapshot),credential=await resolveCredential(env,row.owner_id,row.provider,snapshot.model,snapshot.profileId||''),activeProvider=provider||new Providers(()=>env,globalThis.fetch,{[row.provider]:credential});snapshot.profileId=credential.profileId;snapshot.profileFingerprint=credential.fingerprint;
        if(row.provider==='replicate'){const prepared=await prepareReplicateInputs(env,row,snapshot);snapshot.input=prepared.input;console.info('Replicate input prepared',JSON.stringify({jobId:row.id,fields:prepared.types}));}
        else snapshot.input=await materialize(env,row.owner_id,snapshot.input);
        snapshot.options={...snapshot.options,references:await materialize(env,row.owner_id,snapshot.options.references||[])};
        const updated=await db.prepare("UPDATE jobs SET status='submitting',phase='Submitting once to provider',attempts=attempts+1,updated_at=? WHERE id=? AND status='queued'").bind(now(),row.id).run();if(!updated.meta.changes)continue;
        if(!(await workshopAccess(env.THIRDRAILIFY_AUTH_DB,row.owner_id)).allowed){await db.prepare("UPDATE jobs SET status='canceled',phase='Access revoked before submission' WHERE id=? AND status='submitting'").bind(row.id).run();continue;}
        if(row.provider==='replicate'){
          const callback=new URL('/api/webhooks/replicate',env.LAB_ORIGIN);callback.searchParams.set('job',row.id);callback.searchParams.set('nonce',row.webhook_nonce);snapshot.webhook=callback.href;
          const prediction=await activeProvider.createReplicate(snapshot);if(!prediction.id)throw new LabError('Submission returned no prediction ID.',502,'submission_uncertain');
          await db.prepare('UPDATE jobs SET provider_id=COALESCE(provider_id,?) WHERE id=?').bind(prediction.id,row.id).run();row=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first();await applyPrediction(env,row,prediction);
        }else{
          const result=await activeProvider.directImage(snapshot);if(!Array.isArray(result.data)||!result.data.length)throw new LabError('Provider returned no images.',502,'submission_uncertain');
          // Persist the paid response before importing originals, so retries never generate again.
          await env.LAB_FILES.put(`results/${row.id}`,JSON.stringify(result),{httpMetadata:{contentType:'application/json'}});
          await db.prepare("UPDATE jobs SET status='import_pending',phase='Provider completed; original import pending',metrics=? WHERE id=? AND status='submitting'").bind(JSON.stringify(result.usage||{}),row.id).run();
          const xaiPricing=row.provider==='xai'&&!providerCostFields(result).actualCostTicks?await activeProvider.pricingModel('xai',result.model||snapshot.model,'image').catch(()=>null):null;
          await recordUsage(env,{idempotencyKey:`job:${row.id}:provider`,logicalRequestId:row.id,ownerId:row.owner_id,projectId:row.project_id,jobId:row.id,provider:row.provider,profileId:credential.profileId,fingerprint:credential.fingerprint,model:snapshot.model,servedModel:result.model||snapshot.model,operation:'image_generation',outcome:'succeeded',providerRequestId:result.id||null,generatedOutputs:result.data.length,...usageFromResponse(result.usage||{}),...providerCostFields(result),xaiPricing,evidence:{quality:snapshot.options?.quality||null,size:snapshot.options?.size||null,resolution:snapshot.options?.resolution||null},metadata:{responseFormat:'private_staged'}});
        }
      }else if(row.status==='processing'&&row.provider_id){const snapshot=JSON.parse(row.snapshot),credential=await resolveExistingJobCredential(env,row.provider,snapshot.profileId),activeProvider=provider||new Providers(()=>env,globalThis.fetch,{[row.provider]:credential});await applyPrediction(env,row,await activeProvider.request('replicate',`/predictions/${encodeURIComponent(row.provider_id)}`));}
      row=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first();
      if(row.status==='import_pending'){
        const assets=JSON.parse(row.assets),snapshot=JSON.parse(row.snapshot);
        if(row.provider==='replicate'){const urls=JSON.parse(row.outputs),credential=await resolveExistingJobCredential(env,row.provider,snapshot.profileId),activeProvider=provider||new Providers(()=>env,globalThis.fetch,{replicate:credential});for(let i=assets.length;i<urls.length;i++){const bytes=await activeProvider.downloadReplicate(urls[i]);const fixed=await digest(row.id+':'+i);const fileId=`${fixed.slice(0,8)}-${fixed.slice(8,12)}-${fixed.slice(12,16)}-${fixed.slice(16,20)}-${fixed.slice(20,32)}.${imageType(bytes).ext}`;assets.push(await storeFile(env,row.owner_id,row.project_id,bytes,{source:'generation',jobId:row.id,title:snapshot.prompt.slice(0,90),providerProfileId:credential.profileId,providerFingerprint:credential.fingerprint},fileId));await db.prepare('UPDATE jobs SET assets=? WHERE id=?').bind(JSON.stringify(assets),row.id).run();}}
        else{const object=await env.LAB_FILES.get(`results/${row.id}`);if(!object)throw new LabError('Paid response original is unavailable.',503);const result=await object.json();for(let i=assets.length;i<result.data.length;i++){const image=result.data[i];if(!image.b64_json||image.b64_json.length>45*1024*1024)throw new LabError('Provider output format is unsupported.',422);const bytes=Buffer.from(image.b64_json,'base64');const fixed=await digest(row.id+':'+i);const fileId=`${fixed.slice(0,8)}-${fixed.slice(8,12)}-${fixed.slice(12,16)}-${fixed.slice(16,20)}-${fixed.slice(20,32)}.${imageType(bytes).ext}`;assets.push(await storeFile(env,row.owner_id,row.project_id,bytes,{source:'generation',jobId:row.id,title:snapshot.prompt.slice(0,90)},fileId));await db.prepare('UPDATE jobs SET assets=? WHERE id=?').bind(JSON.stringify(assets),row.id).run();}}
        await db.prepare("UPDATE jobs SET status='succeeded',phase='Originals stored privately',error=NULL,updated_at=? WHERE id=? AND status='import_pending'").bind(now(),row.id).run();row=await db.prepare('SELECT * FROM jobs WHERE id=?').bind(row.id).first();if(row.provider==='replicate')await recordJobUsage(env,row,{id:row.provider_id,model:snapshot.model,output:JSON.parse(row.outputs||'[]'),metrics:row.metrics?JSON.parse(row.metrics):{}},'succeeded');else await env.LAB_FILES.delete(`results/${row.id}`);
      }
    }catch(error){const current=await db.prepare('SELECT status,attempts FROM jobs WHERE id=?').bind(row.id).first();const uncertain=current.status==='submitting';const importing=current.status==='import_pending';const attempts=current.attempts+1;const status=uncertain?'submission_uncertain':importing?(attempts<8?'import_pending':'download_failed'):current.status==='processing'&&attempts<12?'processing':'failed';await db.prepare('UPDATE jobs SET status=?,error=?,attempts=?,next_at=?,updated_at=? WHERE id=?').bind(status,sanitize(error.message,env),attempts,Date.now()+Math.min(1800000,60000*2**Math.min(attempts,5)),now(),row.id).run();}
    finally{await db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').bind(row.id).run();}
  }
  await cleanup(env,provider||new Providers(()=>env));
}
async function cleanup(env,provider){const db=dbOf(env);const rows=await db.prepare("SELECT * FROM provider_cleanup WHERE state='pending' AND next_at<? AND attempts<8 LIMIT 10").bind(Date.now()).all();for(const row of rows.results){try{await provider.request(row.provider,'/files/'+encodeURIComponent(row.file_id),{method:'DELETE'});await db.prepare("UPDATE provider_cleanup SET state='deleted' WHERE id=?").bind(row.id).run();}catch(e){if(e.status===404)await db.prepare("UPDATE provider_cleanup SET state='deleted' WHERE id=?").bind(row.id).run();else await db.prepare('UPDATE provider_cleanup SET attempts=attempts+1,next_at=?,error=? WHERE id=?').bind(Date.now()+300000,sanitize(e.message,env),row.id).run();}}
  await db.prepare("UPDATE research_runs SET status='interrupted' WHERE status='streaming' AND updated_at<?").bind(new Date(Date.now()-900000).toISOString()).run();
  await db.prepare("UPDATE files SET status='deleting' WHERE status='pending' AND created_at<? AND NOT EXISTS(SELECT 1 FROM jobs WHERE status IN ('submitting','import_pending') AND owner_id=files.owner_id)").bind(new Date(Date.now()-3600000).toISOString()).run();
  const deleting=await db.prepare("SELECT id,object_key FROM files WHERE status='deleting' LIMIT 20").all();for(const row of deleting.results){await env.LAB_FILES.delete(row.object_key);await db.prepare("UPDATE files SET status='deleted' WHERE id=?").bind(row.id).run();}
  await db.prepare('DELETE FROM rate_limits WHERE window<?').bind(Math.floor(Date.now()/60000)-60).run();
}
