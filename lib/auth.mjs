import { LabError } from './core.mjs';
import { workshopAccess } from './workshop-policy.js';
import { digest } from './storage.mjs';
export const COOKIE='thirdrailify_session';
export function tokenFor(request){const m=request.headers.get('cookie')?.match(/(?:^|;\s*)thirdrailify_session=([^;]+)/);if(!m)return '';try{return decodeURIComponent(m[1]);}catch{return '';}}
async function canonicalHash(value){return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');}
export async function authorize(env,request) {
  const token=tokenFor(request);if(!/^[\w-]{30,100}$/.test(token))throw new LabError('Sign in to continue.',401,'unauthenticated');
  if(!env.THIRDRAILIFY_AUTH_DB?.prepare)throw new LabError('Account authority is unavailable.',503);
  const row=await env.THIRDRAILIFY_AUTH_DB.prepare('SELECT id,account_id,csrf_token_hash,expires_at,revoked_at,source_origin FROM sessions WHERE token_hash=?').bind(await canonicalHash(token)).first();
  if(!row||row.revoked_at||row.expires_at<=new Date().toISOString()||row.source_origin!==env.LAB_ORIGIN)throw new LabError('Sign in to continue.',401,'unauthenticated');
  const policy=await workshopAccess(env.THIRDRAILIFY_AUTH_DB,row.account_id);
  if(!policy.allowed)throw new LabError('Workshop access is not enabled for this account.',403,'workshop_denied');
  const expected=request.headers.get('x-lab-account');if(expected&&expected!==row.account_id)throw new LabError('The signed-in account changed. Reload this tab.',409,'account_changed');
  if(!['GET','HEAD'].includes(request.method)){
    if(request.headers.get('origin')!==env.LAB_ORIGIN)throw new LabError('Request origin denied.',403,'origin_not_allowed');
    const csrf=request.headers.get('x-csrf-token')||request.headers.get('x-lab-csrf')||'';
    if(!csrf||csrf.length>512||await canonicalHash(csrf)!==row.csrf_token_hash)throw new LabError('Request verification failed.',403,'csrf_invalid');
  }
  return {owner:row.account_id,session:row,policy,token};
}
export async function proxyAuth(env,request,path) {
  if(env.THIRDRAILIFY_ADMIN_ORIGIN!=='https://admin.thirdrailify.com')throw new LabError('Canonical login is unavailable.',503);
  const allowed=new Set(['config','login','handoff','logout','session','oauth/google/start','oauth/discord/start','oauth/github/start','oauth/twitter/start']);
  if(!allowed.has(path))throw new LabError('Auth route not found.',404);
  if(!['GET','POST'].includes(request.method))throw new LabError('Method not allowed.',405);
  if(request.method==='POST'&&request.headers.get('origin')!==env.LAB_ORIGIN)throw new LabError('Request origin denied.',403);
  if(request.method==='GET'&&!['config','session'].includes(path))throw new LabError('Method not allowed.',405);
  const headers={'Origin':env.LAB_ORIGIN,'Content-Type':'application/json'};
  if(request.headers.get('cf-connecting-ip'))headers['CF-Connecting-IP']=request.headers.get('cf-connecting-ip');
  if(['session','logout'].includes(path)){const token=tokenFor(request);if(token)headers.Cookie=`${COOKIE}=${encodeURIComponent(token)}`;}
  const csrf=request.headers.get('x-csrf-token');if(csrf)headers['X-CSRF-Token']=csrf;
  let body;if(request.method==='POST'){const chunks=[];let n=0;for await(const c of request.body||[]){n+=c.length;if(n>16384)throw new LabError('Login request too large.',413);chunks.push(Buffer.from(c));}body=Buffer.concat(chunks).toString();}
  const endpoint=path==='session'?'/api/workshop/session':'/api/auth/'+path;
  const upstream=await fetch(env.THIRDRAILIFY_ADMIN_ORIGIN+endpoint,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!upstream.headers.get('content-type')?.startsWith('application/json'))throw new LabError('Canonical account service returned an invalid response.',502);
  const result=await upstream.json();const outHeaders={'Content-Type':'application/json'};
  const cookie=upstream.headers.get('set-cookie');
  if(cookie&&['handoff','logout'].includes(path)){
    if(!cookie.startsWith(COOKIE+'=')||/;\s*Domain=/i.test(cookie))throw new LabError('Host-only session contract failed.',503);
    outHeaders['Set-Cookie']=cookie;
  }
  return new Response(JSON.stringify(result),{status:upstream.status,headers:outHeaders});
}
export async function anonymousSubject(request){return 'ip:'+await digest(request.headers.get('cf-connecting-ip')||'unknown');}
