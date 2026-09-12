import {createHmac, timingSafeEqual} from 'node:crypto';
import {LabError, imageType} from './core.mjs';
import {storeFile} from './storage.mjs';

const API='https://customsearch.googleapis.com/customsearch/v1';
const TYPES=new Set(['clipart','face','lineart','stock','photo','animated']);
const SIZES=new Set(['huge','icon','large','medium','small','xlarge','xxlarge']);
const COLORS=new Set(['color','gray','mono','trans']);
const DOMINANT=new Set(['black','blue','brown','gray','green','orange','pink','purple','red','teal','white','yellow']);
const MAX_BYTES=12*1024*1024,MAX_PIXELS=40_000_000;
const enc=value=>Buffer.from(value).toString('base64url');
const dec=value=>Buffer.from(value,'base64url').toString();

function signingKey(env){if(!env.GOOGLE_CUSTOM_SEARCH_API_KEY||!env.GOOGLE_CUSTOM_SEARCH_CX)throw new LabError('Google image search is not configured for this Workshop.',503,'google_images_not_configured');return String(env.GOOGLE_CUSTOM_SEARCH_API_KEY);}
function cleanText(value,max=240){return String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function safeHttp(value,{https=false}={}){try{const u=new URL(value);if((https&&u.protocol!=='https:')||(!https&&!['http:','https:'].includes(u.protocol))||u.username||u.password)return '';return u.href;}catch{return '';}}
function signed(env,payload){const body=enc(JSON.stringify(payload)),sig=createHmac('sha256',signingKey(env)).update(body).digest('base64url');return `${body}.${sig}`;}
export function verifyImageResultToken(env,token,{owner,projectId}={}){
  const [body,sig,extra]=String(token||'').split('.');if(!body||!sig||extra||body.length>7000)throw new LabError('This image result is invalid or expired.',400,'invalid_image_result');
  const expected=createHmac('sha256',signingKey(env)).update(body).digest();let actual;try{actual=Buffer.from(sig,'base64url');}catch{throw new LabError('This image result is invalid or expired.',400,'invalid_image_result');}
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new LabError('This image result is invalid or expired.',400,'invalid_image_result');
  let value;try{value=JSON.parse(dec(body));}catch{throw new LabError('This image result is invalid or expired.',400,'invalid_image_result');}
  if(value.exp<Date.now()||value.exp>Date.now()+16*60_000||value.owner!==owner||value.projectId!==projectId)throw new LabError('This image result is invalid or expired.',400,'invalid_image_result');
  if(!safeHttp(value.imageUrl,{https:true})||!safeHttp(value.thumbnailUrl,{https:true})||!safeHttp(value.contextUrl))throw new LabError('This image result is invalid or expired.',400,'invalid_image_result');
  return value;
}

function parameter(value,allowed,name){if(!value)return '';if(!allowed.has(value))throw new LabError(`Unsupported ${name} filter.`);return value;}
function site(value){const v=String(value||'').trim().toLowerCase();if(!v)return '';if(v.length>253||!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v))throw new LabError('Enter a domain such as example.com.');return v;}
export function googleImageConfiguration(env){return {configured:Boolean(env.GOOGLE_CUSTOM_SEARCH_API_KEY&&env.GOOGLE_CUSTOM_SEARCH_CX),provider:'Google Custom Search JSON API',legacyService:true};}

export async function searchGoogleImages(env,owner,projectId,requestUrl,fetcher=fetch){
  const configuration=googleImageConfiguration(env);if(!configuration.configured)throw new LabError('Google image search is not configured for this Workshop.',503,'google_images_not_configured');
  const input=new URL(requestUrl),q=cleanText(input.searchParams.get('q'),160);if(q.length<2)throw new LabError('Enter a search of 2–160 characters.');
  const start=Number(input.searchParams.get('start')||1);if(!Number.isSafeInteger(start)||start<1||start>91||(start-1)%10)throw new LabError('Search page is outside Google’s supported result range.');
  const safe=input.searchParams.get('safe')||'active';if(!['active','off'].includes(safe))throw new LabError('Unsupported SafeSearch setting.');
  const filters={imgType:parameter(input.searchParams.get('type'),TYPES,'image type'),imgSize:parameter(input.searchParams.get('size'),SIZES,'image size'),imgColorType:parameter(input.searchParams.get('color'),COLORS,'color mode'),imgDominantColor:parameter(input.searchParams.get('dominant'),DOMINANT,'dominant color'),siteSearch:site(input.searchParams.get('site'))};
  const target=new URL(API);for(const [key,value] of Object.entries({key:env.GOOGLE_CUSTOM_SEARCH_API_KEY,cx:env.GOOGLE_CUSTOM_SEARCH_CX,q,searchType:'image',safe,start:String(start),num:'10',...filters}))if(value)target.searchParams.set(key,value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let response;
  try{response=await fetcher(target,{headers:{Accept:'application/json'},signal:controller.signal});}catch(error){throw new LabError(error?.name==='AbortError'?'Google image search timed out.':'Google image search is temporarily unavailable.',503,'google_images_unavailable');}finally{clearTimeout(timer);}
  let data={};try{data=await response.json();}catch{}
  if(!response.ok){const reason=data?.error?.errors?.[0]?.reason||'';if(response.status===429||/quota|rateLimit/i.test(reason))throw new LabError('Google image-search quota is currently unavailable. Try again later.',429,'google_images_quota');if(response.status===400&&/key|cx|accessNotConfigured/i.test(reason))throw new LabError('Google image search configuration was rejected by Google.',503,'google_images_configuration_rejected');throw new LabError('Google image search is temporarily unavailable.',502,'google_images_provider_error');}
  const expires=Date.now()+15*60_000,items=[];
  for(const item of Array.isArray(data.items)?data.items:[]){
    const imageUrl=safeHttp(item.link,{https:true}),thumbnailUrl=safeHttp(item.image?.thumbnailLink,{https:true}),contextUrl=safeHttp(item.image?.contextLink);if(!imageUrl||!thumbnailUrl||!contextUrl)continue;
    const result={title:cleanText(item.title||'Untitled image',180),imageUrl,thumbnailUrl,contextUrl,sourceHostname:new URL(contextUrl).hostname.replace(/^www\./,''),width:Number.isSafeInteger(item.image?.width)?item.image.width:null,height:Number.isSafeInteger(item.image?.height)?item.image.height:null,mime:/^image\/(?:png|jpeg|webp)$/i.test(item.mime||'')?item.mime.toLowerCase():null};
    const token=signed(env,{...result,owner,projectId,exp:expires});items.push({...result,token,thumbnailUrl:`/api/research/images/thumbnail?projectId=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`});
  }
  const next=Number(data.queries?.nextPage?.[0]?.startIndex);return {query:q,filters:{safe,type:filters.imgType,size:filters.imgSize,color:filters.imgColorType,dominant:filters.imgDominantColor,site:filters.siteSearch},items,nextStart:Number.isSafeInteger(next)&&next>=1&&next<=91?next:null,total:Math.min(100,Number(data.searchInformation?.totalResults)||items.length),rightsNotice:'Search results are references. Verify usage rights before publication.',externalUrl:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`};
}

function ipv4(value){const p=value.split('.');if(p.length!==4||p.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))return null;return p.map(Number);}
export function assertPublicImageUrl(value){
  let u;try{u=new URL(value);}catch{throw new LabError('The image source is invalid.',422,'unsafe_image_source');}
  if(u.protocol!=='https:'||u.username||u.password||u.port)throw new LabError('Only public HTTPS image sources are allowed.',422,'unsafe_image_source');
  const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||h==='metadata.google.internal'||h==='0.0.0.0'||h==='::'||h==='::1')throw new LabError('Private image sources are not allowed.',422,'unsafe_image_source');
  const p=ipv4(h);if(p&&(p[0]===0||p[0]===10||p[0]===127||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&[0,2,168].includes(p[1])||p[0]===198&&[18,19,51].includes(p[1])||p[0]===203&&p[1]===0&&p[2]===113||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]>=224))throw new LabError('Private image sources are not allowed.',422,'unsafe_image_source');
  const mapped=h.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/i);if(mapped){assertPublicImageUrl('https://'+mapped[1]);}
  if(h.includes(':')&&(/^(?:fc|fd|fe8|fe9|fea|feb)/i.test(h)||h.startsWith('2001:db8')))throw new LabError('Private image sources are not allowed.',422,'unsafe_image_source');
  return u;
}
function dimensions(bytes,type){
  if(type.mime==='image/png'&&bytes.length>=24)return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if(type.mime==='image/jpeg'){let i=2;while(i+9<bytes.length){if(bytes[i]!==0xff){i++;continue;}const marker=bytes[i+1],len=bytes.readUInt16BE(i+2);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {height:bytes.readUInt16BE(i+5),width:bytes.readUInt16BE(i+7)};if(len<2)break;i+=2+len;}}
  if(type.mime==='image/webp'&&bytes.length>=30){const chunk=bytes.toString('ascii',12,16);if(chunk==='VP8X')return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};if(chunk==='VP8 '&&bytes[23]===0x9d&&bytes[24]===0x01&&bytes[25]===0x2a)return {width:bytes.readUInt16LE(26)&0x3fff,height:bytes.readUInt16LE(28)&0x3fff};if(chunk==='VP8L'&&bytes[20]===0x2f){const bits=bytes.readUInt32LE(21);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}}
  return null;
}
export async function fetchBoundedImage(value,fetcher=fetch){
  let current=assertPublicImageUrl(value);
  for(let redirects=0;redirects<=3;redirects++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10_000);let response;
    try{response=await fetcher(current,{redirect:'manual',headers:{Accept:'image/png,image/jpeg,image/webp'},signal:controller.signal});}catch(error){throw new LabError(error?.name==='AbortError'?'Image import timed out.':'The source image could not be reached.',502,'image_import_failed');}finally{clearTimeout(timer);}
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location||redirects===3)throw new LabError('The image source redirected too many times.',422,'unsafe_image_source');current=assertPublicImageUrl(new URL(location,current).href);continue;}
    if(!response.ok)throw new LabError('The source image is unavailable.',502,'image_import_failed');
    const declared=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();if(!['image/png','image/jpeg','image/webp'].includes(declared))throw new LabError('The source did not return a supported image.',422,'unsupported_output');
    const length=Number(response.headers.get('content-length')||0);if(length>MAX_BYTES)throw new LabError('The source image exceeds the 12 MB import limit.',413,'image_too_large');
    const reader=response.body?.getReader();if(!reader)throw new LabError('The source image is unavailable.',502,'image_import_failed');const chunks=[];let count=0;
    for(;;){const {done,value:chunk}=await reader.read();if(done)break;count+=chunk.byteLength;if(count>MAX_BYTES){await reader.cancel();throw new LabError('The source image exceeds the 12 MB import limit.',413,'image_too_large');}chunks.push(Buffer.from(chunk));}
    const bytes=Buffer.concat(chunks),type=imageType(bytes);if(type.mime!==declared)throw new LabError('The source content did not match its image type.',422,'unsupported_output');const size=dimensions(bytes,type);if(size&&(size.width<1||size.height<1||size.width*size.height>MAX_PIXELS))throw new LabError('The source image dimensions exceed the safe import limit.',413,'image_dimensions_too_large');return {bytes,type,size,url:current.href};
  }
}

export async function importGoogleImage(env,owner,projectId,token,fetcher=fetch){
  const result=verifyImageResultToken(env,token,{owner,projectId}),download=await fetchBoundedImage(result.imageUrl,fetcher);
  const asset=await storeFile(env,owner,projectId,download.bytes,{source:'google-images',title:result.title,sourceUrl:result.imageUrl,contextUrl:result.contextUrl,sourceHostname:result.sourceHostname,width:download.size?.width||result.width,height:download.size?.height||result.height});return {asset};
}

export async function googleImageThumbnail(env,owner,projectId,token,fetcher=fetch){const result=verifyImageResultToken(env,token,{owner,projectId}),download=await fetchBoundedImage(result.thumbnailUrl,fetcher);return new Response(download.bytes,{headers:{'Content-Type':download.type.mime,'Content-Length':String(download.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
