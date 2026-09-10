import {LabError,CATALOG,parseModel,normalizeInputSchema,validateInput,isDeliveryUrl,imageType,sanitize,flattenOutput} from './core.mjs';

export class Providers {
  constructor(getConfig,fetchImpl=globalThis.fetch){this.config=getConfig;this.fetch=fetchImpl;this.cache=new Map();}
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
      res=await this.fetch(base+route,{method,headers:{Authorization:'Bearer '+key,...(body!==undefined?{'Content-Type':typeof body==='string'?'text/plain':'application/json'}:{}),...headers},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body)),signal:signal||AbortSignal.timeout(timeout),redirect:'error'});
    }catch(e){throw new LabError(method==='POST'?'Provider submission was interrupted. It may have been accepted; check your provider dashboard before generating again.':'Cannot reach the provider. Check your connection and try again.',502,method==='POST'?'submission_uncertain':'provider_network');}
    const text=await res.text();let json;
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
    return (data.results||[]).slice(0,30).map(m=>({id:`${m.owner}/${m.name}`,name:m.name,description:m.description||'',tag:m.visibility||'Model',url:m.url}));
  }
  async model(ref){
    const parsed=parseModel(ref),cacheKey=parsed.id+(parsed.version?':'+parsed.version:'');
    const cached=this.cache.get(cacheKey);if(cached&&Date.now()-cached.at<300000)return cached.value;
    const model=await this.request('replicate','/models/'+parsed.id);
    const version=parsed.version?await this.request('replicate',`/models/${parsed.id}/versions/${parsed.version}`):model.latest_version;
    const doc=version?.openapi_schema;
    if(!doc?.components?.schemas?.Input)throw new LabError('This model has no readable input schema. Try another model/version or check model access.',422,'schema_unavailable');
    const schema=normalizeInputSchema(doc);
    const value={id:parsed.id,ref:cacheKey,name:model.name,description:model.description||'',version:version.id,official:!parsed.version&&Boolean(model.is_official||CATALOG.find(m=>m.id===parsed.id)?.official),schema,rawSchema:doc,url:`https://replicate.com/${parsed.id}`,licenseUrl:model.license_url||null,promptKey:schema.properties?.prompt?'prompt':schema.properties?.text?'text':null};
    this.cache.set(cacheKey,{at:Date.now(),value});return value;
  }
  async createReplicate(job){
    const model=await this.model(job.model);
    validateInput(job.input,model.schema);
    job.version=model.version;
    const route=model.official?`/models/${model.id}/predictions`:'/predictions';
    const body={input:job.input,...(model.official?{}:{version:model.version})};
    // Deliberately asynchronous. No webhook/tunnel needed for the local prototype.
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
  async chat(provider,messages,model,onDelta,signal){
    const key=this.key(provider),base=provider==='openai'?'https://api.openai.com/v1':'https://api.x.ai/v1';
    const body={model,input:[{role:'system',content:'You are the Third Railify Lab creative research assistant. Help develop image prompts, thumbnail concepts and research questions. This POC has NO web search tool: do not claim to browse, verify live facts or access the canvas. Say when external verification is needed. Never present hidden chain-of-thought.'},...messages],stream:true,store:false,max_output_tokens:3000};
    let res;
    try{res=await this.fetch(base+'/responses',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});}catch(e){throw new LabError('Chat connection interrupted. Any provider work already performed may still be billed.',502,'chat_network');}
    if(!res.ok){let b;try{b=await res.json();}catch{}throw new LabError(sanitize(b?.error?.message||`Chat returned HTTP ${res.status}. Check model access, billing and key.`,this.config()),res.status);}
    const decoder=new TextDecoder();let buffer='',text='',completed=false;
    for await(const chunk of res.body){
      buffer+=decoder.decode(chunk,{stream:true});
      let end;
      while((end=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);
        if(!line.startsWith('data:'))continue;
        const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;
        let event;try{event=JSON.parse(raw);}catch{continue;}
        if(event.type==='response.output_text.delta'&&typeof event.delta==='string'){text+=event.delta;onDelta(event.delta);}
        if(event.type==='response.completed')completed=true;
        if(event.type==='error'||event.type==='response.failed')throw new LabError(sanitize(event.error?.message||event.response?.error?.message||event.message||'Chat failed.',this.config()),502);
      }
    }
    if(!text)throw new LabError('The model returned no text. Check the selected model and output limits.',502);
    return {completed,text};
  }
}
