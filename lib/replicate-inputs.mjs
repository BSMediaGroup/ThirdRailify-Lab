import {createHmac,timingSafeEqual} from 'node:crypto';
import {LabError} from './core.mjs';
import {bytesFor,dbOf} from './storage.mjs';
import {classifySchemaField,inputErrors,isLabAssetReference,safeHttpsUrl,summarizeInputTypes} from '../public/model-schema.js';

export const REPLICATE_DATA_URI_MAX_BYTES=256*1024;
export const REPLICATE_DATA_URI_TOTAL_MAX_BYTES=2*1024*1024;
export const REPLICATE_DELIVERY_TTL_SECONDS=15*60;
const fileIdPattern=/^[a-f0-9-]{36}(?:\.(?:png|jpg|webp|gif))?$/;

function signingKey(env){
  const value=String(env.LAB_ASSET_DELIVERY_SIGNING_SECRET||'');
  let key;try{key=Buffer.from(value,'base64url');}catch{}
  if(!key||key.length<32)throw new LabError('Private provider delivery is unavailable.',503,'asset_transport_unavailable');
  return key;
}

function signature(env,jobId,assetId,expires){
  return createHmac('sha256',signingKey(env)).update(`lab-replicate-asset-v1\n${jobId}\n${assetId}\n${expires}`).digest('base64url');
}

function constantEqual(left,right){
  let a,b;try{a=Buffer.from(left,'base64url');b=Buffer.from(right,'base64url');}catch{return false;}
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function authorizedProjectAsset(env,owner,projectId,assetId,{jobId=null,field=null,media='file'}={}){
  if(!fileIdPattern.test(String(assetId||'')))throw new LabError(`${field||'File'}: private asset reference is invalid.`,422,'asset_reference_invalid');
  const db=dbOf(env),row=await db.prepare('SELECT * FROM files WHERE id=?').bind(assetId).first();
  if(!row||row.status!=='ready')throw new LabError(`${field||'File'}: uploaded asset is missing or deleted.`,409,'asset_missing');
  if(row.owner_id!==owner)throw new LabError(`${field||'File'}: uploaded asset is not authorized for this account.`,403,'asset_unauthorized');
  const authority=await db.prepare(`SELECT 1 allowed FROM projects p WHERE p.id=? AND p.owner_id=? AND p.deleted_at IS NULL
    AND (?=(SELECT project_id FROM files WHERE id=?) OR EXISTS(SELECT 1 FROM project_files pf WHERE pf.project_id=p.id AND pf.file_id=?))`).bind(projectId,owner,projectId,assetId,assetId).first();
  if(!authority)throw new LabError(`${field||'File'}: uploaded asset is not authorized for this project.`,403,'asset_project_unauthorized');
  if(jobId){const linked=await db.prepare('SELECT 1 linked FROM job_files WHERE job_id=? AND file_id=?').bind(jobId,assetId).first();if(!linked)throw new LabError(`${field||'File'}: uploaded asset is not linked to this job.`,403,'asset_job_unauthorized');}
  let metadata;try{metadata=JSON.parse(row.metadata);}catch{throw new LabError(`${field||'File'}: stored metadata is invalid.`,503,'asset_transport_unavailable');}
  if(!metadata.mime||!Number.isSafeInteger(metadata.bytes)||metadata.bytes<1)throw new LabError(`${field||'File'}: stored metadata is incomplete.`,503,'asset_transport_unavailable');
  if(media==='image'&&!metadata.mime.startsWith('image/'))throw new LabError(`${field||'File'}: the model expects an image file.`,422,'asset_mime_unsupported');
  if(media==='audio'&&!metadata.mime.startsWith('audio/'))throw new LabError(`${field||'File'}: the model expects an audio file.`,422,'asset_mime_unsupported');
  if(media==='video'&&!metadata.mime.startsWith('video/'))throw new LabError(`${field||'File'}: the model expects a video file.`,422,'asset_mime_unsupported');
  return {row,metadata};
}

function deliveryUrl(context,assetId){
  const expires=context.expiresAt||Math.floor(Date.now()/1000)+REPLICATE_DELIVERY_TTL_SECONDS;
  const url=new URL(`/api/provider-files/${encodeURIComponent(assetId)}`,context.origin);
  url.searchParams.set('job',context.jobId);url.searchParams.set('expires',String(expires));url.searchParams.set('signature',signature(context.env,context.jobId,assetId,expires));
  return url.href;
}

export async function resolveReplicateInput(schemaField,submittedValue,context){
  const classification=classifySchemaField(context.field,schemaField);
  const resolveOne=async value=>{
    if(typeof value==='string'){const url=safeHttpsUrl(value);if(url)return url;throw new LabError(`${context.field}: enter an HTTPS URL without embedded credentials.`,422,'input_url_invalid');}
    if(!isLabAssetReference(value))throw new LabError(`${context.field}: choose an uploaded private asset or enter an HTTPS URL.`,422,'asset_reference_invalid');
    const asset=await authorizedProjectAsset(context.env,context.owner,context.projectId,value.assetId,{jobId:context.jobId||null,field:context.field,media:classification.media});
    if(context.mode==='validate'){context.assetIds?.add(value.assetId);return value;}
    if(asset.metadata.bytes<=REPLICATE_DATA_URI_MAX_BYTES){
      context.dataUriBytes=(context.dataUriBytes||0)+asset.metadata.bytes;
      if(context.dataUriBytes>REPLICATE_DATA_URI_TOTAL_MAX_BYTES)throw new LabError(`${context.field}: combined inline file transport exceeds 2 MB.`,413,'asset_transport_too_large');
      let stored;try{stored=await bytesFor(context.env,context.owner,value.assetId);}catch{throw new LabError(`${context.field}: private asset transport could not be prepared.`,503,'asset_transport_unavailable');}
      return `data:${asset.metadata.mime};base64,${stored.bytes.toString('base64')}`;
    }
    return deliveryUrl(context,value.assetId);
  };
  if(classification.kind==='file_array'){
    const output=[];for(const value of submittedValue)output.push(await resolveOne(value));return output;
  }
  if(classification.kind==='file')return resolveOne(submittedValue);
  return submittedValue;
}

export async function validateReplicateInputReferences(env,owner,projectId,schema,input){
  const errors=inputErrors(input,schema,'submitted');
  if(errors.length)throw new LabError(errors.map(error=>error.message).join('; '),422,errors[0].code==='unsupported_input'?'unsupported_model_input':'model_input_invalid');
  const context={env,owner,projectId,mode:'validate',assetIds:new Set()};
  for(const [field,value] of Object.entries(input))await resolveReplicateInput(schema.properties[field],value,{...context,field,assetIds:context.assetIds});
  return [...context.assetIds];
}

export async function prepareReplicateInputs(env,row,snapshot,{nowSeconds=Math.floor(Date.now()/1000)}={}){
  const schema=snapshot.validatedModel?.schema;if(!schema)throw new LabError('Validated model schema is unavailable.',503,'schema_unavailable');
  const errors=inputErrors(snapshot.input,schema,'submitted');if(errors.length)throw new LabError(errors.map(error=>error.message).join('; '),422,'model_input_invalid');
  const context={env,owner:row.owner_id,projectId:row.project_id,jobId:row.id,origin:env.LAB_ORIGIN,mode:'prepare',expiresAt:nowSeconds+REPLICATE_DELIVERY_TTL_SECONDS,dataUriBytes:0};
  const input={};
  for(const [field,value] of Object.entries(snapshot.input))input[field]=await resolveReplicateInput(schema.properties[field],value,{...context,field,get dataUriBytes(){return context.dataUriBytes;},set dataUriBytes(value){context.dataUriBytes=value;}});
  const providerErrors=inputErrors(input,schema,'provider');if(providerErrors.length)throw new LabError(providerErrors.map(error=>error.message).join('; '),422,'asset_transport_preparation_failed');
  return {input,types:summarizeInputTypes(input),expiresAt:context.expiresAt};
}

export async function serveReplicateAsset(env,request){
  if(!['GET','HEAD'].includes(request.method))throw new LabError('Method not allowed.',405);
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/provider-files\/([^/]+)$/),assetId=match&&decodeURIComponent(match[1]),jobId=url.searchParams.get('job')||'',expires=Number(url.searchParams.get('expires')),provided=url.searchParams.get('signature')||'';
  if(!assetId||!fileIdPattern.test(assetId)||!/^[a-f0-9-]{36}$/.test(jobId)||!Number.isSafeInteger(expires)||!provided)throw new LabError('Private file grant denied.',403,'asset_grant_invalid');
  const now=Math.floor(Date.now()/1000);if(expires<now||expires>now+REPLICATE_DELIVERY_TTL_SECONDS)throw new LabError('Private file grant expired.',403,'asset_grant_expired');
  if(!constantEqual(provided,signature(env,jobId,assetId,expires)))throw new LabError('Private file grant denied.',403,'asset_grant_invalid');
  const db=dbOf(env),row=await db.prepare(`SELECT f.*,j.status job_status FROM files f JOIN job_files jf ON jf.file_id=f.id JOIN jobs j ON j.id=jf.job_id
    WHERE f.id=? AND j.id=? AND f.owner_id=j.owner_id AND f.status='ready' AND j.deleted_at IS NULL
    AND j.status IN ('queued','submitting','processing') AND (f.project_id=j.project_id OR EXISTS(SELECT 1 FROM project_files pf WHERE pf.project_id=j.project_id AND pf.file_id=f.id))`).bind(assetId,jobId).first();
  if(!row)throw new LabError('Private file grant denied.',403,'asset_grant_invalid');
  const object=await env.LAB_FILES.get(row.object_key);if(!object)throw new LabError('Private file is unavailable.',503,'asset_transport_unavailable');
  let metadata;try{metadata=JSON.parse(row.metadata);}catch{throw new LabError('Private file metadata is unavailable.',503,'asset_transport_unavailable');}
  return new Response(request.method==='HEAD'?null:object.body,{headers:{'Content-Type':metadata.mime,'Content-Length':String(object.size),'Cache-Control':'private, no-store','Content-Disposition':`inline; filename="${String(metadata.name||metadata.id||'input').replace(/[^\w. -]/g,'_')}"`,'X-Content-Type-Options':'nosniff'}});
}
