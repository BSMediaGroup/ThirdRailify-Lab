
import {randomUUID, createHmac, timingSafeEqual} from 'node:crypto';
import {inputErrors,normalizeReplicateInputSchema} from '../public/model-schema.js';


export class LabError extends Error {
  constructor(message, status=400, code='invalid_request', retryAfter=0) {
    super(message); this.status=status; this.code=code; this.retryAfter=retryAfter;
  }
}
export const DEFAULTS = {
  REPLICATE_API_TOKEN:'', OPENAI_API_KEY:'', XAI_API_KEY:'',
  PEXELS_API_KEY:'', PIXABAY_API_KEY:'', UNSPLASH_ACCESS_KEY:'', GOOGLE_PSE_CX:'',
  LAB_VAULT_MASTER_KEY_V1:'',
  // Optional saved preferences only. Model choices come from provider catalogues.
  OPENAI_IMAGE_MODEL:'', OPENAI_CHAT_MODEL:'',
  XAI_IMAGE_MODEL:'', XAI_CHAT_MODEL:'',
  REPLICATE_WEBHOOK_SIGNING_SECRET:'', PORT:'4317'
};
export const SECRET_KEYS = ['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY','PEXELS_API_KEY','PIXABAY_API_KEY','UNSPLASH_ACCESS_KEY'];
const REDACT_KEYS = [...SECRET_KEYS,'REPLICATE_WEBHOOK_SIGNING_SECRET','LAB_VAULT_MASTER_KEY_V1'];
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
  for(const key of REDACT_KEYS){const s=config[key];if(s&&s.length>5)result=result.split(s).join('[redacted]');}
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
  if(bytes.length>10&&['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))return {ext:'gif',mime:'image/gif'};
  if(bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {ext:'webp',mime:'image/webp'};
  throw new LabError('The image is not a supported PNG, JPEG, WebP or GIF file.',422,'unsupported_image');
}
export function imageDimensions(bytes){
  const type=imageType(bytes);
  if(type.ext==='png'&&bytes.length>=24)return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(type.ext==='jpg'){
    for(let offset=2;offset+9<bytes.length;){if(bytes[offset]!==0xff){offset++;continue;}const marker=bytes[offset+1];if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {height:bytes.readUInt16BE(offset+5),width:bytes.readUInt16BE(offset+7)};if(marker===0xd8||marker===0xd9){offset+=2;continue;}const length=bytes.readUInt16BE(offset+2);if(length<2)break;offset+=2+length;}
  }
  if(type.ext==='gif'&&bytes.length>=10)return {width:bytes.readUInt16LE(6),height:bytes.readUInt16LE(8)};
  if(type.ext==='webp'&&bytes.length>=30){const format=bytes.toString('ascii',12,16);if(format==='VP8X')return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};if(format==='VP8 '&&bytes.length>=30)return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};if(format==='VP8L'&&bytes.length>=25){const bits=bytes.readUInt32LE(21);return {width:1+(bits&0x3fff),height:1+((bits>>14)&0x3fff)};}}
  return null;
}
export function decodeImage(dataUrl,max=16*1024*1024){
  const m=String(dataUrl||'').match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if(!m)throw new LabError('Choose a PNG, JPEG or WebP image.');
  if(m[1].length>Math.ceil(max*4/3)+20)throw new LabError('Image exceeds the local upload size limit.',413);
  const bytes=Buffer.from(m[1],'base64');imageType(bytes);return bytes;
}
export function decodeModelFile({name,dataUrl}={},max=16*1024*1024){
  name=String(name||'model-input').replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,160);
  const match=String(dataUrl||'').match(/^data:([^;,]*)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if(!match||match[2].length>Math.ceil(max*4/3)+32)throw new LabError('Choose a supported file up to 16 MB.',413,'model_file_too_large');
  const bytes=Buffer.from(match[2],'base64');if(!bytes.length||bytes.length>max)throw new LabError('The selected file is empty or exceeds 16 MB.',413,'model_file_too_large');
  try{const type=imageType(bytes);return {name,bytes,mime:type.mime,kind:'image'};}catch(error){if(error.code!=='unsupported_image')throw error;}
  if(bytes.toString('ascii',0,5)==='%PDF-')return {name,bytes,mime:'application/pdf',kind:'document'};
  if(bytes.length>4&&bytes[0]===0x50&&bytes[1]===0x4b&&[0x03,0x05,0x07].includes(bytes[2])&&[0x04,0x06,0x08].includes(bytes[3]))return {name,bytes,mime:'application/zip',kind:'archive'};
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE')return {name,bytes,mime:'audio/wav',kind:'audio'};
  if(bytes.toString('ascii',0,4)==='fLaC')return {name,bytes,mime:'audio/flac',kind:'audio'};
  if(bytes.toString('ascii',0,3)==='ID3'||bytes.length>2&&bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)return {name,bytes,mime:'audio/mpeg',kind:'audio'};
  if(bytes.length>12&&bytes.toString('ascii',4,8)==='ftyp'){
    const claimed=match[1].toLowerCase(),kind=claimed.startsWith('audio/')?'audio':'video';
    return {name,bytes,mime:kind==='audio'?'audio/mp4':'video/mp4',kind};
  }
  if(bytes.length>4&&bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return {name,bytes,mime:match[1].toLowerCase().startsWith('audio/')?'audio/webm':'video/webm',kind:match[1].toLowerCase().startsWith('audio/')?'audio':'video'};
  throw new LabError('This file signature is not supported for model input. Use PNG, JPEG, WebP, GIF, PDF, ZIP, MP3, WAV, FLAC, MP4 or WebM.',422,'unsupported_model_mime');
}
export const normalizeInputSchema=normalizeReplicateInputSchema;
export function validateInput(input,schema){
  const errors=inputErrors(input,schema,'provider');
  if(errors.length)throw new LabError(errors.map(error=>error.message).join('; '),422,errors[0].code==='unsupported_input'?'unsupported_model_input':'model_input_invalid');
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
