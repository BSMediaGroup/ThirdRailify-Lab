import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir,readdir,stat,unlink} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {LabError,DEFAULTS,SECRET_KEYS,CATALOG,readConfig,updateConfig,atomicWrite,sanitize,decodeImage,imageType,parseModel} from './lib/core.mjs';
import {Providers} from './lib/providers.mjs';
import {discoverBrandAssets} from './lib/brand.mjs';
import {preparePrompt} from './public/model-schema.js';
import {ModelCatalog,modelKind} from './lib/models.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const FINAL=new Set(['succeeded','failed','canceled','submission_uncertain','interrupted','download_failed']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.otf':'font/otf','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};

export async function createLab({root=HERE,fetchImpl=globalThis.fetch,pollDelay=2500,discoverBrand=true}={}){
  let config=await readConfig(root);
  const data=path.join(root,'.data');await mkdir(path.join(data,'assets'),{recursive:true});
  let state={jobs:[],assets:{},projects:[]};
  try{state=JSON.parse(await readFile(path.join(data,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Local history could not be read. Preserve .data/state.json and repair it before starting.');}
  const csrf=randomBytes(24).toString('hex'),providers=new Providers(()=>config,fetchImpl);
  const brand=discoverBrand?await discoverBrandAssets(root):{fonts:{},logo:null,sources:{},logoSource:null};
  const fonts=brand.fonts,modelCatalog=new ModelCatalog(providers);
  let writeChain=Promise.resolve(),stopping=false,active=0;
  const activeIds=new Set();
  const submissions=new Map();
  const deletingAssets=new Set();
  const save=()=>{const snapshot=JSON.stringify(state,null,2);const operation=writeChain.then(()=>atomicWrite(path.join(data,'state.json'),snapshot));writeChain=operation.catch(()=>{});return operation;};
  function publicJob(j){return {id:j.id,sessionId:j.sessionId||null,requestId:j.requestId,provider:j.provider,model:j.model,version:j.version,prompt:j.prompt,createdAt:j.createdAt,status:j.status,phase:j.phase,error:j.error,providerId:j.providerId,providerUrl:j.provider==='replicate'&&j.providerId?`https://replicate.com/p/${encodeURIComponent(j.providerId)}`:null,assets:(j.assets||[]).filter(a=>state.assets[a.id]),input:safeInput(j.input),options:j.options,metrics:j.metrics,warning:j.warning};}
  function safeInput(input){return Object.fromEntries(Object.entries(input||{}).map(([k,v])=>[k,typeof v==='string'&&v.startsWith('data:')?'[reference image omitted from history preview]':v]));}
  function publicConfig(){return {keys:Object.fromEntries(SECRET_KEYS.map(k=>[k,Boolean(config[k])])),models:{openaiImage:config.OPENAI_IMAGE_MODEL,openaiChat:config.OPENAI_CHAT_MODEL,xaiImage:config.XAI_IMAGE_MODEL,xaiChat:config.XAI_CHAT_MODEL},fonts:Object.keys(fonts),brand:{fonts:brand.sources,logo:Boolean(brand.logo),logoSource:brand.logoSource},version:'0.3.0-poc',port:server.address()?.port,localOnly:true,webhooks:false};}
  async function addAsset(bytes,meta={}){
    if(bytes.length>32*1024*1024)throw new LabError('Image exceeds the 32 MB limit.',413);
    const type=imageType(bytes),id=randomUUID()+'.'+type.ext;
    await writeFile(path.join(data,'assets',id),bytes,{mode:0o600});
    const asset={id,url:'/assets/'+id,mime:type.mime,bytes:bytes.length,createdAt:new Date().toISOString(),...meta};state.assets[id]=asset;return asset;
  }
  async function importOutputs(job,prediction){
    job.status='saving';job.phase='Saving original images locally';job.assets=job.assets||[];await save();
    const urls=providers.outputUrls(prediction);job.outputUrls=urls;
    if(!urls.length)throw new LabError('The provider completed but returned no image file URLs. This image workshop does not render text/video model outputs.',422,'no_image_output');
    for(let i=job.assets.length;i<urls.length;i++){
      const bytes=await providers.downloadReplicate(urls[i]);
      const asset=await addAsset(bytes,{source:'generation',jobId:job.id,title:job.prompt.slice(0,90)});job.assets.push(asset);await save();
    }
  }
  async function materializeReferences(input){
    const visit=async(v,depth=0)=>{
      if(depth>8)throw new LabError('Input nesting is too deep.');
      if(typeof v==='string'&&v.startsWith('/assets/')){
        const id=v.slice(8),a=state.assets[id];if(!a||deletingAssets.has(id))throw new LabError('An input image no longer exists. Reattach it.');
        const bytes=await readFile(path.join(data,'assets',id));return `data:${a.mime};base64,${bytes.toString('base64')}`;
      }
      if(Array.isArray(v))return Promise.all(v.map(x=>visit(x,depth+1)));
      if(v&&typeof v==='object'){const out={};for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw new LabError('Invalid input field.');out[k]=await visit(x,depth+1);}return out;}
      return v;
    };return visit(input);
  }
  function projectAssetIds(project){
    const ids=new Set(project?.assetId?[project.assetId]:[]);
    const visit=(v,depth=0)=>{if(depth>10)return;if(typeof v==='string'&&/^\/assets\/[a-f0-9-]+\.(png|jpg|webp)$/.test(v))ids.add(v.slice(8));else if(Array.isArray(v))v.forEach(x=>visit(x,depth+1));else if(v&&typeof v==='object')Object.values(v).forEach(x=>visit(x,depth+1));};
    visit(project?.generation?.input);return [...ids];
  }
  async function run(job){
    try{
      if(job.provider==='replicate'){
        let prediction;
        if(job.providerId)prediction=await providers.request('replicate','/predictions/'+encodeURIComponent(job.providerId));
        else{
          job.status='submitting';job.phase='Submitting once to Replicate';await save();
          prediction=await providers.createReplicate(job);
          if(!prediction.id)throw new LabError('Provider response contained no prediction ID. Check your Replicate dashboard before retrying.',502,'submission_uncertain');
          job.providerId=prediction.id;await save();
        }
        let failures=0;
        while(!['succeeded','failed','canceled'].includes(prediction.status)){
          if(stopping)return;
          job.status=prediction.status==='starting'?'starting':'processing';job.phase=prediction.status==='starting'?'Provider is starting the model':'Provider is generating';await save();
          await sleep(pollDelay);
          try{prediction=await providers.request('replicate','/predictions/'+encodeURIComponent(job.providerId));failures=0;}
          catch(e){
            if((e.status===429||e.status>=500)&&failures++<12){job.phase='Provider status temporarily unavailable; retrying status only';await save();await sleep(Math.min(30000,Math.max(e.retryAfter*1000,pollDelay*2**Math.min(failures,4))));continue;}
            throw e;
          }
        }
        job.metrics=prediction.metrics||{};
        if(prediction.status==='canceled'){job.status='canceled';job.phase='Canceled by provider';}
        else if(prediction.status==='failed'){job.status='failed';job.error=sanitize(prediction.error||'The model failed.',config);job.phase='Generation failed';}
        else {await importOutputs(job,prediction);job.status='succeeded';job.phase='Originals saved locally';}
      } else {
        job.status='processing';job.phase='Provider is generating; this may take several minutes';await save();
        const result=await providers.directImage(job);
        job.assets=[];job.metrics=result.usage||{};
        for(const item of result.data||[]){
          if(!item.b64_json)throw new LabError('Provider returned a non-base64 image. This adapter requires base64 output; check model compatibility.',422,'unsupported_output');
          if(item.b64_json.length>45*1024*1024)throw new LabError('Generated image is too large.',413);
          job.assets.push(await addAsset(Buffer.from(item.b64_json,'base64'),{source:'generation',jobId:job.id,title:job.prompt.slice(0,90)}));
        }
        if(!job.assets.length)throw new LabError('Provider returned no images.',502,'no_image_output');
        job.status='succeeded';job.phase='Originals saved locally';
      }
    }catch(e){
      job.error=sanitize(e.message,config);
      job.status=e.code==='submission_uncertain'?'submission_uncertain':job.status==='saving'?'download_failed':'failed';
      job.phase=job.status==='download_failed'?'Generated, but local download needs attention':'Attention required';
    }finally{await save();}
  }
  function pump(){
    if(stopping)return;
    for(const job of state.jobs){
      if(active>=2)break;
      if(job.status==='queued'&&!activeIds.has(job.id)){
        active++;activeIds.add(job.id);
        run(job).catch(e=>console.error('Local persistence error:',sanitize(e.message,config))).finally(()=>{active--;activeIds.delete(job.id);pump();});
      }
    }
  }
  for(const j of state.jobs){
    if(!FINAL.has(j.status)){
      if(j.provider==='replicate'&&j.providerId){j.status='queued';j.phase='Resuming provider status';}
      else if(j.status!=='queued'){j.status='interrupted';j.error='The server stopped during submission. Check the provider dashboard before generating again.';}
    }
  }
  const publicRoot=path.join(root,'public');
  function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
  async function bodyJson(req){
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new LabError('JSON required.',415);
    const chunks=[];let size=0;
    for await(const c of req){size+=c.length;if(size>24*1024*1024)throw new LabError('Request exceeds the 24 MB local limit.',413);chunks.push(c);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new LabError('Invalid JSON.');}
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try{
      const port=server.address()?.port,hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
      if(!hosts.has(req.headers.host)||req.headers['sec-fetch-site']==='cross-site')throw new LabError('This POC accepts local same-origin requests only.',403,'local_only');
      if(!['GET','POST'].includes(req.method))throw new LabError('Method not allowed.',405);
      if(req.method==='POST'){
        if(!hosts.has(String(req.headers.origin||'').replace(/^http:\/\//,''))||req.headers['x-lab-csrf']!==csrf)throw new LabError('Refresh the local Lab page before submitting.',403,'origin_rejected');
      }
      const url=new URL(req.url,'http://'+req.headers.host),route=url.pathname;
      if(route==='/api/state'&&req.method==='GET')return send(res,200,{ok:true,csrf,config:publicConfig(),catalog:CATALOG,jobs:state.jobs.filter(j=>!j.deletedAt).slice(-100).reverse().map(publicJob),assets:[...new Map([...Object.values(state.assets).slice(-200).reverse(),...state.projects.flatMap(p=>projectAssetIds(p.project).map(id=>state.assets[id])).filter(Boolean)].map(a=>[a.id,a])).values()],projects:state.projects,preferences:state.preferences||{}});
      if(route==='/api/jobs'&&req.method==='GET')return send(res,200,{ok:true,jobs:state.jobs.filter(j=>!j.deletedAt).slice(-100).reverse().map(publicJob)});
      if(route==='/api/model'&&req.method==='GET')return send(res,200,{ok:true,model:await providers.model(url.searchParams.get('id'))});
      if(route==='/api/models/search'&&req.method==='GET')return send(res,200,{ok:true,items:await providers.search(url.searchParams.get('q'))});
      if(route==='/api/provider-models'&&req.method==='GET')return send(res,200,{ok:true,...await modelCatalog.list(url.searchParams.get('provider'),url.searchParams.get('kind'),{refresh:url.searchParams.get('refresh')==='1'})});
      if(route==='/api/preferences'&&req.method==='POST'){
        const b=await bodyJson(req),presets=b.presets;
        if(!presets||typeof presets!=='object'||Array.isArray(presets))throw new LabError('Preset settings are invalid.');
        const clean={};for(const id of ['original','cinematic','thumbnail','railify']){if(typeof presets[id]!=='string'||presets[id].length>8000)throw new LabError('Each preset must contain at most 8,000 characters.');clean[id]=presets[id];}
        state.preferences={...state.preferences,presets:clean};await save();return send(res,200,{ok:true,preferences:state.preferences});
      }
      if(route==='/api/settings'&&req.method==='POST'){
        config=await updateConfig(root,await bodyJson(req));providers.cache.clear();modelCatalog.clear();return send(res,200,{ok:true,config:publicConfig()});
      }
      if(route==='/api/settings/test'&&req.method==='POST'){
        const {provider}=await bodyJson(req);if(!['replicate','openai','xai'].includes(provider))throw new LabError('Unknown provider.');return send(res,200,await providers.test(provider));
      }
      if(route==='/api/settings/webhook-key'&&req.method==='POST'){
        await bodyJson(req);const result=await providers.request('replicate','/webhooks/default/secret');
        if(!result.key)throw new LabError('Replicate returned no signing key.',502);
        config=await updateConfig(root,{REPLICATE_WEBHOOK_SIGNING_SECRET:result.key});return send(res,200,{ok:true,message:'Signing key saved in .env. Webhooks are not enabled in this loopback POC.',config:publicConfig()});
      }
      if(route==='/api/generate'&&req.method==='POST'){
        const b=await bodyJson(req);
        if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId||''))throw new LabError('A valid request identifier is required.');
        if(submissions.has(b.requestId))await submissions.get(b.requestId);
        const old=state.jobs.find(j=>j.requestId===b.requestId);if(old)return send(res,200,{ok:true,job:publicJob(old)});
        let release;submissions.set(b.requestId,new Promise(r=>{release=r;}));
        try{
        if(!['replicate','openai','xai'].includes(b.provider))throw new LabError('Choose an image provider.');
        providers.key(b.provider);
        if(state.jobs.filter(j=>!FINAL.has(j.status)).length>=6)throw new LabError('Six jobs are already queued/running. Wait for a job to finish.',429);
        const prompt=String(b.prompt||'').trim();if(prompt.length>24000||b.provider!=='replicate'&&!prompt)throw new LabError('Enter a prompt between 1 and 24,000 characters.');
        const model=b.provider==='replicate'?(parseModel(b.model).id+(parseModel(b.model).version?':'+parseModel(b.model).version:'')):String(b.model||config[b.provider==='openai'?'OPENAI_IMAGE_MODEL':'XAI_IMAGE_MODEL']);
        if(!/^[a-zA-Z0-9_./:-]{1,180}$/.test(model))throw new LabError('Invalid model identifier.');
        const job={id:randomUUID(),sessionId:/^[a-f0-9-]{36}$/.test(b.sessionId||'')?b.sessionId:null,requestId:b.requestId,provider:b.provider,model,prompt,input:b.input||{},options:b.options||{},createdAt:new Date().toISOString(),status:'queued',phase:'Queued locally',assets:[]};
        if(b.provider==='replicate'){
          const m=await providers.model(model);
          job.input=preparePrompt(job.input,m,b.prompt);
          job.version=m.version;
          // Retain the validated schema/version for the queued request. Official models use their documented endpoint.
          job.validatedModel={id:m.id,version:m.version,official:m.official,schema:m.schema};
          job.input=await materializeReferences(job.input);
          if(!job.prompt&&m.promptKey&&typeof job.input[m.promptKey]==='string')job.prompt=job.input[m.promptKey];
          const {validateInput}=await import('./lib/core.mjs');validateInput(job.input,m.schema);
        }
        if(b.provider==='openai'){
          if(!['1024x1024','1536x1024','1024x1536','1536x864','2048x1152'].includes(job.options.size||'1536x1024'))throw new LabError('Choose a listed image size.');
          if(!['low','medium','high','auto'].includes(job.options.quality||'low'))throw new LabError('Choose a listed image quality.');
        }
        if(b.provider==='xai'&&!['16:9','1:1','3:2','2:3','9:16'].includes(job.options.aspect_ratio||'16:9'))throw new LabError('Choose a listed aspect ratio.');
        state.jobs.push(job);await save();send(res,202,{ok:true,job:publicJob(job)});pump();return;
        }finally{submissions.delete(b.requestId);release();}
      }
      if(route.match(/^\/api\/jobs\/[a-f0-9-]+\/(cancel|download)$/)&&req.method==='POST'){
        const [, , ,id,action]=route.split('/');await bodyJson(req);const job=state.jobs.find(j=>j.id===id);if(!job)throw new LabError('Job not found.',404);
        if(action==='cancel'){
          if(job.status==='queued'&&!activeIds.has(id)){job.status='canceled';job.phase='Canceled before submission';}
          else if(job.provider==='replicate'&&job.providerId&&!FINAL.has(job.status)){await providers.request('replicate',`/predictions/${encodeURIComponent(job.providerId)}/cancel`,{method:'POST'});job.phase='Cancellation requested; waiting for provider confirmation';}
          else throw new LabError('This request cannot be canceled here. Direct OpenAI/Grok submissions cannot be reliably canceled after submission.',409);
        }else{
          if(job.provider!=='replicate'||!job.providerId||activeIds.has(id))throw new LabError('This job cannot be resumed now.',409);
          job.status='queued';job.error=null;job.phase='Retrying output download, not generation';
        }
        await save();send(res,200,{ok:true,job:publicJob(job)});pump();return;
      }
      if((route==='/api/import'||route==='/api/export')&&req.method==='POST'){
        const b=await bodyJson(req);const bytes=decodeImage(b.dataUrl);const asset=await addAsset(bytes,{source:route==='/api/export'?'thumbnail':'import',title:String(b.title||'Untitled').slice(0,160)});await save();return send(res,200,{ok:true,asset});
      }
      if(route==='/api/projects'&&req.method==='POST'){
        const b=await bodyJson(req);const project=b.project;
        if(!project||typeof project!=='object'||JSON.stringify(project).length>900000)throw new LabError('Project is too large or invalid.');
        for(const id of projectAssetIds(project))if(!state.assets[id]||deletingAssets.has(id))throw new LabError('A session image no longer exists.');
        const id=/^[a-f0-9-]{36}$/.test(b.id||'')?b.id:randomUUID();const saved={id,name:String(b.name||'Untitled thumbnail').slice(0,100),updatedAt:new Date().toISOString(),project};
        const i=state.projects.findIndex(p=>p.id===id);if(i>=0)state.projects[i]=saved;else state.projects.push(saved);await save();return send(res,200,{ok:true,project:saved});
      }
      if(route.match(/^\/api\/(projects|jobs|assets)\/[a-f0-9-]+(?:\.(?:png|jpg|webp))?\/delete$/)&&req.method==='POST'){
        await bodyJson(req);const [, ,kind,id]=route.split('/');
        if(kind==='projects'){
          const i=state.projects.findIndex(p=>p.id===id);if(i<0)throw new LabError('Saved session not found.',404);
          state.projects.splice(i,1);await save();return send(res,200,{ok:true,message:'Saved session deleted. Its images and exports are retained.'});
        }
        if(kind==='jobs'){
          const job=state.jobs.find(j=>j.id===id);if(!job)throw new LabError('Generation not found.',404);
          if(!FINAL.has(job.status))throw new LabError('Wait for completion or cancel this generation before deleting its history.',409,'job_active');
          job.deletedAt=new Date().toISOString();job.prompt='';job.input={};job.options={};job.error=null;job.outputUrls=[];
          await save();return send(res,200,{ok:true,message:'Generation history removed. Saved images are retained.'});
        }
        const asset=state.assets[id];if(!asset)throw new LabError('Image not found.',404);
        const refs=state.projects.filter(p=>projectAssetIds(p.project).includes(id));
        if(refs.length)throw new LabError('This image is used by '+refs.length+' saved session(s). Delete or change those sessions first.',409,'asset_in_use');
        if(state.jobs.some(j=>activeIds.has(j.id)&&(j.assets||[]).some(a=>a.id===id)))throw new LabError('This image is still being saved by a running job.',409,'asset_busy');
        // Prevent a concurrent save from referencing an image being deleted.
        if(deletingAssets.has(id))throw new LabError('This image is already being deleted.',409,'asset_busy');
        deletingAssets.add(id);
        try{
          try{await unlink(path.join(data,'assets',id));}catch(e){if(e.code!=='ENOENT')throw e;}
          delete state.assets[id];for(const j of state.jobs)j.assets=(j.assets||[]).filter(a=>a.id!==id);
          await save();return send(res,200,{ok:true,message:'Local image deleted. No provider-side files were changed.'});
        }finally{deletingAssets.delete(id);}
      }
      if(route==='/api/chat'&&req.method==='POST'){
        const b=await bodyJson(req);if(!['openai','xai'].includes(b.provider))throw new LabError('Choose GPT or Grok.');
        if(!Array.isArray(b.messages)||b.messages.length>40||b.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string')||JSON.stringify(b.messages).length>80000)throw new LabError('Conversation is too long. Start a new chat.');
        providers.key(b.provider);const model=String(b.model||config[b.provider==='openai'?'OPENAI_CHAT_MODEL':'XAI_CHAT_MODEL']);
        if(!/^[a-zA-Z0-9_.:-]{1,180}$/.test(model)||modelKind(b.provider,model)==='image')throw new LabError('Choose a chat model from the provider dropdown.');
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),180000);res.on('close',()=>controller.abort());
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive'});
        const event=(type,data)=>{if(!res.destroyed)res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);};
        event('status',{message:'Waiting for '+model});
        try{const result=await providers.chat(b.provider,b.messages,model,delta=>event('delta',{text:delta}),controller.signal);event('done',{completed:result.completed});}
        catch(e){event('error',{message:sanitize(e.message,config)});}finally{clearTimeout(timer);res.end();}return;
      }
      if(route.startsWith('/assets/')&&req.method==='GET'){
        const id=route.slice(8),asset=state.assets[id];if(!asset||!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(id))throw new LabError('Image not found.',404);
        const bytes=await readFile(path.join(data,'assets',id));res.setHeader('Cache-Control','private, max-age=31536000, immutable');res.setHeader('Content-Type',asset.mime);
        if(url.searchParams.has('download'))res.setHeader('Content-Disposition',`attachment; filename="thirdrailify-${id}"`);res.end(bytes);return;
      }
      if(route.startsWith('/brand-fonts/')&&req.method==='GET'){
        const file=fonts[route.split('/')[2]];if(!file)throw new LabError('Brand font not installed locally.',404);
        res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'font/ttf');res.end(await readFile(file));return;
      }
      if(route==='/brand-assets/labs0.svg'&&req.method==='GET'){
        if(!brand.logo)throw new LabError('Place your labs0.svg in assets/logos in the Lab repo or POC folder, then restart the Lab.',404,'brand_asset_missing');
        res.setHeader('Content-Type','image/svg+xml');res.setHeader('Cache-Control','no-cache');res.end(await readFile(brand.logo));return;
      }
      const files={'/model-schema.js':'model-schema.js','/workspace.css':'workspace.css','/research':'index.html','/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/upgrade.css':'upgrade.css','/icons.svg':'icons.svg'};
      if(req.method==='GET'&&files[route]){const file=files[route];res.setHeader('Content-Type',mime[path.extname(file)]);res.setHeader('Cache-Control','no-cache');res.end(await readFile(path.join(publicRoot,file)));return;}
      throw new LabError('Not found.',404,'not_found');
    }catch(e){if(res.headersSent){res.end();return;}send(res,e.status||500,{ok:false,error:sanitize(e.message,config),code:e.code||'local_error'});}
  });
  server.requestTimeout=60000;
  return {server,config,async start(port=Number(config.PORT)||4317){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});pump();return server.address().port;},async close(){stopping=true;server.closeAllConnections();await new Promise(r=>server.close(r));await writeChain;},state,providers};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const app=await createLab();const port=await app.start();const address=`http://127.0.0.1:${port}`;
    console.log('\n THIRD RAILIFY LAB — LOCAL POC\n '+address+'\n Keys: .env | Originals, projects, exports: .data/\n No npm install/build required. Keep this window open. Ctrl+C stops it.\n Local-only: do not tunnel or deploy this un-gated POC.\n');
    if(process.argv.includes('--open')){
      const cmd=process.platform==='win32'?'cmd.exe':process.platform==='darwin'?'open':'xdg-open';
      const args=process.platform==='win32'?['/c','start','',address]:[address];
      const opener=spawn(cmd,args,{stdio:'ignore',detached:true});opener.on('error',()=>{});opener.unref();
    }
    process.once('SIGINT',()=>{console.log('\nStopping local Lab. Submitted provider work may continue; Replicate jobs resume on next launch.');app.close().then(()=>process.exit(0));});
  }catch(e){console.error(e.code==='EADDRINUSE'?'Port is already in use. The Lab may already be running; open http://127.0.0.1:4317.':e.message);process.exitCode=1;}
}
