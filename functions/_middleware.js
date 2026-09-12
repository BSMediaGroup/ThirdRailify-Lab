import { LabError } from '../lib/core.mjs';
import { authorize, proxyAuth, anonymousSubject } from '../lib/auth.mjs';
import { ready, rate } from '../lib/storage.mjs';
import { apiRoute } from '../lib/api.mjs';
import { receiveWebhook } from '../lib/jobs.mjs';
const publicAssets=new Set(['/favicon.ico','/social/lab-social-card-v1.png','/auth-icons/discord.svg','/auth-icons/google.svg','/auth-icons/github.svg','/auth-icons/twitter.svg','/login','/login.html','/login.js','/login.css','/brand-assets/labs0.svg','/brand-fonts/display','/brand-fonts/body','/brand-fonts/bodybold','/brand-fonts/mono']);
const headers={
  'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};
export async function onRequest(context) {
  let response,publicPreview=false;
  try {
    const {request,env}=context,url=new URL(request.url);
    if(env.LAB_ENABLED!=='true'||url.origin!==env.LAB_ORIGIN)throw new LabError('Workshop is unavailable on this deployment.',503,'lab_unavailable');
    await ready(env);
    if(url.searchParams.has('handoff')&&['/','/research','/index.html','/account/login'].includes(url.pathname)&&request.method==='GET')return secured(new Response(null,{status:302,headers:{Location:'/login?handoff='+encodeURIComponent(url.searchParams.get('handoff'))}}));
    if(url.pathname==='/api/webhooks/replicate')response=await receiveWebhook(env,request);
    else if(url.pathname.startsWith('/api/auth/')) {await rate(env,await anonymousSubject(request),'auth');response=await proxyAuth(env,request,url.pathname.slice(10));}
    else if(publicAssets.has(url.pathname)&&['GET','HEAD'].includes(request.method)){publicPreview=url.pathname==='/social/lab-social-card-v1.png';response=await context.next();}
    else {
      let auth;
      try {auth=await authorize(env,request);}catch(error){if(error.status===401&&['/','/research','/index.html'].includes(url.pathname)&&request.method==='GET')return secured(new Response(null,{status:302,headers:{Location:'/login'+(url.searchParams.has('handoff')?'?handoff='+encodeURIComponent(url.searchParams.get('handoff')):'')}}));throw error;}
      if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/attachments/'))response=await apiRoute(env,request,auth,context);
      else if(['GET','HEAD'].includes(request.method)) response=await context.next();
      else throw new LabError('Method not allowed.',405);
    }
    if(url.pathname.startsWith('/brand-fonts/')){response=new Response(response.body,response);response.headers.set('Content-Type','font/ttf');}
  }catch(error){if(!(error instanceof LabError))console.error('Lab request failure',error.name,String(error.message).slice(0,300));response=Response.json({ok:false,error:error instanceof LabError?error.code:'service_unavailable',message:error instanceof LabError?error.message:'Workshop is temporarily unavailable.'},{status:error instanceof LabError?error.status:503});}
  return secured(response,publicPreview);
}
function secured(response,publicPreview=false){const out=new Response(response.body,response);for(const [k,v]of Object.entries(headers))out.headers.set(k,v);if(publicPreview)out.headers.set('Cache-Control','public, max-age=604800, immutable');return out;}
