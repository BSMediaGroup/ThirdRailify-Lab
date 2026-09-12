import {LabError} from './core.mjs';
import {dbOf,id,now} from './storage.mjs';
import {calculateOperationCost,reconciliationCapabilities} from './provider-pricing.mjs';

const PROVIDERS=new Set(['replicate','openai','xai','pexels','pixabay','unsplash','google']);
const integer=value=>value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const moneyMicros=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value*1_000_000):null;
const safeId=value=>String(value||'').replace(/[^\w:.-]/g,'').slice(0,200)||null;
const safeModel=value=>String(value||'').replace(/[^\w:./-]/g,'').slice(0,180)||null;
const safeJson=(value,limit=8000)=>JSON.stringify(value&&typeof value==='object'?value:{}).slice(0,limit);
const categoryFor=event=>event.usageCategory||(event.operation==='model_discovery'?'model_discovery':event.operation==='research_chat'||event.operation==='image_generation'?'inference':event.operation?.includes('search')?'search':event.operation?.includes('result_used')?'asset_use':'provider_operation');

export async function recordUsage(env,event){
  const provider=String(event.provider||'').toLowerCase();
  if(!PROVIDERS.has(provider))throw new LabError('Unsupported usage provider.');
  const timestamp=event.startedAt||now(),key=String(event.idempotencyKey||'').slice(0,240);
  if(!key)throw new LabError('Usage idempotency key required.');
  const usage=usageFromResponse(event.usage||{});
  const source={...usage,...event,provider,startedAt:timestamp};
  const cost=calculateOperationCost(source);
  const values={
    inputTokens:integer(event.inputTokens??usage.inputTokens),outputTokens:integer(event.outputTokens??usage.outputTokens),cachedTokens:integer(event.cachedTokens??usage.cachedTokens),reasoningTokens:integer(event.reasoningTokens??usage.reasoningTokens),
    inputTextTokens:integer(event.inputTextTokens??usage.inputTextTokens),inputImageTokens:integer(event.inputImageTokens??usage.inputImageTokens),cachedInputTextTokens:integer(event.cachedInputTextTokens??usage.cachedInputTextTokens),cachedInputImageTokens:integer(event.cachedInputImageTokens??usage.cachedInputImageTokens),imageOutputTokens:integer(event.imageOutputTokens??usage.imageOutputTokens),cacheWriteTokens:integer(event.cacheWriteTokens??usage.cacheWriteTokens),
    generatedOutputs:integer(event.generatedOutputs),searchCount:integer(event.searchCount),toolCalls:integer(event.toolCalls),rateLimitLimit:integer(event.rateLimitLimit),rateLimitRemaining:integer(event.rateLimitRemaining)
  };
  const actualTicks=integer(cost.actualCostTicks),estimatedNanos=integer(cost.estimatedCostNanos);
  const providerCostMicros=event.providerCostMicros??(actualTicks!==null?Math.round(actualTicks/10_000):moneyMicros(event.providerCost));
  const estimatedCostMicros=event.estimatedCostMicros??(estimatedNanos!==null?Math.round(estimatedNanos/1_000):moneyMicros(event.estimatedCost));
  const costState=cost.costBasis==='actual_provider'?'actual':cost.costBasis.startsWith('estimated_')?'estimated':'unknown';
  const metadata={...(event.metadata&&typeof event.metadata==='object'?event.metadata:{}),evidence:event.evidence||undefined};
  await dbOf(env).prepare(`INSERT INTO provider_usage_events(
    id,idempotency_key,owner_id,project_id,job_id,conversation_id,provider,key_profile_id,key_fingerprint,model,operation,started_at,completed_at,outcome,provider_request_id,
    input_tokens,output_tokens,cached_tokens,reasoning_tokens,generated_outputs,search_count,tool_calls,provider_cost_micros,estimated_cost_micros,cost_state,cache_status,rate_limit_limit,rate_limit_remaining,rate_limit_reset,safe_metadata_json,
    logical_request_id,served_model,input_text_tokens,input_image_tokens,cached_input_text_tokens,cached_input_image_tokens,image_output_tokens,cache_write_tokens,actual_cost_ticks,estimated_cost_nanos,cost_currency,cost_basis,pricing_rate_id,pricing_snapshot_json,coverage_reason,usage_category,calculation_text)
    VALUES(${Array(47).fill('?').join(',')})
    ON CONFLICT(idempotency_key) DO UPDATE SET
      completed_at=excluded.completed_at,outcome=excluded.outcome,
      provider_request_id=COALESCE(excluded.provider_request_id,provider_usage_events.provider_request_id),served_model=COALESCE(excluded.served_model,provider_usage_events.served_model),
      input_tokens=COALESCE(excluded.input_tokens,provider_usage_events.input_tokens),output_tokens=COALESCE(excluded.output_tokens,provider_usage_events.output_tokens),cached_tokens=COALESCE(excluded.cached_tokens,provider_usage_events.cached_tokens),reasoning_tokens=COALESCE(excluded.reasoning_tokens,provider_usage_events.reasoning_tokens),
      input_text_tokens=COALESCE(excluded.input_text_tokens,provider_usage_events.input_text_tokens),input_image_tokens=COALESCE(excluded.input_image_tokens,provider_usage_events.input_image_tokens),cached_input_text_tokens=COALESCE(excluded.cached_input_text_tokens,provider_usage_events.cached_input_text_tokens),cached_input_image_tokens=COALESCE(excluded.cached_input_image_tokens,provider_usage_events.cached_input_image_tokens),image_output_tokens=COALESCE(excluded.image_output_tokens,provider_usage_events.image_output_tokens),cache_write_tokens=COALESCE(excluded.cache_write_tokens,provider_usage_events.cache_write_tokens),
      generated_outputs=COALESCE(excluded.generated_outputs,provider_usage_events.generated_outputs),search_count=COALESCE(excluded.search_count,provider_usage_events.search_count),tool_calls=COALESCE(excluded.tool_calls,provider_usage_events.tool_calls),
      provider_cost_micros=COALESCE(excluded.provider_cost_micros,provider_usage_events.provider_cost_micros),estimated_cost_micros=CASE WHEN excluded.actual_cost_ticks IS NOT NULL THEN NULL ELSE COALESCE(provider_usage_events.estimated_cost_micros,excluded.estimated_cost_micros) END,
      actual_cost_ticks=COALESCE(excluded.actual_cost_ticks,provider_usage_events.actual_cost_ticks),estimated_cost_nanos=CASE WHEN excluded.actual_cost_ticks IS NOT NULL THEN NULL ELSE COALESCE(provider_usage_events.estimated_cost_nanos,excluded.estimated_cost_nanos) END,
      cost_state=CASE WHEN provider_usage_events.actual_cost_ticks IS NOT NULL OR excluded.actual_cost_ticks IS NOT NULL THEN 'actual' ELSE excluded.cost_state END,
      cost_basis=CASE WHEN provider_usage_events.actual_cost_ticks IS NOT NULL OR excluded.actual_cost_ticks IS NOT NULL THEN 'actual_provider' WHEN provider_usage_events.estimated_cost_nanos IS NOT NULL THEN provider_usage_events.cost_basis ELSE excluded.cost_basis END,
      pricing_rate_id=CASE WHEN excluded.actual_cost_ticks IS NOT NULL THEN NULL ELSE COALESCE(provider_usage_events.pricing_rate_id,excluded.pricing_rate_id) END,pricing_snapshot_json=CASE WHEN excluded.actual_cost_ticks IS NOT NULL THEN NULL ELSE COALESCE(provider_usage_events.pricing_snapshot_json,excluded.pricing_snapshot_json) END,
      coverage_reason=CASE WHEN excluded.actual_cost_ticks IS NOT NULL THEN excluded.coverage_reason WHEN provider_usage_events.actual_cost_ticks IS NOT NULL OR provider_usage_events.estimated_cost_nanos IS NOT NULL THEN provider_usage_events.coverage_reason ELSE excluded.coverage_reason END,
      calculation_text=CASE WHEN excluded.actual_cost_ticks IS NOT NULL THEN excluded.calculation_text WHEN provider_usage_events.actual_cost_ticks IS NOT NULL OR provider_usage_events.estimated_cost_nanos IS NOT NULL THEN provider_usage_events.calculation_text ELSE excluded.calculation_text END,
      cache_status=COALESCE(excluded.cache_status,provider_usage_events.cache_status),rate_limit_limit=COALESCE(excluded.rate_limit_limit,provider_usage_events.rate_limit_limit),rate_limit_remaining=COALESCE(excluded.rate_limit_remaining,provider_usage_events.rate_limit_remaining),rate_limit_reset=COALESCE(excluded.rate_limit_reset,provider_usage_events.rate_limit_reset),safe_metadata_json=excluded.safe_metadata_json`).bind(
    id(),key,String(event.ownerId||''),event.projectId||null,event.jobId||null,event.conversationId||null,provider,event.profileId||null,event.fingerprint||null,String(event.model||'').slice(0,180)||null,String(event.operation||'request').slice(0,80),timestamp,event.completedAt||now(),String(event.outcome||'unknown').slice(0,40),safeId(event.providerRequestId),
    values.inputTokens,values.outputTokens,values.cachedTokens,values.reasoningTokens,values.generatedOutputs,values.searchCount,values.toolCalls,providerCostMicros,estimatedCostMicros,costState,event.cacheStatus||null,values.rateLimitLimit,values.rateLimitRemaining,event.rateLimitReset?String(event.rateLimitReset).slice(0,80):null,safeJson(metadata),
    safeId(event.logicalRequestId||event.jobId||event.conversationId||event.providerRequestId||key),safeModel(event.servedModel),values.inputTextTokens,values.inputImageTokens,values.cachedInputTextTokens,values.cachedInputImageTokens,values.imageOutputTokens,values.cacheWriteTokens,actualTicks,estimatedNanos,'USD',cost.costBasis,cost.pricingRateId,cost.pricingSnapshot?safeJson(cost.pricingSnapshot,12000):null,cost.coverageReason,categoryFor(event),cost.calculation
  ).run();
}

export function usageFromResponse(usage={}){
  const inputDetails=usage.input_tokens_details||usage.prompt_tokens_details||{};
  const outputDetails=usage.output_tokens_details||usage.completion_tokens_details||{};
  return {
    inputTokens:integer(usage.input_tokens??usage.prompt_tokens),outputTokens:integer(usage.output_tokens??usage.completion_tokens),cachedTokens:integer(inputDetails.cached_tokens),reasoningTokens:integer(outputDetails.reasoning_tokens),
    inputTextTokens:integer(inputDetails.text_tokens),inputImageTokens:integer(inputDetails.image_tokens),cachedInputTextTokens:integer(inputDetails.cached_text_tokens),cachedInputImageTokens:integer(inputDetails.cached_image_tokens),imageOutputTokens:integer(outputDetails.image_tokens),cacheWriteTokens:integer(inputDetails.cache_write_tokens)
  };
}
export function providerCostFields(value={}){
  const ticks=integer(value.usage?.cost_in_usd_ticks??value.cost_in_usd_ticks);
  if(ticks!==null)return {actualCostTicks:ticks};
  const amount=value.cost??value.total_cost??value.usage?.cost??value.usage?.total_cost;
  return typeof amount==='number'&&Number.isFinite(amount)&&amount>=0?{providerCost:amount}:{ };
}
export function rateFields(headers){return {rateLimitLimit:integer(headers?.get?.('x-ratelimit-limit')),rateLimitRemaining:integer(headers?.get?.('x-ratelimit-remaining')),rateLimitReset:headers?.get?.('x-ratelimit-reset')||null};}

const RANGE={"24h":{ms:86400000,bucket:3600000},"7d":{ms:7*86400000,bucket:6*3600000},"30d":{ms:30*86400000,bucket:86400000},"90d":{ms:90*86400000,bucket:7*86400000}};
const metricFields=`count(*) requests,COALESCE(sum(input_tokens),0)+COALESCE(sum(output_tokens),0) tokens,COALESCE(sum(generated_outputs),0) outputs,COALESCE(sum(search_count),0) searches,COALESCE(sum(tool_calls),0) tool_calls,COALESCE(sum(actual_cost_ticks),0) actual_ticks,COALESCE(sum(estimated_cost_nanos),0) estimated_nanos,sum(CASE WHEN cost_basis='actual_provider' THEN 1 ELSE 0 END) actual_count,sum(CASE WHEN cost_basis IN ('estimated_catalog','estimated_formula') THEN 1 ELSE 0 END) estimated_count,sum(CASE WHEN cost_basis='unknown' THEN 1 ELSE 0 END) unknown_count`;

export async function usageDashboard(env,auth,url){
  const range=RANGE[url.searchParams.get('range')]?url.searchParams.get('range'):'30d',settings=RANGE[range],sinceMs=Date.now()-settings.ms,since=new Date(sinceMs).toISOString(),params=[since],where=['started_at>=?'];
  const provider=url.searchParams.get('provider');if(provider&&PROVIDERS.has(provider)){where.push('provider=?');params.push(provider);}
  const model=String(url.searchParams.get('model')||'').slice(0,180);if(model){where.push('COALESCE(served_model,model)=?');params.push(model);}
  const profile=String(url.searchParams.get('profile')||'').slice(0,100);if(profile){where.push('key_profile_id=?');params.push(profile);}
  let accountId=auth.owner;if(url.searchParams.get('account')&&auth.policy.canManageProviders)accountId=String(url.searchParams.get('account')).slice(0,100);where.push('owner_id=?');params.push(accountId);
  const clause=where.join(' AND '),db=dbOf(env),bucketSeconds=Math.round(settings.bucket/1000);
  const [summary,providers,buckets,recent,storage]=await Promise.all([
    db.prepare(`SELECT ${metricFields} FROM provider_usage_events WHERE ${clause}`).bind(...params).first(),
    db.prepare(`SELECT provider,${metricFields},min(rate_limit_remaining) rate_remaining,max(rate_limit_limit) rate_limit FROM provider_usage_events WHERE ${clause} GROUP BY provider ORDER BY requests DESC`).bind(...params).all(),
    db.prepare(`SELECT datetime((CAST(strftime('%s',started_at) AS INTEGER)/?)*?,'unixepoch') bucket,provider,COALESCE(served_model,model) model,${metricFields} FROM provider_usage_events WHERE ${clause} GROUP BY bucket,provider,COALESCE(served_model,model) ORDER BY bucket`).bind(bucketSeconds,bucketSeconds,...params).all(),
    db.prepare(`SELECT provider,model,served_model,operation,outcome,cost_state,cost_basis,actual_cost_ticks,estimated_cost_nanos,pricing_rate_id,pricing_snapshot_json,coverage_reason,calculation_text,started_at,completed_at,key_profile_id,input_tokens,output_tokens,cached_tokens,generated_outputs,search_count,tool_calls,usage_category FROM provider_usage_events WHERE ${clause} ORDER BY started_at DESC LIMIT 50`).bind(...params).all(),
    db.prepare("SELECT count(*) files,COALESCE(sum(CAST(json_extract(metadata,'$.bytes') AS INTEGER)),0) bytes FROM files WHERE owner_id=? AND status='ready'").bind(accountId).first()
  ]);
  const grouped=new Map();for(const row of buckets.results||[]){const entry=grouped.get(row.bucket)||{bucket:row.bucket,requests:0,tokens:0,outputs:0,searches:0,tool_calls:0,actual_ticks:0,estimated_nanos:0,unknown_count:0,breakdown:[]};for(const field of ['requests','tokens','outputs','searches','tool_calls','actual_ticks','estimated_nanos','unknown_count'])entry[field]+=Number(row[field]||0);entry.breakdown.push({provider:row.provider,model:row.model,requests:Number(row.requests||0),tokens:Number(row.tokens||0),outputs:Number(row.outputs||0),searches:Number(row.searches||0),tool_calls:Number(row.tool_calls||0),actual_ticks:Number(row.actual_ticks||0),estimated_nanos:Number(row.estimated_nanos||0)});grouped.set(row.bucket,entry);}
  const total=Number(summary?.requests||0),unknown=Number(summary?.unknown_count||0);return {range,accountId,bucketSeconds,summary:{...summary,pricing_coverage_percent:total?Math.round((total-unknown)*10000/total)/100:100},providers:providers.results||[],series:[...grouped.values()],recent:recent.results||[],storage,reconciliation:reconciliationCapabilities(env)};
}
