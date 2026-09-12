import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateOperationCost,resolvePricing,stalePricingEntries,XAI_USD_TICKS} from '../lib/provider-pricing.mjs';

const at='2026-09-13T00:00:00.000Z';
const estimate=event=>calculateOperationCost({startedAt:at,...event});

test('xAI exact ticks remain provider actuals and override catalog estimates',()=>{
  const cost=estimate({provider:'xai',model:'grok-4.6',usage:{cost_in_usd_ticks:77_880_000},inputTokens:999_999,outputTokens:999_999});
  assert.equal(XAI_USD_TICKS,10_000_000_000);assert.equal(cost.actualCostTicks,77_880_000);assert.equal(cost.estimatedCostNanos,null);assert.equal(cost.costBasis,'actual_provider');
});

test('xAI provider metadata supports missing actuals, long context, and served-model redirects',()=>{
  const pricing={id:'grok-4.6',aliases:['grok-latest'],prompt_text_token_price:20_000,cached_prompt_text_token_price:5_000,completion_text_token_price:60_000,prompt_text_token_price_long_context:40_000,cached_prompt_text_token_price_long_context:10_000,completion_text_token_price_long_context:120_000,long_context_threshold:200_000};
  const short=estimate({provider:'xai',model:'grok-latest',servedModel:'grok-4.6',inputTokens:100,cachedTokens:20,outputTokens:10,xaiPricing:pricing});assert.equal(short.costBasis,'estimated_formula');assert.equal(short.estimatedCostNanos,230_000);
  const long=estimate({provider:'xai',model:'grok-deprecated',servedModel:'grok-4.6',inputTokens:200_000,cachedTokens:0,outputTokens:1,xaiPricing:pricing});assert.equal(long.estimatedCostNanos,800_012_000);assert.equal(long.canonicalModel,'grok-4.6');
});

test('OpenAI text catalog handles cached input, long context, aliases, and reasoning without double charge',()=>{
  const normal=estimate({provider:'openai',model:'gpt-5.6',inputTokens:12_400,cachedTokens:3_000,outputTokens:1_200,reasoningTokens:800});assert.equal(normal.costBasis,'estimated_catalog');assert.equal(normal.estimatedCostNanos,62_800_000);assert.equal(normal.canonicalModel,'gpt-5.6-sol');
  const long=estimate({provider:'openai',model:'gpt-5.6-luna',inputTokens:300_000,cachedTokens:0,outputTokens:10_000});assert.equal(long.estimatedCostNanos,138_000_000);
  assert.equal(estimate({provider:'openai',model:'unknown-model',inputTokens:10,outputTokens:2}).costBasis,'unknown');
  assert.equal(estimate({provider:'openai',model:'gpt-6-astra',inputTokens:null,outputTokens:2}).costBasis,'unknown');
});

test('OpenAI image requests use image-specific matrices or modality tokens',()=>{
  const fixed=estimate({provider:'openai',model:'gpt-image-1.5',generatedOutputs:2,evidence:{quality:'low',size:'1024x1536'}});assert.equal(fixed.estimatedCostNanos,26_000_000);
  const token=estimate({provider:'openai',model:'gpt-image-2',inputTextTokens:1000,inputImageTokens:2000,cachedInputTextTokens:100,cachedInputImageTokens:500,imageOutputTokens:3000});assert.equal(token.estimatedCostNanos,53_812_500);
});

test('Replicate fixed-output and measured-megapixel formulas require authoritative evidence',()=>{
  for(const [model,count,nanos] of [['black-forest-labs/flux-schnell',2,6_000_000],['google/nano-banana',3,117_000_000],['ideogram-ai/ideogram-v3-turbo',2,60_000_000]])assert.equal(estimate({provider:'replicate',model,generatedOutputs:count}).estimatedCostNanos,nanos);
  const mp=estimate({provider:'replicate',model:'black-forest-labs/flux-2-pro',generatedOutputs:2,evidence:{inputMegapixels:[1,2],outputMegapixels:[1.5,1.5]}});assert.equal(mp.estimatedCostNanos,90_000_000);
  const textOnly=estimate({provider:'replicate',model:'black-forest-labs/flux-2-pro',evidence:{inputMegapixels:[],outputMegapixels:[2]}});assert.equal(textOnly.estimatedCostNanos,30_000_000);
  assert.equal(estimate({provider:'replicate',model:'black-forest-labs/flux-2-pro',generatedOutputs:1}).costBasis,'unknown');
  assert.match(estimate({provider:'replicate',model:'owner/unknown',generatedOutputs:1}).coverageReason,/Estimate unavailable/);
  assert.equal(estimate({provider:'replicate',model:'runtime/model',evidence:{predictTime:4}}).costBasis,'unknown');
});

test('catalogue and stock/search operations never masquerade as zero-cost inference',()=>{
  assert.equal(estimate({provider:'openai',operation:'model_discovery'}).costBasis,'not_applicable');
  assert.equal(estimate({provider:'google',operation:'image_search'}).costBasis,'not_applicable');
  assert.equal(estimate({provider:'pexels',operation:'stock_search'}).costBasis,'free_or_nonbillable_when_proven');
  assert.equal(estimate({provider:'unsplash',operation:'stock_result_used'}).costBasis,'not_applicable');
});

test('catalog entries are versioned and freshness checks warn without request failure',()=>{
  const rate=resolvePricing('openai','gpt-6-astra',at,'research_chat');assert.equal(rate.currency,'USD');assert.ok(rate.effectiveFrom);assert.ok(rate.sourceUrl.startsWith('https://'));assert.ok(rate.sourceCheckedAt);
  assert.equal(stalePricingEntries(new Date('2026-10-01T00:00:00Z')).length,0);assert.ok(stalePricingEntries(new Date('2027-01-01T00:00:00Z')).length>0);
});
