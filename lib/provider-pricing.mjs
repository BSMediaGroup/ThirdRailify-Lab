const USD_NANOS=1_000_000_000;
export const XAI_USD_TICKS=10_000_000_000;
export const PRICING_REVIEW_DAYS=45;
const CHECKED_AT='2026-09-13';

const openAiText=(id,model,aliases,input,cached,output,{cacheWrite=input*1.25,effectiveFrom='2026-09-13'}={})=>({
  id,provider:'openai',canonicalModel:model,aliases,effectiveFrom,effectiveTo:null,sourceUrl:'https://developers.openai.com/api/docs/pricing',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'1M tokens',formula:'text_tokens',input,cached,cacheWrite,output,longContext:{threshold:272000,inputMultiplier:2,cachedMultiplier:2,cacheWriteMultiplier:2,outputMultiplier:1.5},confidence:'official_catalog',coverage:'supported'
});

export const OPENAI_PRICING=Object.freeze([
  openAiText('openai-standard-gpt-6-astra-2026-09-13','gpt-6-astra',[],10,1,50),
  openAiText('openai-standard-gpt-5.6-sol-2026-09-13','gpt-5.6-sol',['gpt-5.6'],4,.4,20),
  openAiText('openai-standard-gpt-5.6-terra-2026-09-13','gpt-5.6-terra',[],2,.2,12),
  openAiText('openai-standard-gpt-5.6-luna-2026-09-13','gpt-5.6-luna',[],.2,.02,1.2),
  {id:'openai-image-gpt-image-2.5-2026-09-13',provider:'openai',canonicalModel:'gpt-image-2.5-sunburst',aliases:['gpt-image-2.5-sunburst-2026-09-08','gpt-image-2.5-flare'],effectiveFrom:'2026-09-08',effectiveTo:null,sourceUrl:'https://developers.openai.com/api/docs/pricing',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'1M image/text tokens',formula:'image_tokens',textInput:5,textCached:1.25,imageInput:8,imageCached:2,imageOutput:30,confidence:'official_catalog',coverage:'requires_modality_usage'},
  {id:'openai-image-gpt-image-2-2026-09-13',provider:'openai',canonicalModel:'gpt-image-2',aliases:['gpt-image-2-2026-04-21'],effectiveFrom:'2026-04-21',effectiveTo:null,sourceUrl:'https://developers.openai.com/api/docs/pricing',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'1M image/text tokens',formula:'image_tokens',textInput:2.5,textCached:.625,imageInput:4,imageCached:1,imageOutput:15,confidence:'official_catalog',coverage:'requires_modality_usage'},
  {id:'openai-image-gpt-image-1.5-2025-12-16',provider:'openai',canonicalModel:'gpt-image-1.5',aliases:['gpt-image-1.5-2025-12-16','chatgpt-image-latest'],effectiveFrom:'2025-12-16',effectiveTo:null,sourceUrl:'https://developers.openai.com/api/docs/models/gpt-image-1.5',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'output image',formula:'image_fixed_matrix',matrix:{low:{'1024x1024':.009,'1024x1536':.013,'1536x1024':.013},medium:{'1024x1024':.034,'1024x1536':.05,'1536x1024':.05},high:{'1024x1024':.133,'1024x1536':.2,'1536x1024':.2}},confidence:'official_catalog',coverage:'supported_matrix'},
  {id:'openai-image-gpt-image-1-2026-09-13',provider:'openai',canonicalModel:'gpt-image-1',aliases:[],effectiveFrom:'2026-09-13',effectiveTo:null,sourceUrl:'https://developers.openai.com/api/docs/models/gpt-image-1',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'output image',formula:'image_fixed_matrix',matrix:{low:{'1024x1024':.011,'1024x1536':.016,'1536x1024':.016},medium:{'1024x1024':.042,'1024x1536':.063,'1536x1024':.063},high:{'1024x1024':.167,'1024x1536':.25,'1536x1024':.25}},confidence:'official_catalog',coverage:'supported_matrix'}
]);

export const REPLICATE_PRICING=Object.freeze([
  {id:'replicate-flux-schnell-output-2026-09-13',provider:'replicate',canonicalModel:'black-forest-labs/flux-schnell',aliases:[],effectiveFrom:'2024-08-01',effectiveTo:null,sourceUrl:'https://replicate.com/black-forest-labs/flux-schnell/api/schema',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'output image',formula:'fixed_output',outputRate:.003,requiredEvidence:['generatedOutputs'],notes:'$3 per 1,000 output images.',confidence:'official_catalog',coverage:'supported'},
  {id:'replicate-nano-banana-output-2026-09-13',provider:'replicate',canonicalModel:'google/nano-banana',aliases:[],effectiveFrom:'2025-08-26',effectiveTo:null,sourceUrl:'https://replicate.com/google/nano-banana/api/schema',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'output image',formula:'fixed_output',outputRate:.039,requiredEvidence:['generatedOutputs'],notes:'One price per provider-reported output image.',confidence:'official_catalog',coverage:'supported'},
  {id:'replicate-ideogram-v3-turbo-output-2026-09-13',provider:'replicate',canonicalModel:'ideogram-ai/ideogram-v3-turbo',aliases:[],effectiveFrom:'2025-03-26',effectiveTo:null,sourceUrl:'https://replicate.com/ideogram-ai/ideogram-v3-turbo/api/schema',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'output image',formula:'fixed_output',outputRate:.03,requiredEvidence:['generatedOutputs'],notes:'One price per provider-reported output image.',confidence:'official_catalog',coverage:'supported'},
  {id:'replicate-flux-2-pro-mp-2025-11-25',provider:'replicate',canonicalModel:'black-forest-labs/flux-2-pro',aliases:[],effectiveFrom:'2025-11-25',effectiveTo:null,sourceUrl:'https://replicate.com/blog/run-flux-2-on-replicate',sourceCheckedAt:CHECKED_AT,currency:'USD',billingUnit:'input/output megapixel',formula:'input_output_megapixels',inputRate:.015,outputRate:.015,requiredEvidence:['inputMegapixels','outputMegapixels'],notes:'Requires measured dimensions for every input and output; requested presets alone are insufficient.',confidence:'official_catalog',coverage:'requires_measured_dimensions'}
]);

const validAt=(entry,timestamp)=>{const time=Date.parse(timestamp||new Date().toISOString());return Number.isFinite(time)&&time>=Date.parse(entry.effectiveFrom+'T00:00:00Z')&&(!entry.effectiveTo||time<Date.parse(entry.effectiveTo+'T00:00:00Z'));};
const findEntry=(entries,model,timestamp)=>entries.find(entry=>(entry.canonicalModel===model||entry.aliases.includes(model))&&validAt(entry,timestamp));
const whole=value=>value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const nanos=value=>Math.round(value*USD_NANOS);
const snapshot=entry=>({rateId:entry.id,canonicalModel:entry.canonicalModel,sourceUrl:entry.sourceUrl,sourceCheckedAt:entry.sourceCheckedAt,effectiveFrom:entry.effectiveFrom,effectiveTo:entry.effectiveTo,currency:entry.currency,billingUnit:entry.billingUnit,formula:entry.formula,confidence:entry.confidence,coverage:entry.coverage,notes:entry.notes||null});

export function xaiPricingSnapshot(metadata={},checkedAt=new Date().toISOString()){
  if(!metadata||typeof metadata!=='object'||!/^[a-zA-Z0-9_.:-]{1,180}$/.test(metadata.id||''))return null;
  const aliases=Array.isArray(metadata.aliases)?metadata.aliases.filter(x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,180}$/.test(x)).slice(0,30):[];
  const fields=['prompt_text_token_price','cached_prompt_text_token_price','completion_text_token_price','prompt_text_token_price_long_context','cached_prompt_text_token_price_long_context','completion_text_token_price_long_context','long_context_threshold','image_price'];
  const prices=Object.fromEntries(fields.map(key=>[key,whole(metadata[key])]).filter(([,value])=>value!==null));
  const pricing=Array.isArray(metadata.pricing)?metadata.pricing.slice(0,40).map(item=>({quality:String(item.quality||'').slice(0,40),resolution:String(item.resolution||'').slice(0,40),price:whole(item.price)})).filter(item=>item.price!==null):[];
  if(!Object.keys(prices).length&&!pricing.length)return null;
  return {rateId:`xai-live-${metadata.id}-${String(metadata.version||metadata.fingerprint||metadata.created||'current').replace(/[^\w.-]/g,'').slice(0,80)}`,provider:'xai',canonicalModel:metadata.id,aliases,sourceUrl:'https://docs.x.ai/developers/rest-api-reference/inference/models',sourceCheckedAt:checkedAt,currency:'USD',billingUnit:'provider ticks',formula:prices.image_price!==undefined||pricing.length?'image_provider_metadata':'text_provider_metadata',prices,pricing,confidence:'provider_metadata',coverage:'supported'};
}

export function resolvePricing(provider,model,timestamp,operation,{servedModel,xaiModel}={}){
  const pricedModel=servedModel||model;
  if(provider==='openai')return findEntry(OPENAI_PRICING,pricedModel,timestamp)||null;
  if(provider==='replicate')return findEntry(REPLICATE_PRICING,pricedModel,timestamp)||null;
  if(provider==='xai'&&xaiModel){const entry=xaiPricingSnapshot(xaiModel);return entry&&(entry.canonicalModel===pricedModel||entry.aliases.includes(pricedModel))?entry:null;}
  return null;
}

function nonBillable(event){
  if(event.operation==='model_discovery')return {costBasis:'not_applicable',coverageReason:'Provider catalogue lookup; not an inference operation.',calculation:'No inference request was submitted.'};
  if(event.provider==='google')return {costBasis:'not_applicable',coverageReason:'Google Standard Search Element activity is client-side Workshop activity, not JSON API billing.',calculation:'Local activity only; no provider monetary calculation.'};
  if(['stock_result_used','image_result_used'].includes(event.operation))return {costBasis:'not_applicable',coverageReason:'Local asset-use event; no new provider inference request.',calculation:'No provider request was submitted.'};
  if(['pexels','pixabay','unsplash'].includes(event.provider))return {costBasis:'free_or_nonbillable_when_proven',coverageReason:'The configured provider API publishes quota limits but no per-request monetary charge.',calculation:'Quota-counted API request; no monetary rate reported.'};
  return null;
}

function baseResult(event,extra={}){return {canonicalModel:event.servedModel||event.model||null,pricingRateId:null,pricingSnapshot:null,actualCostTicks:null,estimatedCostNanos:null,costBasis:'unknown',coverageReason:'No authoritative cost or supported pricing evidence was available.',calculation:null,...extra};}

export function calculateOperationCost(event={}){
  const nonbillable=nonBillable(event);if(nonbillable)return baseResult(event,nonbillable);
  const exactTicks=whole(event.actualCostTicks??event.usage?.cost_in_usd_ticks??event.response?.usage?.cost_in_usd_ticks??event.response?.cost_in_usd_ticks);
  if(event.provider==='xai'&&exactTicks!==null)return baseResult(event,{actualCostTicks:exactTicks,costBasis:'actual_provider',coverageReason:'Exact provider-reported xAI request cost.',calculation:`${exactTicks.toLocaleString('en-US')} provider ticks ÷ ${XAI_USD_TICKS.toLocaleString('en-US')} ticks/USD`});
  if(finite(event.providerCost)!==null)return baseResult(event,{actualCostTicks:Math.round(event.providerCost*XAI_USD_TICKS),costBasis:'actual_provider',coverageReason:'Provider-reported monetary cost.',calculation:`Provider reported $${event.providerCost} USD`});
  if(whole(event.providerCostMicros)!==null)return baseResult(event,{actualCostTicks:whole(event.providerCostMicros)*10_000,costBasis:'actual_provider',coverageReason:'Provider-reported monetary cost.',calculation:`${whole(event.providerCostMicros).toLocaleString('en-US')} USD micros`});
  const entry=resolvePricing(event.provider,event.model,event.startedAt||new Date().toISOString(),event.operation,{servedModel:event.servedModel,xaiModel:event.xaiPricing});
  if(!entry)return baseResult(event,{coverageReason:event.provider==='replicate'?'Estimate unavailable: this exact Replicate model has no reviewed pricing entry.':'No pricing version matches the served model and operation timestamp.'});
  let amount=null,calculation='',coverageReason='Complete estimate from a versioned official pricing entry.';
  if(entry.formula==='fixed_output'){
    const count=whole(event.generatedOutputs);if(!count)return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.id,pricingSnapshot:snapshot(entry),coverageReason:'Output count is missing; fixed per-image pricing cannot be inferred.'});
    amount=count*entry.outputRate;calculation=`${count} output${count===1?'':'s'} × $${entry.outputRate}/image`;
  }else if(entry.formula==='input_output_megapixels'){
    const hasInputs=Array.isArray(event.evidence?.inputMegapixels),hasOutputs=Array.isArray(event.evidence?.outputMegapixels),inputs=hasInputs?event.evidence.inputMegapixels.map(finite):[],outputs=hasOutputs?event.evidence.outputMegapixels.map(finite):[];
    if(!hasInputs||inputs.includes(null)||!hasOutputs||!outputs.length||outputs.includes(null))return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.id,pricingSnapshot:snapshot(entry),coverageReason:'Measured dimensions for every input and output are required for this megapixel formula.'});
    const inputTotal=inputs.reduce((a,b)=>a+b,0),outputTotal=outputs.reduce((a,b)=>a+b,0);amount=inputTotal*entry.inputRate+outputTotal*entry.outputRate;calculation=`${inputTotal.toFixed(4)} input MP × $${entry.inputRate}/MP + ${outputTotal.toFixed(4)} output MP × $${entry.outputRate}/MP`;
  }else if(entry.formula==='text_tokens'){
    const input=whole(event.inputTokens),output=whole(event.outputTokens),cached=whole(event.cachedTokens)??0,cacheWrite=whole(event.cacheWriteTokens)??0;
    if(input===null||output===null||cached+cacheWrite>input)return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.id,pricingSnapshot:snapshot(entry),coverageReason:'Required input/output token categories are incomplete.'});
    const long=input>entry.longContext.threshold,m=long?entry.longContext:{inputMultiplier:1,cachedMultiplier:1,cacheWriteMultiplier:1,outputMultiplier:1};
    const uncached=input-cached-cacheWrite,toolTypes=Array.isArray(event.evidence?.toolTypes)?event.evidence.toolTypes:[],webCalls=toolTypes.filter(x=>x==='web_search_call').length,unsupportedTools=toolTypes.filter(x=>!['web_search_call'].includes(x));
    amount=(uncached*entry.input*m.inputMultiplier+cached*entry.cached*m.cachedMultiplier+cacheWrite*entry.cacheWrite*m.cacheWriteMultiplier+output*entry.output*m.outputMultiplier)/1_000_000+webCalls*.01;
    calculation=`Input ${uncached.toLocaleString('en-US')} × $${entry.input*m.inputMultiplier}/M; cached ${cached.toLocaleString('en-US')} × $${entry.cached*m.cachedMultiplier}/M; output ${output.toLocaleString('en-US')} × $${entry.output*m.outputMultiplier}/M${webCalls?`; web search ${webCalls} × $0.01`:''}`;
    if(unsupportedTools.length){coverageReason=`Partial estimate: ${[...new Set(unsupportedTools)].join(', ')} pricing lacks the required per-operation evidence.`;}
  }else if(entry.formula==='image_fixed_matrix'){
    const count=whole(event.generatedOutputs),quality=String(event.evidence?.quality||'').toLowerCase(),size=String(event.evidence?.size||''),rate=entry.matrix[quality]?.[size];
    if(!count||rate===undefined)return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.id,pricingSnapshot:snapshot(entry),coverageReason:'Image count, supported quality, or output size is missing.'});
    amount=count*rate;calculation=`${count} output${count===1?'':'s'} × $${rate}/${quality} ${size} image`;
  }else if(entry.formula==='image_tokens'){
    const text=whole(event.inputTextTokens),image=whole(event.inputImageTokens),output=whole(event.imageOutputTokens??event.outputTokens),cachedText=whole(event.cachedInputTextTokens)??0,cachedImage=whole(event.cachedInputImageTokens)??0;
    if(text===null||image===null||output===null||cachedText>text||cachedImage>image)return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.id,pricingSnapshot:snapshot(entry),coverageReason:'Modality-specific image usage is incomplete.'});
    amount=((text-cachedText)*entry.textInput+cachedText*entry.textCached+(image-cachedImage)*entry.imageInput+cachedImage*entry.imageCached+output*entry.imageOutput)/1_000_000;calculation=`Text input ${text.toLocaleString('en-US')}; image input ${image.toLocaleString('en-US')}; image output ${output.toLocaleString('en-US')} tokens`;
  }else if(entry.formula==='text_provider_metadata'){
    const input=whole(event.inputTokens),output=whole(event.outputTokens),cached=whole(event.cachedTokens)??0,threshold=whole(entry.prices.long_context_threshold)??Number.MAX_SAFE_INTEGER;
    if(input===null||output===null||cached>input)return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.rateId,pricingSnapshot:entry,coverageReason:'Required xAI token categories are incomplete.'});
    const long=input>=threshold,inputRate=entry.prices[long?'prompt_text_token_price_long_context':'prompt_text_token_price'],cachedRate=entry.prices[long?'cached_prompt_text_token_price_long_context':'cached_prompt_text_token_price'],outputRate=entry.prices[long?'completion_text_token_price_long_context':'completion_text_token_price'];
    if(!Number.isSafeInteger(inputRate)||!Number.isSafeInteger(cachedRate)||!Number.isSafeInteger(outputRate))return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.rateId,pricingSnapshot:entry,coverageReason:'The xAI pricing metadata lacks a required rate.'});
    const ticks=(input-cached)*inputRate+cached*cachedRate+output*outputRate;amount=ticks/XAI_USD_TICKS;calculation=`Provider metadata: ${input-cached} input, ${cached} cached, ${output} output tokens${long?' at long-context rates':''}`;
  }else if(entry.formula==='image_provider_metadata'){
    const count=whole(event.generatedOutputs),quality=String(event.evidence?.quality||''),resolution=String(event.evidence?.resolution||event.evidence?.size||'');let ticks=entry.prices.image_price;
    if(entry.pricing.length){ticks=entry.pricing.find(row=>row.quality===quality&&row.resolution===resolution)?.price;}
    if(!count||!Number.isSafeInteger(ticks))return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.rateId,pricingSnapshot:entry,coverageReason:'The xAI image pricing metadata does not match the requested tier.'});
    amount=count*ticks/XAI_USD_TICKS;calculation=`${count} output${count===1?'':'s'} × ${ticks.toLocaleString('en-US')} provider ticks`;
  }
  if(amount===null||!Number.isFinite(amount))return baseResult(event);
  return baseResult(event,{canonicalModel:entry.canonicalModel,pricingRateId:entry.id||entry.rateId,pricingSnapshot:entry.rateId?entry:snapshot(entry),estimatedCostNanos:nanos(amount),costBasis:entry.formula?.includes('provider_metadata')?'estimated_formula':'estimated_catalog',coverageReason,calculation});
}

export function stalePricingEntries(asOf=new Date(),reviewDays=PRICING_REVIEW_DAYS){const cutoff=asOf.getTime()-reviewDays*86400000;return [...OPENAI_PRICING,...REPLICATE_PRICING].filter(entry=>!entry.effectiveTo&&Date.parse(entry.sourceCheckedAt+'T00:00:00Z')<cutoff);}
export function reconciliationCapabilities(env={}){return {openaiAdminCosts:Boolean(env.OPENAI_ADMIN_API_KEY),xaiManagementBilling:Boolean(env.XAI_MANAGEMENT_API_KEY),mode:'operation_level'};}
