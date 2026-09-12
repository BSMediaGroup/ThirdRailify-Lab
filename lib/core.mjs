
import {randomUUID, createHmac, timingSafeEqual} from 'node:crypto';


export class LabError extends Error {
  constructor(message, status=400, code='invalid_request', retryAfter=0) {
    super(message); this.status=status; this.code=code; this.retryAfter=retryAfter;
  }
}
export const DEFAULTS = {
  REPLICATE_API_TOKEN:'', OPENAI_API_KEY:'', XAI_API_KEY:'',
  GOOGLE_CUSTOM_SEARCH_API_KEY:'', GOOGLE_CUSTOM_SEARCH_CX:'',
  // Optional saved preferences only. Model choices come from provider catalogues.
  OPENAI_IMAGE_MODEL:'', OPENAI_CHAT_MODEL:'',
  XAI_IMAGE_MODEL:'', XAI_CHAT_MODEL:'',
  REPLICATE_WEBHOOK_SIGNING_SECRET:'', PORT:'4317'
};
export const SECRET_KEYS = ['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY','REPLICATE_WEBHOOK_SIGNING_SECRET','GOOGLE_CUSTOM_SEARCH_API_KEY'];
export const CATALOG = [
  {id:'black-forest-labs/flux-schnell', name:'FLUX.1 Schnell', tag:'Fast draft', description:'Start with a lightweight text-to-image workflow.', official:true},
  {id:'black-forest-labs/flux-2-pro', name:'FLUX.2 Pro', tag:'Generation + editing', description:'Explore its live image and reference controls.', official:true},
  {id:'google/nano-banana', name:'Nano Banana', tag:'Image editing', description:'Prompt-driven images and reference-image work.', official:true},
  {id:'ideogram-ai/ideogram-v3-turbo', name:'Ideogram 3 Turbo', tag:'Graphic concepts', description:'Try typography and poster-style compositions.', official:true}
];
export function parseEnv(text) {
  const values={};
  for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const m=raw.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if(!m) continue;
    let v=m[2];
    if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    values[m[1]]=v;
  }
  return values;
}
export function sanitize(message,config={}){
  let result=String(message||'Unexpected error.');
  for(const key of SECRET_KEYS){const s=config[key];if(s&&s.length>5)result=result.split(s).join('[redacted]');}
  return result.replace(/\b(?:r8_|sk-|xai-)[A-Za-z0-9_-]{8,}/g,'[redacted]').slice(0,1600);
}
export function parseModel(value){
  let v=String(value||'').trim();
  if(v.startsWith('https://replicate.com/'))v=v.slice(22).split(/[?#]/)[0].replace(/\/(api|readme|versions).*$/,'');
  const m=v.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)(?::([a-f0-9]{64}))?\/?$/);
  if(!m)throw new LabError('Choose a model or paste its Replicate model URL (owner/model).');
  return {owner:m[1],name:m[2],id:m[1]+'/'+m[2],version:m[3]||null};
}
export function flattenOutput(output){
  const result=[];
  const walk=(x,depth=0)=>{
    if(depth>6||result.length>=8)return;
    if(typeof x==='string'&&/^https:\/\//.test(x)){if(!result.includes(x))result.push(x);}
    else if(Array.isArray(x))x.forEach(v=>walk(v,depth+1));
    else if(x&&typeof x==='object')Object.values(x).forEach(v=>walk(v,depth+1));
  };walk(output);return result;
}
export function isDeliveryUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(u.hostname==='replicate.delivery'||u.hostname.endsWith('.replicate.delivery'));}catch{return false;}
}
export function imageType(bytes){
  if(bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'png',mime:'image/png'};
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {ext:'jpg',mime:'image/jpeg'};
  if(bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {ext:'webp',mime:'image/webp'};
  throw new LabError('The result is not a supported PNG, JPEG or WebP image. SVG, video and arbitrary files are not displayed by this POC.',422,'unsupported_output');
}
export function decodeImage(dataUrl,max=16*1024*1024){
  const m=String(dataUrl||'').match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if(!m)throw new LabError('Choose a PNG, JPEG or WebP image.');
  if(m[1].length>Math.ceil(max*4/3)+20)throw new LabError('Image exceeds the local upload size limit.',413);
  const bytes=Buffer.from(m[1],'base64');imageType(bytes);return bytes;
}
export function resolveSchema(node,document,depth=0){
  if(!node||depth>12)return {};
  if(node.$ref){
    if(!node.$ref.startsWith('#/'))return {};
    const ref=node.$ref.slice(2).split('/').reduce((o,k)=>o?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],document);
    return {...resolveSchema(ref,document,depth+1),...Object.fromEntries(Object.entries(node).filter(([k])=>k!=='$ref'))};
  }
  if(node.allOf)return Object.assign({},...node.allOf.map(v=>resolveSchema(v,document,depth+1)),Object.fromEntries(Object.entries(node).filter(([k])=>k!=='allOf')));
  if(node.anyOf){const primary=node.anyOf.find(v=>v.type!=='null')||{};return {...resolveSchema(primary,document,depth+1),...Object.fromEntries(Object.entries(node).filter(([k])=>k!=='anyOf')),nullable:node.anyOf.some(v=>v.type==='null')};}
  return node;
}
export function normalizeInputSchema(doc){
  const base=resolveSchema(doc?.components?.schemas?.Input,doc);
  return {...base,properties:Object.fromEntries(Object.entries(base.properties||{}).map(([k,v])=>[k,resolveSchema(v,doc)]))};
}
export function validateInput(input,schema){
  if(!input||Array.isArray(input)||typeof input!=='object')throw new LabError('Model inputs must be a JSON object.');
  const props=schema.properties||{},required=new Set(schema.required||[]),errors=[];
  for(const k of required){if(input[k]===undefined||input[k]===null||input[k]===''||Array.isArray(input[k])&&!input[k].length)errors.push(k+' is required');}
  for(const [k,v] of Object.entries(input)){
    const p=props[k];
    if(['__proto__','constructor','prototype'].includes(k))throw new LabError('Invalid input field.');
    if(!p){errors.push('Unknown model input: '+k);continue;}
    if(v===null){if(!p.nullable)errors.push(k+' cannot be null');continue;}
    if(p.enum&&!p.enum.includes(v))errors.push(k+' must use one of the listed options');
    if(p.type==='integer'&&!Number.isSafeInteger(v))errors.push(k+' must be a whole number');
    if(p.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)))errors.push(k+' must be a number');
    if(p.type==='string'&&typeof v!=='string')errors.push(k+' must be text');
    if(p.type==='boolean'&&typeof v!=='boolean')errors.push(k+' must be true or false');
    if(p.type==='array'&&!Array.isArray(v))errors.push(k+' must be an array');
    if(p.type==='object'&&(typeof v!=='object'||Array.isArray(v)))errors.push(k+' must be an object');
    if(typeof v==='number'&&p.minimum!==undefined&&v<p.minimum)errors.push(k+' minimum is '+p.minimum);
    if(typeof v==='number'&&p.maximum!==undefined&&v>p.maximum)errors.push(k+' maximum is '+p.maximum);
    if(typeof v==='string'&&p.maxLength&&v.length>p.maxLength)errors.push(k+' is too long');
    if(typeof v==='string'&&p.minLength&&v.length<p.minLength)errors.push(k+' is too short');
    if(Array.isArray(v)&&p.minItems!==undefined&&v.length<p.minItems)errors.push(k+' needs at least '+p.minItems+' items');
    if(Array.isArray(v)&&p.maxItems!==undefined&&v.length>p.maxItems)errors.push(k+' accepts at most '+p.maxItems+' items');
    const uriValues=p.type==='array'&&p.items?.format==='uri'&&Array.isArray(v)?v:p.format==='uri'?[v]:[];
    for(const uri of uriValues){if(typeof uri!=='string'){errors.push(k+' must contain a valid image/file URL');continue;}
      if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(uri))continue;
      try{const u=new URL(uri);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{errors.push(k+' needs an HTTPS URL or an uploaded image');}
    }
  }
  if(errors.length)throw new LabError(errors.join('; '),422,'model_input_invalid');
  return input;
}
// Ready for a later HTTPS webhook receiver; not exposed by the local app.
export function verifyReplicateWebhook(raw,headers,secret,now=Date.now()){
  const id=headers['webhook-id'],stamp=headers['webhook-timestamp'],signatures=headers['webhook-signature'];
  if(!id||!/^\d+$/.test(stamp||'')||!signatures||Math.abs(now/1000-Number(stamp))>300)return false;
  const key=secret?.startsWith('whsec_')?secret.slice(6):secret;
  if(!key)return false;
  const expected=createHmac('sha256',Buffer.from(key,'base64')).update(`${id}.${stamp}.`).update(raw).digest();
  return signatures.split(' ').some(item=>{const [v,s]=item.split(',');if(v!=='v1'||!s)return false;const got=Buffer.from(s,'base64');return got.length===expected.length&&timingSafeEqual(got,expected);});
}
