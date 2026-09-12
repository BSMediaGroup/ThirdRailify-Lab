import {researchChat} from './research.mjs';
import {workflowFor} from '../public/model-schema.js';
import {LabError,CATALOG,parseModel,normalizeInputSchema,validateInput,isDeliveryUrl,imageType,sanitize,flattenOutput} from './core.mjs';

export class Providers {
  constructor(getConfig,fetchImpl=globalThis.fetch){this.config=getConfig;this.fetch=(...args)=>fetchImpl(...args);this.cache=new Map();}
  key(provider){
    const key=this.config()[{replicate:'REPLICATE_API_TOKEN',openai:'OPENAI_API_KEY',xai:'XAI_API_KEY'}[provider]];
    if(!key)throw new LabError(`Add your ${provider==='xai'?'Grok / SpaceXAI':provider} API key in Connections first.`,409,'key_missing');
    return key;
  }
  async request(provider,route,{method='GET',body,timeout=30000,headers={},signal}={}){
    const key=this.key(provider),base={replicate:'https://api.replicate.com/v1',openai:'https://api.openai.com/v1',xai:'https://api.x.ai/v1'}[provider];
    if(!base||!route.startsWith('/'))throw new LabError('Unknown provider route.');
    let res;
    try{
      res=await this.fetch(base+route,{method,headers:{Authorization:'Bearer '+key,...(body!==undefined?{'Content-Type':typeof body==='string'?'text/plain':'application/json'}:{}),...headers},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body)),signal:signal||AbortSignal.timeout(timeout),redirect:'manual'});
    }catch(e){throw new LabError(method==='POST'?'Provider submission was interrupted. It may have been accepted; check your provider dashboard before generating again.':'Cannot reach the provider. Check your connection and try again.',502,method==='POST'?'submission_uncertain':'provider_network');}
    const chunks=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>48*1024*1024)throw new LabError('Provider response exceeds the bounded response limit.',502,method==='POST'?'submission_uncertain':'provider_response_limit');chunks.push(Buffer.from(chunk));}const text=Buffer.concat(chunks).toString('utf8');let json;
    try{json=JSON.parse(text);}catch{throw new LabError(`Provider returned HTTP ${res.status}, not JSON. Check provider status and your connection.`,502,'provider_non_json');}
    if(!res.ok){
      let detail=json?.error?.message||json?.detail||json?.message||json?.error||'Request rejected';
      if(typeof detail!=='string')detail=JSON.stringify(detail);
      const hint=res.status===401?'Check the saved API key. ':res.status===402?'Add API billing/credits. ':res.status===403?'Check account/model access. ':res.status===429?'Provider rate limit reached. ':'';
      throw new LabError(hint+sanitize(detail,this.config()),res.status,`provider_${res.status}`,Number(res.headers.get('retry-after'))||0);
    }
    return json;
  }
  async test(provider){
    const data=await this.request(provider,provider==='replicate'?'/account':'/models');
    return {ok:true,provider,verified:true,message:provider==='replicate'?'Replicate account authentication succeeded.':'Model-list authentication succeeded. Image-model access is checked when you generate.',models:provider==='replicate'?undefined:(data.data||[]).map(m=>m.id).filter(Boolean).slice(0,200)};
  }
  async search(q){
    if(!q?.trim())return CATALOG;
    const data=await this.request('replicate','/models',{method:'QUERY',body:q.trim().slice(0,160)});
    return (data.results||[]).slice(0,30).map(modelMetadata);
  }
  async model(ref){
    const parsed=parseModel(ref),cacheKey=parsed.id+(parsed.version?':'+parsed.version:'');
    const cached=this.cache.get(cacheKey);if(cached&&Date.now()-cached.at<300000)return cached.value;
    const model=await this.request('replicate','/models/'+parsed.id);
    const version=parsed.version?await this.request('replicate',`/models/${parsed.id}/versions/${parsed.version}`):model.latest_version;
    const doc=version?.openapi_schema;
    if(!doc?.components?.schemas?.Input)throw new LabError('This model has no readable input schema. Try another model/version or check model access.',422,'schema_unavailable');
    const schema=normalizeInputSchema(doc);
    const value={...modelMetadata(model),id:parsed.id,ref:cacheKey,name:model.name,description:model.description||'',version:version.id,official:!parsed.version&&Boolean(model.is_official||CATALOG.find(m=>m.id===parsed.id)?.official),schema,rawSchema:doc,url:`https://replicate.com/${parsed.id}`,licenseUrl:model.license_url||null,promptKey:schema.properties?.prompt?.type==='string'?'prompt':schema.properties?.text?.type==='string'?'text':null};
    value.workflow=workflowFor(value);this.cache.set(cacheKey,{at:Date.now(),value});return value;
  }
  async createReplicate(job){
    const model=job.validatedModel||await this.model(job.model);
    validateInput(job.input,model.schema);
    job.version=model.version;
    const route=model.official?`/models/${model.id}/predictions`:'/predictions';
    const body={input:job.input,...(model.official?{}:{version:model.version})};
    if(job.webhook){body.webhook=job.webhook;body.webhook_events_filter=['completed'];}
    return this.request('replicate',route,{method:'POST',body,headers:{'Cancel-After':'10m'},timeout:45000});
  }
  async directImage(job){
    const p=job.provider,config=this.config(),v=job.options||{};
    const body=p==='openai'?{
      model:job.model||config.OPENAI_IMAGE_MODEL,prompt:job.prompt,n:1,
      size:v.size||'1536x1024',quality:v.quality||'low',output_format:'png'
    }:{
      model:job.model||config.XAI_IMAGE_MODEL,prompt:job.prompt,n:1,
      aspect_ratio:v.aspect_ratio||'16:9',response_format:'b64_json'
    };
    const refs=v.references||[];
    if(refs.length){
      if(p==='xai')return this.request(p,'/images/edits',{method:'POST',body:{...body,...(refs.length===1?{image:{url:refs[0]}}:{images:refs.map(url=>({url}))})},timeout:300000});
      const form=new FormData();for(const [k,val] of Object.entries(body))form.set(k,String(val));
      for(const [i,url] of refs.entries()){
        const bytes=Buffer.from(url.split(',')[1],'base64'),t=imageType(bytes);form.append('image[]',new Blob([bytes],{type:t.mime}),'reference-'+i+'.'+t.ext);
      }
      let res;try{res=await this.fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+this.key(p)},body:form,signal:AbortSignal.timeout(300000),redirect:'manual'});}catch{throw new LabError('Image-edit submission interrupted. Check provider history before retrying.',502,'submission_uncertain');}
      let data;try{data=await res.json();}catch{throw new LabError('Image edit did not return JSON.',502);}
      if(!res.ok)throw new LabError(sanitize(data?.error?.message||'Image edit rejected.',this.config()),res.status);
      return data;
    }
    return this.request(p,'/images/generations',{method:'POST',body,timeout:300000});
  }
  async downloadReplicate(url){
    if(!isDeliveryUrl(url))throw new LabError('The model returned an unsupported file host. Only Replicate delivery image outputs are imported by this POC.',422,'output_host_blocked');
    let target=url;
    for(let redirect=0;redirect<4;redirect++){
      if(!isDeliveryUrl(target))throw new LabError('Untrusted output redirect rejected.',422,'output_host_blocked');
      const res=await this.fetch(target,{headers:{Authorization:'Bearer '+this.key('replicate')},signal:AbortSignal.timeout(60000),redirect:'manual'});
      if([301,302,303,307,308].includes(res.status)){
        const location=res.headers.get('location');if(!location)throw new LabError('Output redirect is missing a target.');target=new URL(location,target).href;continue;
      }
      if(!res.ok)throw new LabError(`Image download returned HTTP ${res.status}. Keep the server open and use Retry download.`,502,'output_download_failed');
      if(Number(res.headers.get('content-length'))>32*1024*1024)throw new LabError('Generated image exceeds the 32 MB local limit.',413);
      const chunks=[];let size=0;
      for await(const chunk of res.body){size+=chunk.length;if(size>32*1024*1024)throw new LabError('Generated image exceeds the 32 MB local limit.',413);chunks.push(Buffer.from(chunk));}
      const bytes=Buffer.concat(chunks);imageType(bytes);return bytes;
    }
    throw new LabError('Too many output redirects.',502);
  }
  outputUrls(prediction){return flattenOutput(prediction.output);}
  async chat(provider,messages,model,onDelta,signal,options={}){
    return researchChat(this,provider,messages,model,onDelta,signal,options);
  }

}

function httpsUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function modelMetadata(m){
 const owner=typeof m.owner==='string'?m.owner:m.owner?.username||m.owner?.name||'';
 return {id:`${owner}/${m.name}`,name:m.name,owner,description:String(m.description||''),tag:m.visibility||'Model',url:httpsUrl(m.url)||`https://replicate.com/${owner}/${m.name}`,coverImageUrl:httpsUrl(m.cover_image_url),ownerAvatarUrl:httpsUrl(m.owner_avatar_url||m.owner?.avatar_url),runCount:Number.isSafeInteger(m.run_count)?m.run_count:null,updatedAt:m.latest_version?.created_at||null,licenseUrl:httpsUrl(m.license_url),paperUrl:httpsUrl(m.paper_url),githubUrl:httpsUrl(m.github_url),tags:Array.isArray(m.metadata?.tags)?m.metadata.tags.filter(x=>typeof x==='string').slice(0,12):[]};
}
