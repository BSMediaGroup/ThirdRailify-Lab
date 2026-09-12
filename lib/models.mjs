import {LabError,sanitize} from './core.mjs';

export function modelKind(provider,id,metadata={}) {
  const outputs=metadata.output_modalities;
  if(Array.isArray(outputs)&&outputs.includes('image'))return 'image';
  if(Array.isArray(outputs)&&outputs.includes('text'))return 'chat';
  // OpenAI's /models is an ID catalogue, not a capability schema. These are
  // compatibility filters, not an invented list of available model IDs.
  if(provider==='openai'){
    if(/^gpt-image[-\d]/i.test(id))return 'image';
    if(/^(?:gpt-\d|chatgpt-\d|o[1-9](?:-|$))/i.test(id)&&!/(?:image|audio|realtime|transcri|tts|search|codex|computer-use)/i.test(id))return 'chat';
  } else if(provider==='xai') {
    if(/image/i.test(id)&&!/(?:vision|understand)/i.test(id))return 'image';
    if(/^grok-/i.test(id)&&!/(?:image|video|audio|voice|embed)/i.test(id))return 'chat';
  }
  return 'other';
}
export class ModelCatalog {
  constructor(providers){this.providers=providers;this.cache=new Map();this.inflight=new Map();}
  clear(){this.cache.clear();}
  async list(provider,kind,{refresh=false}={}) {
    if(!['openai','xai'].includes(provider)||!['image','chat'].includes(kind))throw new LabError('Choose an image or chat catalogue for GPT or Grok.');
    this.providers.key(provider);
    const key=provider+':'+kind,old=this.cache.get(key);
    if(!refresh&&old&&Date.now()-old.fetchedMs<300000)return {...old,source:'cache'};
    if(this.inflight.has(key))return this.inflight.get(key);
    const run=(async()=>{
      try{
        const route=provider==='xai'?(kind==='image'?'/image-generation-models':'/language-models'):'/models';
        let response,typed=provider==='xai';
        try { response=await this.providers.request(provider,route); }
        catch(e){if(provider==='xai'&&[404,405].includes(e.status)){response=await this.providers.request(provider,'/models');typed=false;}else throw e;}
        const list=response.models||response.data;
        if(!Array.isArray(list))throw new LabError('Model catalogue response was not a model list.',502,'catalog_invalid');
        const all=new Map();
        for(const item of list.slice(0,4000)){
          const id=typeof item==='string'?item:item.id;
          if(!/^[a-zA-Z0-9_.:-]{1,180}$/.test(id||''))continue;
          const metadata=typeof item==='string'?{}:item;
          const detected=typed?kind:modelKind(provider,id,metadata);
          if(detected!==kind)continue;
          all.set(id,{id,label:metadata.name||id,kind,created:Number(metadata.created)||0,classification:typed?'provider-metadata':'id-compatibility-filter'});
          for(const alias of metadata.aliases||[])if(typeof alias==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(alias)&&!all.has(alias))all.set(alias,{id:alias,label:alias,kind,created:Number(metadata.created)||0,classification:'provider-alias'});
        }
        const items=[...all.values()].sort((a,b)=>b.created-a.created||a.id.localeCompare(b.id,undefined,{numeric:true}));
        const result={provider,kind,items,source:'live',fetchedAt:new Date().toISOString(),fetchedMs:Date.now(),warning:provider==='openai'?'Listed by your API key; compatibility is filtered by model ID. Model-specific access and options are checked by the provider on submission.':null};
        this.cache.set(key,result);return result;
      }catch(e){
        // A rejected key must not make cached choices appear authenticated.
        if(old&&![401,403].includes(e.status))return {...old,source:'stale',warning:'Catalogue refresh failed; showing the previous list. '+sanitize(e.message,this.providers.config())};
        throw e;
      }
    })();
    this.inflight.set(key,run);try{return await run;}finally{this.inflight.delete(key);}
  }
}
