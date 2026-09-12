import {CanvasView} from './canvas-view.js';
import {renderMarkdown,safeUrl} from './rich-text.js';
import {workflowFor,isImageField,safeImageUrl,missingInputs,preparePrompt} from './model-schema.js';
import { labSession, scopedStorage, storagePrefix, updateAccountWidget, signOut } from './session.js';
const localStorage=scopedStorage;
const $=id=>document.getElementById(id);
const icon=name=>`<svg class="icon"><use href="/icons.svg#${name}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={csrf:labSession.csrfToken,config:null,provider:'replicate',modelId:'black-forest-labs/flux-schnell',model:null,assets:[],jobs:[],projects:[],selected:null,image:null,currentJob:null,mode:'generate',style:'',fileInputs:{},pollTimer:null,chatBusy:false,chatAbort:null,projectId:null,chosen:{},modelChoices:{},researchOnly:location.pathname==='/research',activeSessionId:null,restoring:false,paramValues:{},inputBusy:0,loadTicket:0,page:'generate'};
let toastTimer;const pendingGenerations=new Set();let sessionSwitchToken=0;
function toast(text,error=false){$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?8500:4200);}
function error(text){$('mainError').textContent=text;$('mainError').hidden=!text;}
async function api(route,{method='GET',body,signal}={}){
  if(method==='POST'&&body){
    body={...body};
    if(['/api/import','/api/export','/api/attachments','/api/generate'].includes(route)){body.projectId=body.projectId||body.sessionId||state.activeSessionId;if(!body.projectId)throw new Error('Open a project first.');await ensureRemoteProject(body.projectId);}
    if(route==='/api/projects')body.revision=projectRevisions.get(body.id)||0;
    const match=route.match(/^\/api\/projects\/([^/]+)\//);if(match)body.revision=projectRevisions.get(match[1])||0;
    if(['/api/preferences','/api/research/profile','/api/settings'].includes(route))body.revision=state.preferencesRevision||0;
  }
  const response=await fetch(route,{method,headers:{'X-Lab-Account':labSession.account.id,...(method==='POST'?{'Content-Type':'application/json','X-Lab-CSRF':state.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body),signal});
  if(!response.headers.get('content-type')?.includes('application/json'))throw new Error(`The Lab service returned an unexpected response (HTTP ${response.status}). Please try again shortly.`);
  const data=await response.json();if(response.status===401||['workshop_denied','account_changed'].includes(data.error)){location.replace('/login.html');throw new Error(data.message||'Access changed.');}if(!response.ok||data.ok===false)throw new Error(data.message||data.error||`Request failed (${response.status})`);if(data.project?.revision){projectRevisions.set(data.project.id,data.project.revision);const d=readDoc(data.project.id);if(d){d.serverRevision=data.project.revision;writeDoc(d);}}if(data.preferencesRevision!==undefined)state.preferencesRevision=data.preferencesRevision;return data;
}
function on(id,event,handler){$(id).addEventListener(event,async e=>{try{await handler(e);}catch(err){toast(err.message,true);}});}
const projectRevisions=new Map();
const creatingProjects=new Map();
async function ensureRemoteProject(projectId){if(projectRevisions.has(projectId))return;if(creatingProjects.has(projectId))return creatingProjects.get(projectId);const doc=readDoc(projectId);if(doc?.serverRevision&&!projectRevisions.has(projectId))projectRevisions.set(projectId,doc.serverRevision);if(!doc)throw new Error('Project is no longer open.');const task=api('/api/projects',{method:'POST',body:{id:projectId,name:doc.name,project:{...doc,research:docResearch(projectId)}}});creatingProjects.set(projectId,task);try{await task;}finally{creatingProjects.delete(projectId);}}
const activeStatus=s=>!['succeeded','failed','canceled','submission_uncertain','interrupted','download_failed'].includes(s);
const niceStatus=s=>String(s||'').replaceAll('_',' ');
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read this image.'));r.readAsDataURL(file);});
function storageGet(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function storageSet(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{toast('Local browser storage is full. Saved image projects remain in your account.',true);}}

async function boot(){
  const data=await api('/api/state');state.csrf=labSession.csrfToken;state.preferencesRevision=data.preferencesRevision;for(const p of data.projects)projectRevisions.set(p.id,readDoc(p.id)?.serverRevision??p.revision);updateAccountWidget();state.config=data.config;state.jobs=data.jobs;state.assets=data.assets;state.projects=data.projects;state.catalog=data.catalog;state.attachments=data.attachments||[];
  document.fonts.ready.then(()=>drawThumbnail());
  $('serverStatus').textContent='Private Workshop connected';state.chosen=storageGet('tr-lab-model-choices',{});state.preferences=data.preferences||{};
  setupBrand();setupLayout();setupFinalUI();updateKeyStatus();renderHistory();renderModelCards(state.catalog);
  await initWorkspace();
  if(state.activeSessionId)await recoverResearch(state.activeSessionId);
  schedulePoll();
  document.body.dataset.ready='true';
}

function updateKeyStatus(){
  $('keyDot').classList.toggle('ready',Object.entries(state.config.keys).some(([k,v])=>k!=='REPLICATE_WEBHOOK_SIGNING_SECRET'&&v));
  updateDirectControls();
}
function setMode(mode){
  if(!state.activeSessionId&&!state.restoring){toast('Open or create a project from Library first.');showLibrary();return;}
  state.mode=mode;state.page=mode;document.body.classList.toggle('thumbnail-mode',mode==='thumbnail');$('appShell').classList.remove('shell-mode');$('libraryPage').hidden=true;$('workspaceSettingsPage').hidden=true;$('brandAssetsPage').hidden=true;$('brandPageButton').classList.remove('active');$('sectionEyebrow').textContent=mode==='thumbnail'?'02 / COMPOSE':'01 / CREATE';
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('libraryButton').classList.remove('active');$('settingsPageButton').classList.remove('active');
  $('generationControls').hidden=mode!=='generate';$('thumbnailControls').hidden=mode!=='thumbnail';$('promptCard').hidden=mode!=='generate';
  $('modeLabel').textContent=mode==='thumbnail'?'Thumbnail composer':'Image studio';$('inspectorTitle').textContent=mode==='thumbnail'?'Composition settings':'Generation settings';$('workTitle').innerHTML=mode==='thumbnail'?'THUMBNAIL COMPOSER<span>.</span>':'THE IMAGE STUDIO<span>.</span>';
  renderStage();renderWorkflow();if(!state.restoring)captureSession(false);resizePanels();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));

document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>{
  rememberInputs();state.provider=b.dataset.provider;state.fileInputs={};state.paramValues={};document.querySelectorAll('[data-provider]').forEach(x=>x.classList.toggle('active',x===b));
  error('');$('replicateModelSection').hidden=state.provider!=='replicate';$('directModelSection').hidden=state.provider==='replicate';$('advancedSection').hidden=state.provider!=='replicate';
  if(state.provider==='replicate')renderParameters();else updateDirectControls();renderWorkflow();captureSession();
});
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{state.presetId=b.dataset.preset;state.style=presets()[state.presetId]||'';updatePresetDisplay();captureSession();});
on('prompt','input',()=>{captureSession();renderWorkflow();});

function renderModelCards(items){
  $('modelResults').innerHTML=items.length?items.map(m=>`<button class="model-result" data-model-id="${esc(m.id)}">${safeImageUrl(m.coverImageUrl)?`<img class="model-cover" src="${esc(m.coverImageUrl)}" alt="${esc(m.name)} model example" loading="lazy" referrerpolicy="no-referrer">`:`<span class="model-cover-empty">${icon('image')}</span>`}<span class="model-result-copy"><span class="tag">${esc(m.tag||'Replicate model')}</span><strong>${esc(m.name)}</strong><small>${esc(m.id)}</small><p>${esc(m.description||'Load to inspect its live schema and model inputs.')}</p>${m.runCount!=null?`<span class="model-stats">${new Intl.NumberFormat('en-US',{notation:'compact'}).format(m.runCount)} runs · reported by Replicate</span>`:''}</span>${icon('arrow')}</button>`).join(''):'<div class="soft-note">No models found. Try another search or paste the model URL.</div>';
  $('modelResults').querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;});
  $('modelResults').querySelectorAll('[data-model-id]').forEach(b=>b.onclick=async()=>{try{await loadModel(b.dataset.modelId);$('modelsDialog').close();}catch(e){$('modelSearchError').textContent=e.message;$('modelSearchError').hidden=false;}});
}

on('modelPicker','click',()=>{$('modelSearchError').hidden=true;renderModelCards(state.catalog);$('modelsDialog').showModal();});
on('loadModel','click',async()=>{if(!state.config.keys.REPLICATE_API_TOKEN)return showSettings();await loadModel(state.modelId);});
on('searchModels','click',async()=>{
  const q=$('modelQuery').value.trim();$('modelSearchError').hidden=true;
  if(!q)return renderModelCards(state.catalog);
  $('searchModels').disabled=true;
  try{if(/^https:\/\/replicate\.com\//.test(q)||/^[\w-]+\/[\w.:-]+$/.test(q)){await loadModel(q);$('modelsDialog').close();}else{const data=await api('/api/models/search?q='+encodeURIComponent(q));renderModelCards(data.items);}}
  catch(e){$('modelSearchError').textContent=e.message;$('modelSearchError').hidden=false;}finally{$('searchModels').disabled=false;}
});
on('modelQuery','keydown',e=>{if(e.key==='Enter'){$('searchModels').click();}});
async function loadModel(id){
  const sid=state.activeSessionId,ticket=++state.loadTicket;$('schemaStatus').textContent='Reading current provider schema…';$('loadModel').disabled=true;
  try{
    const data=await api('/api/model?id='+encodeURIComponent(id));if(state.activeSessionId!==sid||ticket!==state.loadTicket)return;
    const same=state.modelId===(data.model.ref||data.model.id);if(!same){state.fileInputs={};state.paramValues={};$('advancedJson').value='';}
    state.model=data.model;state.modelId=data.model.ref||data.model.id;
    $('modelName').textContent=data.model.name;$('modelOwner').textContent=data.model.id.split('/')[0];
    $('schemaStatus').textContent=`Live inputs loaded · version ${String(data.model.version).slice(0,10)}`;
    if(state.provider==='replicate')renderParameters();renderModelInfo();renderWorkflow();captureSession(false);
  }catch(e){if(sid===state.activeSessionId)$('schemaStatus').textContent=e.message;throw e;}finally{if(ticket===state.loadTicket)$('loadModel').disabled=false;}
}
function rememberInputs(){
  if(state.provider!=='replicate')return;
  for(const el of $('parameterForm').querySelectorAll('[data-param]'))state.paramValues[el.dataset.param]=el.value;
}
function renderParameters(){
  if(state.provider!=='replicate')return;
  const m=state.model;
  if(!m){$('parameterForm').innerHTML='<div class="soft-note">Connect Replicate and load the selected model to view its real inputs.</div>';$('fieldCount').textContent='—';renderWorkflow();return;}
  const fields=Object.entries(m.schema.properties||{}).filter(([k])=>k!==m.promptKey).sort((a,b)=>(a[1]['x-order']??99)-(b[1]['x-order']??99));
  $('fieldCount').textContent=fields.length+' FIELDS';
  $('parameterForm').innerHTML=fields.map(([key,p])=>{
    const required=(m.schema.required||[]).includes(key),name=p.title||key.replaceAll('_',' '),id='param_'+key,val=state.paramValues[key]??p.default??'';
    const attrs=`id="${esc(id)}" data-param="${esc(key)}" data-type="${esc(p.type||'string')}" aria-required="${required}"`;
    let control;
    if(p.enum)control=`<select ${attrs}><option value="">Provider default${required?' / choose':''}</option>${p.enum.map(v=>`<option value="${esc(String(v))}" ${String(v)===String(val)?'selected':''}>${esc(String(v))}</option>`).join('')}</select>`;
    else if(p.type==='boolean')control=`<select ${attrs}><option value="">Provider default</option><option value="true" ${String(val)==='true'?'selected':''}>Yes</option><option value="false" ${String(val)==='false'?'selected':''}>No</option></select>`;
    else if(p.type==='integer'||p.type==='number')control=`<input ${attrs} type="number" value="${esc(val)}" step="${p.type==='integer'?1:'any'}" ${p.minimum!==undefined?`min="${p.minimum}"`:''} ${p.maximum!==undefined?`max="${p.maximum}"`:''} placeholder="Provider default">`;
    else if(p.type==='array'||p.type==='object')control=`<textarea ${attrs} rows="2" placeholder='${p.type==='array'?'[ ]':'{ }'}'>${esc(typeof val==='string'?val:JSON.stringify(val))}</textarea>`;
    else control=`<input ${attrs} value="${esc(val)}" placeholder="${isImageField(key,p)?'HTTPS image URL or attach below':'Provider default'}">`;
    const media=isImageField(key,p);
    const upload=media?`<input type="file" accept="image/png,image/jpeg,image/webp" data-reference="${esc(key)}" ${p.type==='array'?'multiple':''} aria-label="Upload ${esc(name)}"><small data-file-note="${esc(key)}">Saved locally first. Sent to the provider only when you generate.</small><div class="input-preview" data-preview="${esc(key)}"></div><button type="button" class="text-button input-clear" data-clear-input="${esc(key)}">Clear image${p.type==='array'?'s':''}</button>`:'';
    return `<div class="field"><label for="${esc(id)}">${esc(name)}${required?' *':''}</label>${control}${upload}<small>${esc((p.description||'').slice(0,350))}</small></div>`;
  }).join('')||'<div class="soft-note">This model uses only the prompt.</div>';
  $('parameterForm').querySelectorAll('[data-reference]').forEach(el=>el.onchange=async()=>{
    const sid=state.activeSessionId,model=state.modelId,key=el.dataset.reference,files=[...el.files];if(!files.length)return;
    state.inputBusy++;renderWorkflow();
    try{
      if(files.length>4)throw new Error('Up to four reference images per field in this POC.');if(files.some(f=>f.size>5*1024*1024))throw new Error('Each reference image must be 5 MB or smaller.');
      const assets=[];for(const file of files){const r=await api('/api/import',{method:'POST',body:{dataUrl:await readFile(file),title:'Input · '+file.name}});assets.push(r.asset);state.assets.unshift(r.asset);}
      if(sid!==state.activeSessionId||model!==state.modelId){toast('Inputs saved to Library. The original model/session is no longer active.');return;}
      const urls=assets.map(a=>a.url);state.fileInputs[key]=el.multiple?urls:urls[0];state.paramValues[key]='';$('param_'+key).value='';
      el.parentElement.querySelector('[data-file-note]').textContent=files.map(f=>f.name).join(', ')+' · saved privately';renderInputPreview(key);captureSession();
    }catch(e){el.value='';toast(e.message,true);}finally{state.inputBusy--;renderWorkflow();}
  });
  $('parameterForm').querySelectorAll('[data-param]').forEach(el=>el.addEventListener('input',()=>{delete state.fileInputs[el.dataset.param];state.paramValues[el.dataset.param]=el.value;renderInputPreview(el.dataset.param);captureSession();renderWorkflow();}));
  $('parameterForm').querySelectorAll('[data-clear-input]').forEach(b=>b.onclick=()=>{const k=b.dataset.clearInput;delete state.fileInputs[k];state.paramValues[k]='';$('param_'+k).value='';const f=b.parentElement.querySelector('[data-reference]');if(f)f.value='';renderInputPreview(k);captureSession();renderWorkflow();});
  for(const [k,p] of fields)if(isImageField(k,p))renderInputPreview(k);renderWorkflow();
}
function fieldImages(key){let v=state.fileInputs[key];if(v===undefined){const el=$('param_'+key);v=el?.value||state.paramValues[key]||'';if(el?.dataset.type==='array')try{v=JSON.parse(v);}catch{v=[];}}return (Array.isArray(v)?v:[v]).map(safeImageUrl).filter(Boolean).slice(0,4);}
function renderInputPreview(key){
  const box=[...$('parameterForm').querySelectorAll('[data-preview]')].find(n=>n.dataset.preview===key);if(!box)return;
  box.innerHTML=fieldImages(key).map(url=>`<div class="input-preview-item"><img src="${esc(url)}" alt="${esc(key.replaceAll('_',' '))} preview" referrerpolicy="no-referrer"><small>${url.startsWith('/assets/')?'Local input · ready':'Direct URL · preview'}</small></div>`).join('');
  box.querySelectorAll('img').forEach(img=>img.onerror=()=>{img.hidden=true;const t=img.nextElementSibling;t.className='preview-error';t.textContent='Preview unavailable. Check that this URL is an accessible image.';});
}

function collectInputs(){
  const data={};
  for(const el of $('parameterForm').querySelectorAll('[data-param]')){
    const key=el.dataset.param,type=el.dataset.type,v=el.value;
    if(state.fileInputs[key]!==undefined){data[key]=state.fileInputs[key];continue;}
    if(v==='')continue;
    if(type==='integer'||type==='number')data[key]=Number(v);
    else if(type==='boolean')data[key]=v==='true';
    else if(type==='array'||type==='object'){try{data[key]=JSON.parse(v);}catch{throw new Error(`Enter valid JSON for ${key}, or leave it empty.`);}}
    else data[key]=v;
  }
  let extra={};try{extra=JSON.parse($('advancedJson').value||'{}');}catch{throw new Error('Advanced input JSON is invalid.');}
  if(!extra||Array.isArray(extra)||typeof extra!=='object')throw new Error('Advanced inputs must be a JSON object.');
  return {...data,...extra};
}
function updateDirectControls(){
  if(state.provider==='replicate'||!state.config)return;
  const p=state.provider;$('fieldCount').textContent=p==='openai'?'2 FIELDS':'1 FIELD';
  $('parameterForm').innerHTML=p==='openai'?`<label class="field">Output size<select id="directSize"><option value="1536x1024">1536 × 1024 · landscape</option><option value="1024x1024">1024 × 1024 · square</option><option value="1024x1536">1024 × 1536 · portrait</option></select></label><label class="field">Quality<select id="directQuality"><option value="low">Low · draft</option><option value="medium">Medium</option><option value="high">High</option><option value="auto">Model decides</option></select></label><p class="helper">One image per submission. Model-specific options/access are validated by the provider. Attach reference images beside Generate to edit an existing image.</p>`:`<label class="field">Aspect ratio<select id="directRatio"><option>16:9</option><option>1:1</option><option>3:2</option><option>2:3</option><option>9:16</option></select></label><p class="helper">One image per submission. Output is saved privately.</p>`;
  loadImageModels().catch(()=>{});renderWorkflow();
}
on('generate','click',async()=>{
  if(!state.activeSessionId)return toast('Create a project session first.',true);
  error('');const sid=state.activeSessionId,provider=state.provider;
  const key={replicate:'REPLICATE_API_TOKEN',openai:'OPENAI_API_KEY',xai:'XAI_API_KEY'}[provider];if(!state.config.keys[key])return showSettings();
  if(state.inputBusy)return toast('Wait for the input images to finish saving.',true);
  if(pendingGenerations.has(sid))return;pendingGenerations.add(sid);renderWorkflow();
  try{
    if(provider==='replicate'&&!state.model)await loadModel(state.modelId);if(sid!==state.activeSessionId)return;
    let prompt=$('prompt').value.trim(),input=provider==='replicate'?collectInputs():{};
    const w=provider==='replicate'?workflowFor(state.model):{hasPrompt:true,promptRequired:true};
    if(w.hasPrompt&&prompt&&state.style)prompt+='\n\nArt direction: '+state.style;
    if(provider==='replicate'){
      input=preparePrompt(input,state.model,w.hasPrompt?prompt:undefined);const missing=missingInputs(input,state.model.schema);if(missing.length)throw new Error('Required inputs: '+missing.map(k=>state.model.schema.properties[k]?.title||k).join(', '));
    }else if(!prompt)throw new Error('Enter your generation prompt first.');
    const model=provider==='replicate'?state.modelId:$('imageModelSelect').value;if(!model||(provider!=='replicate'&&$('imageModelSelect').disabled))throw new Error('Choose an image model. Refresh the model list if needed.');
    const options=provider==='openai'?{size:$('directSize').value,quality:$('directQuality').value}:provider==='xai'?{aspect_ratio:$('directRatio').value}:{};
    if(provider!=='replicate')options.references=state.directReferences||[];
    captureSession();const result=await api('/api/generate',{method:'POST',body:{provider,model,prompt:w.hasPrompt?prompt:'',input,options,sessionId:sid,requestId:crypto.randomUUID()}});
    state.jobs.unshift(result.job);const doc=readDoc(sid);if(doc){doc.currentJob=result.job.id;writeDoc(doc);}
    if(sid===state.activeSessionId){state.currentJob=result.job.id;renderJob();}renderTabs();schedulePoll();
  }catch(e){if(sid===state.activeSessionId)error(e.message);else toast(e.message,true);}finally{pendingGenerations.delete(sid);renderWorkflow();}
});

on('prompt','keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('generate').click();}});
function renderJob(){
  const j=state.jobs.find(x=>x.id===state.currentJob);const running=j&&activeStatus(j.status);
  $('jobOverlay').hidden=!running;
  if(running){$('jobPhase').textContent=j.phase||niceStatus(j.status);$('jobElapsed').textContent=`${niceStatus(j.status).toUpperCase()} · ${Math.max(0,Math.floor((Date.now()-new Date(j.createdAt))/1000))}s elapsed`;$('cancelCurrent').hidden=!(j.status==='queued'||j.provider==='replicate'&&j.providerId);}
  if(j?.error&&!running)error(j.error);
}
function schedulePoll(){clearTimeout(state.pollTimer);if(state.jobs.some(j=>activeStatus(j.status)))state.pollTimer=setTimeout(refreshJobs,2000);}
async function refreshJobs(){
  try{
    const data=await api('/api/jobs');state.jobs=data.jobs;
    for(const j of state.jobs)for(const a of j.assets||[])if(!state.assets.some(x=>x.id===a.id))state.assets.unshift(a);
    for(const j of state.jobs){
      const sid=j.sessionId||((state.currentJob===j.id)?state.activeSessionId:null),doc=sid&&readDoc(sid);
      if(doc&&doc.currentJob===j.id&&j.status==='succeeded'&&j.assets.length){
        doc.assetId=j.assets[0].id;doc.currentJob=null;doc.dirty=true;writeDoc(doc);
        if(sid===state.activeSessionId){state.currentJob=null;await selectAsset(j.assets[0]);toast('Generation complete. Original saved to this project and Library.');}
      }
    }

    renderJob();renderHistory();$('serverStatus').textContent='Private Workshop connected';
  }catch(e){$('serverStatus').textContent='Server connection interrupted';error(e.message);}
  schedulePoll();
}
on('cancelCurrent','click',async()=>{if(!state.currentJob)return;await api('/api/jobs/'+state.currentJob+'/cancel',{method:'POST',body:{}});await refreshJobs();});

async function selectAsset(asset){
  if(!state.activeSessionId&&!state.restoring)await newSession();const sid=state.activeSessionId;const image=new Image();image.src=asset.url;
  try{await image.decode();}catch{throw new Error('Saved image could not be decoded. Open the library and check its download.');}
  if(sid!==state.activeSessionId)return;state.selected=asset;state.image=image;$('resultImage').src=asset.url;$('resultImage').alt=asset.title||'Generated or imported image';
  $('useThumbnail').disabled=false;$('downloadOriginal').disabled=false;renderStage();renderHistory();captureSession();
}
async function applyAssetToSession(sid,asset,mode){
  const doc=readDoc(sid);if(doc){doc.assetId=asset.id;doc.dirty=true;if(mode)doc.mode=mode;writeDoc(doc);}
  if(sid===state.activeSessionId){await selectAsset(asset);if(mode)setMode(mode);}else renderTabs();
}

function renderStage(){
  const thumb=state.mode==='thumbnail';$('emptyStage').hidden=Boolean(state.image)||thumb;$('resultImage').hidden=!state.image||thumb;$('thumbCanvas').hidden=!thumb;
  if(thumb){drawThumbnail();$('canvasLabel').textContent='COMPOSER / EDITABLE TEXT';}
  else $('canvasLabel').textContent='CANVAS / ORIGINAL';
  $('assetMeta').textContent=state.image?`${state.image.naturalWidth} × ${state.image.naturalHeight} · ${state.selected.source==='generation'?'Generated original':state.selected.source==='thumbnail'?'Thumbnail export':'Local image'} · ${Math.round(state.selected.bytes/1024)} KB`:'Original framing preserved · No image loaded';
  renderJob();canvasView?.update();renderStudioAttachments();
}
function renderHistory(){
  const assets=state.assets.slice(0,30);$('outputCount').textContent=String(state.assets.length).padStart(2,'0');
  $('historyStrip').innerHTML=assets.length?assets.map(a=>`<button class="history-thumb ${a.id===state.selected?.id?'active':''}" data-asset="${a.id}" title="${esc(a.title||a.source)}"><img src="${a.url}" alt="${esc(a.title||'Saved image')}"><small>${esc(a.source.toUpperCase())}</small></button>`).join(''):`<div class="history-empty">${icon('grid')}Your generations and imports will live here.</div>`;
  $('historyStrip').querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>selectAsset(state.assets.find(a=>a.id===b.dataset.asset)).catch(e=>toast(e.message,true)));
}
on('useThumbnail','click',()=>setMode('thumbnail'));
on('downloadOriginal','click',()=>{if(state.selected)download(state.selected.url+'?download=1');});
function download(url){const a=document.createElement('a');a.href=url;a.download='';document.body.append(a);a.click();a.remove();}
on('fullScreen','click',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await $('stageShell').requestFullscreen();});
on('importButton','click',()=>$('imageUpload').click());on('importThumb','click',()=>$('imageUpload').click());
on('imageUpload','change',async e=>{
  const file=e.target.files[0];if(!file)return;const sid=state.activeSessionId||await newSession();
  try{if(file.size>12*1024*1024)throw new Error('Import an image smaller than 12 MB.');const result=await api('/api/import',{method:'POST',body:{dataUrl:await readFile(file),title:file.name}});state.assets.unshift(result.asset);await applyAssetToSession(sid,result.asset);toast('Image saved privately. It has not been sent to an AI provider.');}finally{e.target.value='';}
});

const thumbIds=['thumbSize','thumbFit','thumbTitle','thumbFontSize','thumbColor','thumbAccent','thumbX','thumbY','thumbBadge','thumbSubtitle','thumbDim','thumbBrand','exportType'];
$('thumbTitle').value='YOUR NEXT\nBIG IDEA';
function thumbSettings(){return Object.fromEntries(thumbIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));}
function applySettings(settings){for(const id of thumbIds)if(settings[id]!==undefined){if($(id).type==='checkbox')$(id).checked=Boolean(settings[id]);else $(id).value=settings[id];}drawThumbnail();}
for(const id of thumbIds)on(id,'input',()=>{drawThumbnail();captureSession();});
function wrapText(ctx,text,maxWidth){
  const lines=[];
  for(const paragraph of text.split('\n')){
    let line='';for(const word of paragraph.split(' ')){const candidate=line?line+' '+word:word;if(line&&ctx.measureText(candidate).width>maxWidth){lines.push(line);line=word;}else line=candidate;}lines.push(line);
  }return lines.slice(0,7);
}
function drawThumbnail(){
  if(state.mode!=='thumbnail')return;
  const c=$('thumbCanvas'),[w,h]=$('thumbSize').value.split('x').map(Number);if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
  const ctx=c.getContext('2d'),scale=w/1280,accent=$('thumbAccent').value;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b0f07';ctx.fillRect(0,0,w,h);
  if(state.image){const im=state.image,fit=$('thumbFit').value==='cover'?Math.max(w/im.naturalWidth,h/im.naturalHeight):Math.min(w/im.naturalWidth,h/im.naturalHeight),iw=im.naturalWidth*fit,ih=im.naturalHeight*fit;ctx.drawImage(im,(w-iw)/2,(h-ih)/2,iw,ih);}
  else{const gr=ctx.createLinearGradient(0,0,w,h);gr.addColorStop(0,'#28301c');gr.addColorStop(.55,'#0d1309');gr.addColorStop(1,'#3c3015');ctx.fillStyle=gr;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#bca65818';ctx.lineWidth=1;for(let x=0;x<w;x+=60*scale){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=60*scale){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}
  const dim=Number($('thumbDim').value)/100;ctx.fillStyle=`rgba(0,0,0,${dim})`;ctx.fillRect(0,0,w,h);
  const shade=ctx.createLinearGradient(0,0,0,h);shade.addColorStop(0,'#00000000');shade.addColorStop(1,'#00000099');ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  const fonts=getComputedStyle(document.documentElement),display=fonts.getPropertyValue('--display').trim(),mono=fonts.getPropertyValue('--mono').trim(),body=fonts.getPropertyValue('--body').trim();
  const x=w*Number($('thumbX').value)/100,y=h*Number($('thumbY').value)/100,size=Number($('thumbFontSize').value)*scale;ctx.font=`${state.config?.fonts.includes('display')?400:800} ${size}px ${display}`;ctx.textBaseline='top';ctx.lineJoin='round';const lines=wrapText(ctx,$('thumbTitle').value.toUpperCase(),w-x-w*.055);const lineH=size*.98;
  ctx.shadowColor='#000000b3';ctx.shadowBlur=12*scale;ctx.shadowOffsetY=3*scale;ctx.lineWidth=4*scale;ctx.strokeStyle='#080c06';ctx.fillStyle=$('thumbColor').value;
  lines.forEach((line,i)=>{ctx.strokeText(line,x,y+i*lineH,w-x-w*.055);ctx.fillText(line,x,y+i*lineH,w-x-w*.055);});ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.fillStyle=accent;ctx.fillRect(x,y-22*scale,72*scale,5*scale);
  const label=$('thumbBadge').value;if(label){ctx.font=`600 ${15*scale}px ${mono}`;const tw=Math.min(ctx.measureText(label).width,w*.8);ctx.fillStyle='#080c08b8';ctx.fillRect(w*.06,h*.075,tw+30*scale,36*scale);ctx.fillStyle=accent;ctx.fillText(label,w*.06+15*scale,h*.075+11*scale,w*.76);}
  if($('thumbSubtitle').value){ctx.font=`400 ${24*scale}px ${body}`;ctx.fillStyle='#f2f3df';ctx.fillText($('thumbSubtitle').value,x,Math.min(h-40*scale,y+lines.length*lineH+14*scale),w-x-w*.06);}
  if($('thumbBrand').checked){const bx=w-w*.095,by=h*.079,bs=47*scale;ctx.fillStyle=accent;ctx.beginPath();ctx.roundRect(bx,by,bs,bs,9*scale);ctx.fill();ctx.save();ctx.translate(bx+9*scale,by+6*scale);ctx.scale(scale*1.25,scale*1.25);ctx.fillStyle='#11170b';ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(2,16);ctx.lineTo(13,16);ctx.lineTo(10,28);ctx.lineTo(26,11);ctx.lineTo(15,11);ctx.closePath();ctx.fill();ctx.restore();}
  $('fontSizeOut').textContent=$('thumbFontSize').value;
}
let dragging=false;
$('thumbCanvas').addEventListener('pointerdown',e=>{dragging=true;$('thumbCanvas').setPointerCapture(e.pointerId);moveTitle(e);});
$('thumbCanvas').addEventListener('pointermove',e=>{if(dragging)moveTitle(e);});
$('thumbCanvas').addEventListener('pointerup',()=>{dragging=false;captureSession();});
function moveTitle(e){const r=$('thumbCanvas').getBoundingClientRect();$('thumbX').value=Math.max(5,Math.min(80,100*(e.clientX-r.left)/r.width));$('thumbY').value=Math.max(10,Math.min(85,100*(e.clientY-r.top)/r.height));drawThumbnail();}
on('demoButton','click',async()=>{
  const sid=state.activeSessionId||await newSession();
  const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');const g=ctx.createLinearGradient(0,0,1280,720);g.addColorStop(0,'#19192b');g.addColorStop(.42,'#060b0e');g.addColorStop(1,'#2d2a0c');ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
  const light=ctx.createRadialGradient(840,250,5,850,260,500);light.addColorStop(0,'#a48a374f');light.addColorStop(1,'#10101700');ctx.fillStyle=light;ctx.fillRect(0,0,1280,720);
  ctx.save();ctx.translate(850,350);ctx.rotate(-.3);for(let i=0;i<26;i++){ctx.beginPath();ctx.ellipse(0,0,90+i*13,140+i*9,0,0,Math.PI*2);ctx.strokeStyle=`rgba(${i%3===0?'211,184,80':'106,91,161'},${.05+(26-i)/80})`;ctx.lineWidth=i%4===0?3:1;ctx.stroke();}ctx.restore();
  ctx.strokeStyle='#b2983433';for(let i=0;i<20;i++){ctx.beginPath();ctx.moveTo(40+i*75,720);ctx.lineTo(760+i*12,0);ctx.stroke();}
  const out=await api('/api/import',{method:'POST',body:{dataUrl:c.toDataURL('image/png'),title:'Layout study — procedural artwork, not AI-generated'}});state.assets.unshift(out.asset);await applyAssetToSession(sid,out.asset,'thumbnail');toast('Layout study loaded. This is procedural demo artwork, not an AI generation.');
});
on('saveProject','click',saveSession);on('saveSession','click',saveSession);on('discardSession','click',discardSession);
on('exportThumb','click',async()=>{
  const sid=state.activeSessionId;await document.fonts.ready;if(sid!==state.activeSessionId)throw new Error('Project changed before export. Select it again to export.');drawThumbnail();const format=$('exportType').value;const r=await api('/api/export',{method:'POST',body:{dataUrl:$('thumbCanvas').toDataURL('image/'+format,.93),title:$('thumbTitle').value.replaceAll('\n',' ')||'Thumbnail'}});state.assets.unshift(r.asset);renderHistory();download(r.asset.url+'?download=1');toast('Export stored privately and sent to your browser downloads.');
});

async function showLibrary(){
  if(state.researchOnly)return location.assign('/');captureSession(false);showShellPage('library');
  const r=await api('/api/state');state.assets=r.assets;state.projects=r.projects;for(const p of r.projects)if(!readDoc(p.id))projectRevisions.set(p.id,p.revision);state.jobs=r.jobs;renderLibrary();
}
function renderLibrary(){
  const query=$('librarySearch').value.trim().toLowerCase(),matches=v=>String(v||'').toLowerCase().includes(query);
  const projects=state.projects.filter(p=>matches(p.name)),assets=state.assets.filter(a=>matches(a.title||a.source));
  $('projectList').innerHTML=projects.length?projects.map(p=>`<div class="project-entry"><button class="project-chip" data-project="${p.id}">${esc(p.name)}<small>Project + research · ${esc(new Date(p.updatedAt).toLocaleString('en-US'))}</small></button><button class="icon-button" data-rename-project="${p.id}" aria-label="Rename session ${esc(p.name)}" title="Rename session">${icon('edit')}</button><button class="icon-button danger-text" data-delete-project="${p.id}" aria-label="Delete session ${esc(p.name)}">${icon('trash')}</button></div>`).join(''):'<p class="helper">No saved projects here. Create a new session, or clear the search.</p>';
  $('assetLibrary').innerHTML=assets.length?assets.map(a=>`<div class="asset-entry"><button class="asset-tile" data-asset="${a.id}"><img src="${a.url}" loading="lazy" alt="${esc(a.title||a.source)}"><span>${esc(a.title||a.source)}</span></button><button class="icon-button danger-text asset-delete" data-delete-asset="${a.id}" aria-label="Delete image ${esc(a.title||a.source)}">${icon('trash')}</button></div>`).join(''):'<p class="helper">No matching images yet.</p>';
  $('jobList').innerHTML=state.jobs.filter(j=>matches(j.prompt||j.model)).map(j=>`<div class="job-row"><div><strong>${esc((j.prompt||j.model+' · input-based run').slice(0,110))}</strong><p>${esc(j.provider+' / '+j.model)}</p><span class="micro">${esc(niceStatus(j.status))} · ${esc(new Date(j.createdAt).toLocaleString('en-US'))}</span>${j.error?`<div class="error-message">${esc(j.error)}</div>`:''}</div><div class="job-buttons">${j.providerUrl?`<a href="${esc(j.providerUrl)}" target="_blank" rel="noopener noreferrer" class="text-button">Provider ↗</a>`:''}${j.provider==='replicate'&&j.providerId&&j.status==='download_failed'?`<button class="button compact" data-retry="${j.id}">Retry download</button>`:''}<button class="text-button danger-text" data-delete-job="${j.id}" ${activeStatus(j.status)?'disabled':''}>Delete history</button></div></div>`).join('')||'<p class="helper">No generation jobs.</p>';
  $('projectList').querySelectorAll('[data-rename-project]').forEach(b=>b.onclick=()=>renameSavedProject(b.dataset.renameProject).catch(e=>toast(e.message,true)));
  $('assetLibrary').querySelectorAll('[data-asset]').forEach(b=>b.onclick=async()=>{try{if(!state.activeSessionId)await newSession();setMode('generate');await selectAsset(state.assets.find(a=>a.id===b.dataset.asset));}catch(e){toast(e.message,true);}});
  $('projectList').querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>openSession(b.dataset.project).catch(e=>toast(e.message,true)));
  $('jobList').querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{try{await api('/api/jobs/'+b.dataset.retry+'/download',{method:'POST',body:{}});await refreshJobs();await showLibrary();}catch(e){toast(e.message,true);}});
  for(const [attribute,kind,message] of [['project','projects','Delete this saved project and its saved research? Files referenced elsewhere remain; unreferenced project files are removed.'],['asset','assets','Permanently delete this private image? This does not change provider-side files.'],['job','jobs','Delete this generation history? Saved images remain.']]){
    $('libraryPage').querySelectorAll('[data-delete-'+attribute+']').forEach(b=>b.onclick=async()=>{
      const id=b.dataset['delete'+attribute[0].toUpperCase()+attribute.slice(1)];
      if(kind==='assets'&&openDocs().some(d=>d.assetId===id||JSON.stringify(d.generation?.input||{}).includes('/assets/'+id)))return toast('This image is used by an open project. Remove it there or close that project first.',true);
      if(!await askSession({title:'Delete '+(attribute==='project'?'saved project':attribute)+'?',text:message,confirm:'Delete',discard:false}))return;
      b.disabled=true;try{const out=await api('/api/'+kind+'/'+id+'/delete',{method:'POST',body:{}});if(kind==='projects'){const d=readDoc(id);if(d){d.saved=false;d.dirty=true;writeDoc(d);updateSessionLabel();}}await showLibrary();renderHistory();toast(out.message);}catch(e){toast(e.message,true);}finally{b.disabled=false;}
    });
  }
}

on('libraryButton','click',showLibrary);on('allHistory','click',showLibrary);
on('helpButton','click',()=>$('helpDialog').showModal());

function providerState(p,key){const test=state.config.keyTests?.[p];return !state.config.keys[key]?{kind:'warning',icon:'warning',text:'Key missing'}:test?.status==='verified'?{kind:'verified',icon:'check',text:'Authentication verified'}:test?.status==='rejected'?{kind:'rejected',icon:'warning',text:'Key rejected'}:test?.status==='unavailable'?{kind:'warning',icon:'warning',text:'Test unavailable'}:{kind:'saved',icon:'check',text:'Key saved'};}
function providerMark(p){return state.config.brand?.providers?.[p]?`<span class="provider-logo" style="--provider-logo:url('/brand-assets/${p}.svg')" aria-hidden="true"></span>`:`<span class="provider-initial" aria-hidden="true">${p==='replicate'?'R':p==='openai'?'O':'G'}</span>`;}
function statusMarkup(p,key){const v=providerState(p,key);return `<span class="status-chip ${v.kind}">${icon(v.icon)}${esc(v.text)}</span>`;}
function refreshConnectionStatuses(){for(const [p,k] of Object.entries({replicate:'REPLICATE_API_TOKEN',openai:'OPENAI_API_KEY',xai:'XAI_API_KEY'})){const el=document.querySelector(`[data-key-status="${p}"]`);if(el)el.innerHTML=statusMarkup(p,k);}if(state.page==='settings')renderWorkspaceSettings();}
function showSettings(){
  const cards=[['REPLICATE_API_TOKEN','Replicate','replicate','https://replicate.com/account/api-tokens','Your model playground.'],['OPENAI_API_KEY','OpenAI / GPT','openai','https://platform.openai.com/api-keys','Create. Reason. Research.'],['XAI_API_KEY','Grok / SpaceXAI','xai','https://console.x.ai/','Explore a different perspective.']];
  $('keyFields').innerHTML=cards.map(([key,name,p,url,line],i)=>`<section class="key-card provider-card"><div class="key-card-head"><div class="provider-identity">${providerMark(p)}<span><strong>${name}</strong><small>${line}</small></span></div><span data-key-status="${p}">${statusMarkup(p,key)}</span></div><div class="key-source"><span class="key-source-number">0${i+1}</span><span>ENCRYPTED RUNTIME SECRET</span><code>${key}</code></div><div class="key-row"><input type="password" disabled id="key_${key}" autocomplete="new-password" spellcheck="false" placeholder="${state.config.keys[key]?'Saved — leave blank to keep':'Paste your provider API key'}" aria-label="${name} API key"><button type="button" class="button compact" data-test-provider="${p}" ${state.config.canManageProviders?'':'disabled'}>${icon('check')}Test</button></div><p><a href="${url}" target="_blank" rel="noopener noreferrer">Open provider key console ${icon('external')}</a><span>Key values never return to the browser.</span></p><details class="key-profile-scaffold"><summary>${icon('layers')}Saved key profiles<span class="planned-chip">COMING NEXT</span></summary><div class="key-profile-body"><div><strong>Runtime secret</strong><span class="status-chip saved">${icon('check')}Active source</span></div><p>Future Admin-managed profiles will let you save, label, select, and assign different keys per model. The configured runtime secret remains in use.</p><button class="button compact" disabled>Add key profile · planned</button><button class="button compact" disabled>Assign model · planned</button></div></details></section>`).join('');
  const names=[['OPENAI_IMAGE_MODEL','OpenAI image model',state.config.models.openaiImage],['OPENAI_CHAT_MODEL','OpenAI chat model',state.config.models.openaiChat],['XAI_IMAGE_MODEL','Grok image model',state.config.models.xaiImage],['XAI_CHAT_MODEL','Grok chat model',state.config.models.xaiChat]];
  $('modelSettings').innerHTML=names.map(([k,label,v])=>`<label class="field">${label}<select id="cfg_${k}"><option value="${esc(v)}">${esc(v||'Load provider models')}</option></select></label>`).join('');
  $('keyFields').querySelectorAll('input').forEach(input=>{input.disabled=true;input.placeholder='Managed securely in Pages';});
  $('keyFields').querySelectorAll('[data-test-provider]').forEach(button=>button.disabled=!state.config.canManageProviders);
  $('keyFields').querySelectorAll('[data-test-provider]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const result=await api('/api/settings/test',{method:'POST',body:{provider:b.dataset.testProvider}});state.config=result.config;refreshConnectionStatuses();settingsNote(result.message);}catch(e){try{const data=await api('/api/state');state.config=data.config;refreshConnectionStatuses();}catch{}settingsNote(e.message,true);}finally{b.disabled=false;}});
  $('settingsMessage').hidden=true;$('settingsDialog').showModal();refreshSettingsModels().catch(e=>settingsNote(e.message,true));showBrandStatus();
}
function settingsNote(message,bad=false){$('settingsMessage').textContent=message;$('settingsMessage').classList.toggle('error-message',bad);$('settingsMessage').hidden=false;}
async function saveConnections(announce=true){
  const vals={};for(const k of ['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY']){if($('key_'+k)?.value)vals[k]=$('key_'+k).value;}
  for(const k of ['OPENAI_IMAGE_MODEL','OPENAI_CHAT_MODEL','XAI_IMAGE_MODEL','XAI_CHAT_MODEL'])if($('cfg_'+k)?.value)vals[k]=$('cfg_'+k).value;
  const r=await api('/api/settings',{method:'POST',body:vals});state.config=r.config;
  for(const k of ['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY']){$('key_'+k).value='';$('key_'+k).placeholder=state.config.keys[k]?'Saved — leave blank to keep':'Paste your API key';}
  refreshConnectionStatuses();state.modelChoices={};updateKeyStatus();loadChatModels().catch(()=>{});refreshChatCaption();if(announce)settingsNote('Model preferences saved. Use Test to verify provider authentication.');
}
on('connections','click',showSettings);on('saveSettings','click',async()=>{try{await saveConnections();}catch(e){settingsNote(e.message,true);}});
on('fetchWebhookKey','click',async()=>{try{await saveConnections(false);const r=await api('/api/settings/webhook-key',{method:'POST',body:{}});state.config=r.config;settingsNote(r.message);}catch(e){settingsNote(e.message,true);}});

function toggleResearch(){if(state.researchOnly)return;const closed=$('appShell').classList.toggle('research-closed');$('toggleResearch').setAttribute('aria-expanded',String(!closed));setResearchWidth(storageGet('tr-lab-sidebar',330),false);}
on('toggleResearch','click',()=>setLayoutMenu($('layoutMenu').hidden));on('collapseResearch','click',toggleResearch);
let resizing=false;
$('resizeHandle').addEventListener('pointerdown',e=>{resizing=true;$('resizeHandle').setPointerCapture(e.pointerId);document.body.classList.add('is-resizing');});
$('resizeHandle').addEventListener('pointermove',e=>{if(resizing)setResearchWidth(innerWidth-e.clientX,false);});
function endResize(){if(!resizing)return;resizing=false;document.body.classList.remove('is-resizing');storageSet('tr-lab-sidebar',parseInt(getComputedStyle(document.documentElement).getPropertyValue('--research')));}
$('resizeHandle').addEventListener('pointerup',endResize);$('resizeHandle').addEventListener('pointercancel',endResize);$('resizeHandle').addEventListener('lostpointercapture',endResize);
on('resizeHandle','dblclick',()=>setResearchWidth(330));
on('resizeHandle','keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const old=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--research'));setResearchWidth(e.key==='Home'?280:e.key==='End'?researchMax():old+(e.key==='ArrowLeft'?1:-1)*(e.shiftKey?80:20));});
function researchTab(tab){state.researchTab=tab;$('chatPanel').hidden=tab!=='chat';$('imagesPanel').hidden=tab!=='images';$('chatTab').classList.toggle('active',tab==='chat');$('imagesTab').classList.toggle('active',tab==='images');$('chatTab').setAttribute('aria-selected',String(tab==='chat'));$('imagesTab').setAttribute('aria-selected',String(tab==='images'));}
on('chatTab','click',()=>researchTab('chat'));on('imagesTab','click',()=>researchTab('images'));
on('googleSearch','click',()=>{const q=$('googleQuery').value.trim();if(!q)throw new Error('Enter an image search first.');window.open('https://www.google.com/search?tbm=isch&q='+encodeURIComponent(q),'_blank','noopener,noreferrer');});
on('googleQuery','keydown',e=>{if(e.key==='Enter')$('googleSearch').click();});
const welcomeMarkup=$('chatMessages').innerHTML;
const chats={openai:[],xai:[]};
function chatProvider(){return $('chatProvider').value;}
function chatKey(p,sid=state.activeSessionId){return 'tr-lab-v3-chat:'+sid+':'+p;}
function draftKey(p,sid=state.activeSessionId){return 'tr-lab-v3-chat-draft:'+sid+':'+p;}
function refreshChatCaption(){if(!state.config)return;const model=$('chatModelSelect').value||'Select a model',p=effectiveResearchProfile();$('chatModelCaption').textContent=[p.webSearch?'Web search available':'Web search off',p.analysis?'Analysis available':null,'Images + files'].filter(Boolean).join(' · ');$('chatModelSummary').textContent=model;}
function addMessage(role,text,provider=chatProvider()){
  const node=document.createElement('div');node.className='chat-message '+role;const head=document.createElement('div');head.className='message-head';head.textContent=role==='user'?'YOU':provider==='openai'?'GPT / OPENAI':'GROK';const body=document.createElement('div');body.className='message-text';body.innerHTML=role==='assistant'?renderMarkdown(text):esc(text).replaceAll('\n','<br>');node.append(head,body);$('chatMessages').append(node);return node;
}
function attachActions(node,text,sid=state.activeSessionId){const div=document.createElement('div');div.className='message-actions';const copy=document.createElement('button');copy.className='text-button';copy.textContent='Copy';copy.onclick=()=>navigator.clipboard.writeText(text).then(()=>toast('Copied.'));const use=document.createElement('button');use.className='text-button';use.textContent='Use as prompt';use.onclick=()=>useResearchPrompt(text,sid);div.append(copy,use);node.append(div);}
function bindSuggestions(){document.querySelectorAll('[data-chat-prompt]').forEach(b=>b.onclick=()=>{$('chatInput').value=b.dataset.chatPrompt;storageSet(draftKey(chatProvider()),$('chatInput').value);markResearchDirty();$('chatInput').focus();});}
function refreshChat(){
  refreshChatCaption();renderChatAttachmentTray();const sid=state.activeSessionId;
  $('chatInput').disabled=!sid;$('chatProvider').disabled=!sid;$('sendChat').disabled=!sid;
  const history=sid?storageGet(chatKey(chatProvider()),[]):[];chats[chatProvider()]=history;
  $('chatMessages').innerHTML=sid?(history.length?'':welcomeMarkup):'<div class="chat-welcome"><h3>No open project.</h3><p>Open a project from Library to continue its research.</p></div>';
  for(const m of history){const node=addMessage(m.role,m.content);decorateMessage(node,m);if(m.role==='assistant')attachActions(node,m.content,sid);}bindSuggestions();
  const busy=chatRun&&chatRun.sid===sid&&chatRun.provider===chatProvider();if(busy&&chatRun.full){const node=addMessage('assistant',chatRun.full);node.id='activeChatResponse';}
  $('sendChat').innerHTML=icon(busy?'close':'send');$('sendChat').setAttribute('aria-label',busy?'Stop chat response':'Send chat message');$('chatStatus').textContent=busy?'RESPONSE IN PROGRESS':'PROJECT CONVERSATION';
}
on('chatProvider','change',()=>{state.remoteChatBusy=false;saveResearchPrefs();$('chatInput').value=storageGet(draftKey(chatProvider()),'');refreshChat();loadChatModels().catch(()=>{});});
on('newChat','click',()=>{if(!state.activeSessionId)return;if(chatBusyForSession())throw new Error('Stop or finish the current response first.');archiveChat();storageSet(chatKey(chatProvider()),[]);storageSet(draftKey(chatProvider()),'');storageSet(attachmentDraftKey(),[]);$('chatInput').value='';markResearchDirty();refreshChat();toast('Previous conversation archived within this project.');});
on('deleteChat','click',async()=>{if(!state.activeSessionId)return;if(chatBusyForSession())throw new Error('Stop or finish the current response first.');if(!await askSession({title:'Delete this conversation?',text:'Remove the current conversation from this project. Saved copies remain until you save the project again; provider-side records are unchanged.',confirm:'Delete conversation',discard:false}))return;storageSet(chatKey(chatProvider()),[]);storageSet(draftKey(chatProvider()),'');storageSet(attachmentDraftKey(),[]);$('chatInput').value='';markResearchDirty();refreshChat();});
let chatRun=null;
async function recoverResearch(sid){
  const pending=['openai','xai'].map(p=>[p,storageGet('lab-pending-research:'+sid+':'+p,null)]).filter(([,id])=>id);
  if(!pending.length)return;
  const data=await api('/api/research/runs?projectId='+encodeURIComponent(sid));
  for(const [provider,id]of pending){const run=data.runs.find(r=>r.id===id);if(!run||run.status==='streaming')continue;const history=storageGet(chatKey(provider,sid),[]);if(run.text&&!history.some(m=>m.runId===id)){history.push({role:'assistant',content:run.text,model:run.model,runId:id,...JSON.parse(run.metadata),warning:run.status==='completed'?'Recovered saved response.':'Recovered partial response: '+run.status});storageSet(chatKey(provider,sid),history);markResearchDirty(sid);}localStorage.removeItem('lab-pending-research:'+sid+':'+provider);}
  if(state.activeSessionId===sid)refreshChat();
}
function chatBusyForSession(){return Boolean(chatRun?.sid===state.activeSessionId||state.remoteChatBusy);}
async function sendChatRequest(){
  const sid=state.activeSessionId,p=chatProvider(),model=$('chatModelSelect').value,text=$('chatInput').value.trim(),attachments=storageGet(attachmentDraftKey(p,sid),[]);
  if(!sid||(!text&&!attachments.length))return;
  if(chatRun){if(chatRun.sid===sid&&chatRun.provider===p){chatRun.controller.abort();return;}throw new Error('A response is running in another project. Wait for it to finish.');}
  if(!model)throw new Error('Choose a chat model first.');if(!state.config.keys[p==='openai'?'OPENAI_API_KEY':'XAI_API_KEY'])return showSettings();
  if(state.chatUploading)throw new Error('Wait for attachments to finish saving.');
  const history=storageGet(chatKey(p,sid),[]);if(history.length>=118)throw new Error('Start a new conversation to stay within the local message limit.');
  history.push({role:'user',content:text,attachments});storageSet(chatKey(p,sid),history);storageSet(draftKey(p,sid),'');storageSet(attachmentDraftKey(p,sid),[]);$('chatInput').value='';
  const run={sid,provider:p,full:'',meta:{},controller:new AbortController()};chatRun=run;state.chatBusy=true;markResearchDirty(sid);refreshChat();publishDesk({type:'chat-busy',sid,provider:p,busy:true});
  let waiting=null;if(sid===state.activeSessionId){waiting=document.createElement('div');waiting.className='thinking-indicator';waiting.innerHTML='<i></i><i></i><i></i><span>Preparing response…</span>';$('chatMessages').append(waiting);}
  try{
    await ensureRemoteProject(sid);
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-CSRF':state.csrf,'X-Lab-Account':labSession.account.id},body:JSON.stringify({projectId:sid,provider:p,model,messages:history.map(m=>({role:m.role,content:m.content,attachments:m.attachments||[]}))}),signal:run.controller.signal});
    if(!response.ok){const d=await response.json();throw new Error(d.error||'Chat failed.');}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
      while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const type=block.match(/^event: (.*)$/m)?.[1],raw=block.match(/^data: (.*)$/m)?.[1];if(!raw)continue;const d=JSON.parse(raw);
        if(type==='status'){if(d.runId){run.id=d.runId;storageSet('lab-pending-research:'+sid+':'+p,d.runId);}if(waiting?.isConnected)waiting.querySelector('span').textContent=d.message;if(sid===state.activeSessionId)$('chatStatus').textContent=d.message;}
        if(type==='delta'){waiting?.remove();run.full+=d.text;publishDesk({type:'chat-preview',sid,provider:p,text:run.full});if(sid===state.activeSessionId&&p===chatProvider()){let node=$('activeChatResponse');if(!node){node=addMessage('assistant','',p);node.id='activeChatResponse';}node.querySelector('.message-text').innerHTML=renderMarkdown(run.full);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}}
        if(type==='done'){run.meta=d;if(d.artifacts?.length)state.attachments.push(...d.artifacts);if(d.warning||d.cleanup)toast(d.warning||d.cleanup,true);}
        if(type==='error')throw new Error(d.message);
      }
    }
  }catch(e){run.meta.warning=e.name==='AbortError'?'Response stopped. Partial text retained.':e.message;toast(run.meta.warning,true);}
  finally{
    if(run.full&&readDoc(sid)){history.push({role:'assistant',content:run.full,...run.meta,model,runId:run.id});storageSet(chatKey(p,sid),history);markResearchDirty(sid);}
    if(run.full)localStorage.removeItem('lab-pending-research:'+sid+':'+p);waiting?.remove();chatRun=null;state.chatBusy=false;publishDesk({type:'chat-busy',sid,provider:p,busy:false});if(sid===state.activeSessionId)refreshChat();renderTabs();
  }
}
on('sendChat','click',async()=>{if(chatRun?.sid===state.activeSessionId&&chatRun.provider===chatProvider()){chatRun.controller.abort();return;}if(state.remoteChatBusy)throw new Error('A response is running in the other research window.');if(navigator.locks)await navigator.locks.request('tr-lab-chat:'+state.activeSessionId+':'+chatProvider(),{ifAvailable:true},async lock=>{if(!lock)throw new Error('This project conversation is in use in another window.');await sendChatRequest();});else await sendChatRequest();});
on('chatInput','input',()=>{storageSet(draftKey(chatProvider()),$('chatInput').value);markResearchDirty();});
on('chatInput','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('sendChat').click();}});

// Modal-native focus and Escape handling; click on the backdrop closes only dialogs.
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
// POC 0.2: model catalogs, session lifecycle, layout and shared research views.
function cfgModel(provider,kind){return state.config?.models[provider==='openai'?(kind==='image'?'openaiImage':'openaiChat'):(kind==='image'?'xaiImage':'xaiChat')]||'';}
function modelKey(provider,kind){return provider+':'+kind;}
const modelLoads=new Map();
async function fetchModelChoices(provider,kind,refresh=false){
  const key=modelKey(provider,kind);
  if(!refresh&&state.modelChoices[key])return state.modelChoices[key];
  if(modelLoads.has(key))return modelLoads.get(key);
  const task=api('/api/provider-models?provider='+provider+'&kind='+kind+(refresh?'&refresh=1':'')).then(data=>{state.modelChoices[key]=data;return data;});
  modelLoads.set(key,task);try{return await task;}finally{modelLoads.delete(key);}
}
function populateModels(select,provider,kind,data,preferred,remember=true){
  const key=modelKey(provider,kind),ids=data.items.map(m=>m.id);
  const wanted=preferred||state.chosen[key]||cfgModel(provider,kind),chosen=ids.includes(wanted)?wanted:ids[0]||'';
  select.innerHTML=ids.length?data.items.map(m=>`<option value="${esc(m.id)}">${esc(m.label||m.id)}</option>`).join(''):'<option value="">No compatible models returned</option>';
  select.value=chosen;if(remember){state.chosen[key]=chosen;storageSet('tr-lab-model-choices',state.chosen);}
}
async function loadModelPicker(selectId,noteId,provider,kind,refresh=false){
  const sid=state.activeSessionId;const select=$(selectId),note=$(noteId),ticket=crypto.randomUUID();select.dataset.ticket=ticket;
  select.disabled=true;select.innerHTML='<option value="">Loading models…</option>';note.textContent='Loading models from '+(provider==='openai'?'OpenAI':'Grok')+'…';
  if(!state.config.keys[provider==='openai'?'OPENAI_API_KEY':'XAI_API_KEY']){select.innerHTML='<option value="">Connect provider first</option>';note.textContent='Ask a provider administrator to configure this connection.';return;}
  try{const data=await fetchModelChoices(provider,kind,refresh);if(select.dataset.ticket!==ticket||sid!==state.activeSessionId)return;populateModels(select,provider,kind,data);select.disabled=!data.items.length;note.textContent=`${data.items.length} ${kind} models · ${data.source==='live'?'Listed by provider':data.source==='stale'?'Cached · refresh failed':'Cached provider list'}`+(data.warning?' · '+data.warning:'');}
  catch(e){if(select.dataset.ticket!==ticket||sid!==state.activeSessionId)return;const configured=state.chosen[modelKey(provider,kind)]||cfgModel(provider,kind);select.innerHTML=configured?`<option value="${esc(configured)}">${esc(configured)} · saved setting</option>`:'<option value="">Model list unavailable</option>';select.disabled=!configured;note.textContent=e.message+(configured?' Showing saved setting, not a verified catalog choice.':'');}
  finally{if(kind==='chat'&&sid===state.activeSessionId){const r=storageGet('tr-lab-v3-research:'+sid,{});r.models={...r.models,[provider]:select.value};storageSet('tr-lab-v3-research:'+sid,r);refreshChatCaption();}}
}
function loadImageModels(refresh=false){return loadModelPicker('imageModelSelect','imageModelsNote',state.provider,'image',refresh);}
function loadChatModels(refresh=false){return loadModelPicker('chatModelSelect','chatModelsNote',chatProvider(),'chat',refresh);}
on('refreshImageModels','click',()=>loadImageModels(true));on('refreshChatModels','click',()=>loadChatModels(true));
on('imageModelSelect','change',()=>{state.chosen[modelKey(state.provider,'image')]=$('imageModelSelect').value;storageSet('tr-lab-model-choices',state.chosen);});
on('chatModelSelect','change',()=>{state.chosen[modelKey(chatProvider(),'chat')]=$('chatModelSelect').value;storageSet('tr-lab-model-choices',state.chosen);refreshChatCaption();});
async function refreshSettingsModels(refresh=false){
  const specs=[['openai','image','OPENAI_IMAGE_MODEL'],['openai','chat','OPENAI_CHAT_MODEL'],['xai','image','XAI_IMAGE_MODEL'],['xai','chat','XAI_CHAT_MODEL']];
  await Promise.all(specs.map(async([provider,kind,name])=>{const el=$('cfg_'+name);if(!el)return;if(!state.config.keys[provider==='openai'?'OPENAI_API_KEY':'XAI_API_KEY'])return;try{const data=await fetchModelChoices(provider,kind,refresh);populateModels(el,provider,kind,data,cfgModel(provider,kind),false);}catch(e){el.title=e.message;}}));
}
on('refreshAllModels','click',()=>refreshSettingsModels(true));

const initialThumb=thumbSettings();

function setupBrand(){
  $('brandMark').classList.toggle('has-motif',Boolean(state.config.brand?.logo));
  if(state.config.brand?.logo){$('brandMark').innerHTML='<img src="/brand-assets/labs0.svg" alt="">';const favicon=document.querySelector('link[rel="icon"]');if(favicon)favicon.href='/favicon.ico';}
  else $('brandMark').title='Logo asset not found: assets/logos/labs0.svg. Check Connections → Packaged brand assets.';
  if(state.config.fonts.includes('display'))document.documentElement.classList.add('brand-font-ready');
}
function showBrandStatus(){
  let node=$('brandStatus');if(!node){node=document.createElement('div');node.id='brandStatus';node.className='brand-status soft-note';$('settingsDialog').querySelector('.dialog-actions').before(node);}
  node.innerHTML='<strong>Packaged brand assets</strong><p>'+esc(state.config.brand?.logoSource?'Motif: '+state.config.brand.logoSource:'labs0.svg not found — add it to the Lab assets/logos folder and restart.')+'</p><p>'+esc(state.config.brand?.fonts?.display?'Title font: '+state.config.brand.fonts.display:'American Captain.ttf/.otf not found — the fallback is currently in use.')+'</p><small>Approved fonts and logos are packaged with this Workshop release.</small>';
}
function closeAccount(){$('accountMenu').hidden=true;$('accountTrigger').setAttribute('aria-expanded','false');}
on('accountTrigger','click',()=>{const open=$('accountMenu').hidden;$('accountMenu').hidden=!open;$('accountTrigger').setAttribute('aria-expanded',String(open));});
on('accountConnections','click',()=>{closeAccount();showSettings();});on('accountLibrary','click',()=>{closeAccount();showLibrary();});on('accountLogout','click',async()=>{const button=$('accountLogout');button.disabled=true;button.querySelector('span').textContent='Logging out?';try{await signOut();}finally{button.disabled=false;button.querySelector('span').textContent='Sign out';}});
document.addEventListener('pointerdown',e=>{if(!$('accountWidget').contains(e.target))closeAccount();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('accountMenu').hidden){closeAccount();$('accountTrigger').focus();}});
on('accountMenu','keydown',e=>{const items=[...$('accountMenu').querySelectorAll('[role="menuitem"]')];const at=items.indexOf(document.activeElement);let index;if(e.key==='ArrowDown')index=(at+1)%items.length;if(e.key==='ArrowUp')index=(at-1+items.length)%items.length;if(e.key==='Home')index=0;if(e.key==='End')index=items.length-1;if(index!==undefined){e.preventDefault();items[index].focus();}});
on('accountTrigger','keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();$('accountMenu').hidden=false;$('accountTrigger').setAttribute('aria-expanded','true');const items=$('accountMenu').querySelectorAll('[role="menuitem"]');items[e.key==='ArrowDown'?0:items.length-1].focus();}});

function researchMax(){return innerWidth>1000?Math.max(280,innerWidth-parseFloat(getComputedStyle($('appShell')).getPropertyValue('--tools'))-($('appShell').classList.contains('left-collapsed')?0:leftWidth())-340-10):Math.max(280,innerWidth-56);}
function setResearchWidth(value,persist=true){const max=researchMax(),width=Math.max(280,Math.min(max,Number(value)||330));document.documentElement.style.setProperty('--research',width+'px');$('resizeHandle').setAttribute('aria-valuenow',String(width));$('resizeHandle').setAttribute('aria-valuemax',String(max));if(persist)storageSet('tr-lab-sidebar',width);}
function setupLayout(){
  $('appShell').classList.toggle('left-collapsed',storageGet('tr-lab-left-collapsed',false));updateLeftButton();setLeftWidth(storageGet('tr-lab-left-width',285),false);setRailMode(storageGet('tr-lab-rail-mode','pinned'),false);
  $('chatModelPanel').open=!storageGet('tr-lab-chat-model-collapsed',false);
  if(state.researchOnly){document.body.classList.add('research-only');$('collapseResearch').hidden=true;$('popoutResearch').hidden=true;$('researchTabLink').hidden=true;$('dockResearch').hidden=false;$('toggleResearch').hidden=true;document.title='Research Desk | Third Railify Lab';researchTab(new URL(location.href).searchParams.get('tab')==='images'?'images':'chat');}
  else if(innerWidth<=1000){$('appShell').classList.add('research-closed');}
}
function updateLeftButton(){const collapsed=$('appShell').classList.contains('left-collapsed');$('collapseLeft').setAttribute('aria-expanded',String(!collapsed));$('collapseLeft').setAttribute('aria-label',collapsed?'Expand left sidebar':'Collapse left sidebar to icons');$('collapseLeft').title=collapsed?'Expand controls':'Collapse controls to icon rail';}
on('collapseLeft','click',()=>{const collapsed=$('appShell').classList.toggle('left-collapsed');storageSet('tr-lab-left-collapsed',collapsed);updateLeftButton();resizePanels();});
window.addEventListener('resize',()=>resizePanels());



// Project documents: recovery copies stay in this browser; explicit Save writes the
// complete Studio + Research document to the private account project repository.
const WORKSPACE_KEY='tr-lab-v3-workspace',DOC_PREFIX='tr-lab-v3-doc:';
const presetDefaults={original:'',cinematic:'Cinematic lighting, deliberate composition, premium editorial finish.',thumbnail:'Editorial thumbnail composition, strong contrast, clean focal point, room for a headline. No text.',railify:'Dark near-black background, restrained metallic gold and warm ivory accents, elegant electric atmosphere. No text.'};
function presets(){return {...presetDefaults,...state.preferences?.presets};}
function workspaceIndex(){return storageGet(WORKSPACE_KEY,{ids:[],activeId:null});}
function readDoc(id){return id?storageGet(DOC_PREFIX+id,null):null;}
function writeDoc(doc){storageSet(DOC_PREFIX+doc.id,doc);}
function openDocs(){return workspaceIndex().ids.map(readDoc).filter(Boolean);}
function docResearch(id){return {provider:storageGet('tr-lab-v3-research:'+id,{provider:'openai'}).provider||'openai',models:storageGet('tr-lab-v3-research:'+id,{}).models||{},drafts:{openai:storageGet(draftKey('openai',id),''),xai:storageGet(draftKey('xai',id),'')},chats:{openai:storageGet(chatKey('openai',id),[]),xai:storageGet(chatKey('xai',id),[])},history:storageGet('tr-lab-v3-history:'+id,[]),attachmentDrafts:{openai:storageGet(attachmentDraftKey('openai',id),[]),xai:storageGet(attachmentDraftKey('xai',id),[])}};}
function restoreResearch(id,r={}){storageSet('tr-lab-v3-research:'+id,{provider:r.provider||'openai',models:r.models||{}});for(const p of ['openai','xai']){storageSet(chatKey(p,id),r.chats?.[p]||[]);storageSet(draftKey(p,id),r.drafts?.[p]||'');storageSet(attachmentDraftKey(p,id),r.attachmentDrafts?.[p]||[]);}storageSet('tr-lab-v3-history:'+id,r.history||[]);}
function markResearchDirty(id=state.activeSessionId){const d=readDoc(id);if(!d)return;d.dirty=true;d.updatedAt=new Date().toISOString();writeDoc(d);renderTabs();}
function saveResearchPrefs(){if(!state.activeSessionId)return;const r=storageGet('tr-lab-v3-research:'+state.activeSessionId,{});r.provider=chatProvider();r.models={...r.models,[chatProvider()]:$('chatModelSelect').value};storageSet('tr-lab-v3-research:'+state.activeSessionId,r);markResearchDirty();}
function defaultDoc(){return {id:crypto.randomUUID(),name:'Untitled project',saved:false,dirty:false,serverRevision:0,version:3,mode:'generate',assetId:null,settings:{...initialThumb},generation:{provider:'replicate',modelId:'black-forest-labs/flux-schnell',prompt:'',style:'',presetId:'original',input:{},paramValues:{},fileInputs:{},advanced:'',options:{}},currentJob:null};}
function captureSession(dirty=true){
  if(state.restoring||state.researchOnly||!state.activeSessionId)return;
  const old=readDoc(state.activeSessionId);if(!old)return;
  rememberInputs();let input={};try{input=state.provider==='replicate'&&state.model?collectInputs():{};}catch{input=old.generation?.input||{};}
  const model=state.model?Object.fromEntries(Object.entries(state.model).filter(([k])=>k!=='rawSchema')):null;
  const next={...old,version:3,mode:state.mode,assetId:state.selected?.id||null,settings:thumbSettings(),currentJob:state.currentJob,dirty:old.dirty||dirty,generation:{provider:state.provider,modelId:state.modelId,model,selectedModel:$('imageModelSelect').value,prompt:$('prompt').value,style:state.style,presetId:state.presetId||'original',input,paramValues:{...state.paramValues},fileInputs:{...state.fileInputs},advanced:$('advancedJson').value,options:{references:state.directReferences||[],size:$('directSize')?.value,quality:$('directQuality')?.value,aspect_ratio:$('directRatio')?.value}}};
  if(next.name==='Untitled project'&&next.generation.prompt.trim())next.name=next.generation.prompt.trim().split('\n')[0].slice(0,55);
  writeDoc(next);updateSessionLabel();
}
function updateSessionLabel(){const d=readDoc(state.activeSessionId);$('sessionName').textContent=d?.name||'Workspace library';$('sessionState').textContent=d?.dirty?'UNSAVED CHANGES':d?.saved?'SAVED PROJECT':'NEW PROJECT';renderTabs();}
function renderTabs(){
  const all=openDocs(),docs=state.researchOnly?all.filter(d=>d.id===state.activeSessionId):all;
  $('documentTabs').innerHTML=docs.length?docs.map(d=>`<div class="document-tab ${d.id===state.activeSessionId?'active':''}" data-doc="${d.id}"><button role="tab" class="tab-select" aria-selected="${d.id===state.activeSessionId}" tabindex="${d.id===state.activeSessionId?'0':'-1'}" data-open-doc="${d.id}" title="${esc(d.name)} · double-click to rename">${icon(d.mode==='thumbnail'?'layers':'document')}<span class="tab-title">${esc(d.name)}</span><span class="tab-dirty" aria-label="${d.dirty?'Unsaved changes':''}">${d.dirty?'•':''}</span></button><button class="tab-close" data-close-doc="${d.id}" title="Close ${esc(d.name)}" aria-label="Close ${esc(d.name)}">${icon('close')}</button></div>`).join(''):'<span class="tabs-empty">NO OPEN PROJECTS</span>';
  $('documentTabs').querySelectorAll('[data-open-doc]').forEach(b=>{b.onclick=()=>switchSession(b.dataset.openDoc).catch(e=>toast(e.message,true));b.ondblclick=()=>renameSession(b.dataset.openDoc);b.onkeydown=e=>{const ids=docs.map(d=>d.id),i=ids.indexOf(b.dataset.openDoc);let n;if(e.key==='ArrowRight')n=(i+1)%ids.length;if(e.key==='ArrowLeft')n=(i+ids.length-1)%ids.length;if(e.key==='Home')n=0;if(e.key==='End')n=ids.length-1;if(n!==undefined){e.preventDefault();switchSession(ids[n]).then(()=>$('documentTabs').querySelector(`[data-open-doc="${ids[n]}"]`)?.focus());}};});
  $('documentTabs').querySelectorAll('[data-close-doc]').forEach(b=>b.onclick=()=>closeSession(b.dataset.closeDoc).catch(e=>toast(e.message,true)));
  for(const id of ['saveSession','saveProject','chatHistory','deleteChat','newChat'])$(id).disabled=!state.activeSessionId;
  document.querySelectorAll('.rail-button[data-mode]').forEach(b=>b.disabled=!state.activeSessionId);
}
async function initWorkspace(){
  let index=storageGet(WORKSPACE_KEY,null);
  if(!index){const doc=defaultDoc();const oldPrompt=storageGet('tr-lab-prompt','');doc.generation.prompt=oldPrompt;if(oldPrompt)doc.name=oldPrompt.split('\n')[0].slice(0,55);doc.dirty=Boolean(oldPrompt);
    const legacyChat={openai:storageGet('tr-lab-chat-openai',[]),xai:storageGet('tr-lab-chat-xai',[])};restoreResearch(doc.id,{chats:legacyChat,drafts:{openai:storageGet('tr-lab-chat-draft-openai',''),xai:storageGet('tr-lab-chat-draft-xai','')},provider:storageGet('tr-lab-chat-provider','openai')});
    if(!storageGet('tr-lab-work-reset',false)&&state.assets[0])doc.assetId=state.assets[0].id;writeDoc(doc);index={ids:[doc.id],activeId:doc.id};storageSet(WORKSPACE_KEY,index);
  }
  if(state.researchOnly){const wanted=new URL(location.href).searchParams.get('session')||index.activeId;if(readDoc(wanted))await switchSession(wanted,false);else{state.activeSessionId=null;refreshChat();renderTabs();toast('This project is no longer open. Return to the main Library to reopen saved work.');}return;}
  if(index.ids.length){const id=index.ids.includes(index.activeId)?index.activeId:index.ids[0];await switchSession(id,false);}else{state.activeSessionId=null;await showLibrary();renderTabs();refreshChat();}
}
async function newSession(){captureSession(false);const doc=defaultDoc();writeDoc(doc);restoreResearch(doc.id);const idx=workspaceIndex();idx.ids.push(doc.id);idx.activeId=doc.id;storageSet(WORKSPACE_KEY,idx);await switchSession(doc.id,false);return doc.id;}
async function switchSession(id,capture=true){
  if(capture)captureSession(false);const token=++sessionSwitchToken;const d=readDoc(id);if(!d)return showLibrary();state.restoring=true;state.loadTicket++;state.activeSessionId=id;state.projectId=d.saved?id:null;state.remoteChatBusy=false;
  if(!state.researchOnly){const idx=workspaceIndex();idx.activeId=id;storageSet(WORKSPACE_KEY,idx);}
  try{
    const g=d.generation||{};state.directReferences=g.options?.references||[];state.provider=g.provider||'replicate';state.modelId=g.modelId||'black-forest-labs/flux-schnell';state.model=g.model||null;state.style=g.style||'';state.presetId=g.presetId||'original';state.paramValues={...g.paramValues};state.fileInputs={...g.fileInputs};state.currentJob=d.currentJob||null;state.selected=null;state.image=null;
    $('prompt').value=g.prompt||'';$('advancedJson').value=g.advanced??(g.input?JSON.stringify(g.input,null,2):'');
    document.querySelectorAll('[data-provider]').forEach(b=>b.classList.toggle('active',b.dataset.provider===state.provider));$('replicateModelSection').hidden=state.provider!=='replicate';$('directModelSection').hidden=state.provider==='replicate';$('advancedSection').hidden=state.provider!=='replicate';
    if(state.provider==='replicate'){renderParameters();$('modelName').textContent=state.model?.name||state.modelId.split('/').pop();$('modelOwner').textContent=state.modelId.split('/')[0];$('schemaStatus').textContent=state.model?'Saved model schema · refresh to update':'Load model controls to continue';}
    else{if(g.selectedModel)state.chosen[modelKey(state.provider,'image')]=g.selectedModel;updateDirectControls();for(const [key,val] of Object.entries(g.options||{})){const el=$({size:'directSize',quality:'directQuality',aspect_ratio:'directRatio'}[key]);if(el&&val)el.value=val;}}
    const r=storageGet('tr-lab-v3-research:'+id,{provider:'openai'});$('chatProvider').value=r.provider||'openai';if(r.models?.[chatProvider()])state.chosen[modelKey(chatProvider(),'chat')]=r.models[chatProvider()];$('chatInput').value=storageGet(draftKey(chatProvider(),id),'');refreshChat();loadChatModels().catch(()=>{});
    setMode(d.mode||'generate');applySettings(d.settings||initialThumb);updatePresetDisplay();renderModelInfo();error('');
    if(d.assetId){const a=state.assets.find(a=>a.id===d.assetId);if(a)await selectAsset(a);else toast('The saved image is missing; the project settings are intact.',true);}
    if(state.activeSessionId!==id)return;
    if(!d.assetId){$('resultImage').removeAttribute('src');$('useThumbnail').disabled=true;$('downloadOriginal').disabled=true;}
    renderStage();updateSessionLabel();
    if(state.researchOnly){const url=new URL(location.href);url.searchParams.set('session',id);history.replaceState({},'',url);}
  }finally{if(token===sessionSwitchToken)state.restoring=false;}
  if(state.activeSessionId===id&&state.provider==='replicate'&&!state.model&&state.config.keys.REPLICATE_API_TOKEN&&!state.researchOnly)loadModel(state.modelId).catch(e=>toast(e.message,true));
}
function resetCanvas(){state.image=null;state.selected=null;state.currentJob=null;$('resultImage').removeAttribute('src');$('useThumbnail').disabled=true;$('downloadOriginal').disabled=true;renderStage();renderHistory();}
let pendingSessionDialog=null;
function askSession({title,text,confirm='Save',discard=false,name=null}){
  if(pendingSessionDialog)return Promise.resolve(null);
  $('sessionDialogTitle').textContent=title;$('sessionDialogText').textContent=text;$('sessionConfirm').textContent=confirm;$('sessionDiscard').hidden=!discard;$('sessionNameField').hidden=name===null;$('sessionNameInput').value=name||'';
  $('sessionDialog').showModal();if(name!==null)setTimeout(()=>$('sessionNameInput').select(),40);
  return new Promise(resolve=>{pendingSessionDialog=resolve;});
}
function resolveSessionDialog(value){const resolve=pendingSessionDialog;pendingSessionDialog=null;$('sessionDialog').close();resolve?.(value);}
on('sessionConfirm','click',()=>{if(!$('sessionNameField').hidden&&!$('sessionNameInput').value.trim())return $('sessionNameInput').focus();resolveSessionDialog({action:'confirm',name:$('sessionNameInput').value.trim()});});
on('sessionDiscard','click',()=>resolveSessionDialog({action:'discard'}));on('sessionCancel','click',()=>resolveSessionDialog(null));$('sessionDialog').addEventListener('close',()=>{if(pendingSessionDialog){const r=pendingSessionDialog;pendingSessionDialog=null;r(null);}});on('sessionNameInput','keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('sessionConfirm').click();}});
async function renameSession(id){const d=readDoc(id);if(!d)return;const r=await askSession({title:'Name this project',text:'The Studio and Research Desk share this title.',name:d.name});if(!r)return;d.name=r.name;d.dirty=true;writeDoc(d);updateSessionLabel();}
async function saveDoc(id,name){
  const doc=readDoc(id);if(!doc)throw new Error('This project was closed.');
  if(chatRun?.sid===id)throw new Error('Finish or stop the response before saving its conversation.');
  const {saved,dirty,currentJob,serverRevision,...project}=doc;project.research=docResearch(id);project.version=3;
  const result=await api('/api/projects',{method:'POST',body:{id,name:name||doc.name,project}});state.projects=state.projects.filter(p=>p.id!==id);state.projects.push(result.project);const latest=readDoc(id);if(latest){const {saved:_s,dirty:_d,currentJob:_j,serverRevision:_r,...current}=latest;current.research=docResearch(id);current.version=3;latest.name=result.project.name;latest.saved=true;latest.dirty=JSON.stringify(current)!==JSON.stringify(project);writeDoc(latest);}if(id===state.activeSessionId){state.projectId=id;updateSessionLabel();}return true;
}
async function saveSession(){
  if(!state.activeSessionId)return;captureSession(false);const id=state.activeSessionId,d=readDoc(id);const r=await askSession({title:'Save project & research',text:'Save this Studio setup, image references, thumbnail, and both provider conversations together in your account.',name:d.name});if(!r)return;await saveDoc(id,r.name);toast('Project and research saved to your account.');
}
async function closeSession(id){
  if(id===state.activeSessionId)captureSession(false);const d=readDoc(id);if(!d)return;
  if(chatRun?.sid===id||id===state.activeSessionId&&state.remoteChatBusy)throw new Error('Finish or stop the active chat response before closing this project.');
  const running=state.jobs.some(j=>j.sessionId===id&&activeStatus(j.status));
  const r=await askSession({title:'Close '+d.name+'?',text:(d.dirty?'This project has unsaved changes. ':d.saved?'The saved project remains in Library. ':'This new project is not saved. ')+(running?'Submitted generation continues and its output remains in Library. ':'')+'Closing is not the same as deleting a saved project.',confirm:d.dirty||!d.saved?'Save & close':'Close project',discard:d.dirty||!d.saved});if(!r)return;
  if(r.action==='confirm'&&(d.dirty||!d.saved))await saveDoc(id,d.name);
  const idx=workspaceIndex();idx.ids=idx.ids.filter(x=>x!==id);if(idx.activeId===id)idx.activeId=idx.ids.at(-1)||null;storageSet(WORKSPACE_KEY,idx);localStorage.removeItem(DOC_PREFIX+id);
  for(const p of ['openai','xai']){localStorage.removeItem(chatKey(p,id));localStorage.removeItem(draftKey(p,id));}localStorage.removeItem('tr-lab-v3-history:'+id);localStorage.removeItem('tr-lab-v3-research:'+id);publishDesk({type:'closed',sid:id});
  if(id===state.activeSessionId){state.activeSessionId=null;state.projectId=null;if(state.researchOnly){refreshChat();renderTabs();}else if(idx.activeId)await switchSession(idx.activeId,false);else{resetCanvas();await showLibrary();refreshChat();updateSessionLabel();}}
  renderTabs();
}
async function discardSession(){return newSession();}
async function openSession(id){
  if(readDoc(id)){await switchSession(id);return;}
  let p=state.projects.find(p=>p.id===id);if(!p)throw new Error('Saved session not found. Refresh Library.');if(p.partial)p=(await api('/api/projects/'+id)).project;
  const old=p.project||{},doc={...defaultDoc(),...old,id,name:p.name,saved:true,dirty:false,serverRevision:p.revision,currentJob:null};
  projectRevisions.set(id,p.revision);if(!old.generation)doc.mode='thumbnail';writeDoc(doc);restoreResearch(id,old.research||{});const idx=workspaceIndex();if(!idx.ids.includes(id))idx.ids.push(id);storageSet(WORKSPACE_KEY,idx);await switchSession(id);
}
function showShellPage(page){state.page=page;$('brandAssetsPage').hidden=page!=='brand';$('brandPageButton').classList.toggle('active',page==='brand');$('appShell').classList.add('shell-mode');$('libraryPage').hidden=page!=='library';$('workspaceSettingsPage').hidden=page!=='settings';$('modeLabel').textContent=page==='library'?'Workspace library':page==='brand'?'Brand & assets':'Settings';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.remove('active'));$('libraryButton').classList.toggle('active',page==='library');$('settingsPageButton').classList.toggle('active',page==='settings');renderTabs();}
on('libraryNew','click',newSession);on('libraryRefresh','click',showLibrary);on('librarySearch','input',renderLibrary);
on('settingsPageButton','click',()=>{captureSession(false);showShellPage('settings');renderWorkspaceSettings();});
function renderWorkspaceSettings(){
  $('settingsRailMode').value=storageGet('tr-lab-rail-mode','pinned');$('settingsModelCollapsed').checked=!$('chatModelPanel').open;
  const cards=[['Replicate','replicate','REPLICATE_API_TOKEN'],['OpenAI / GPT','openai','OPENAI_API_KEY'],['Grok / SpaceXAI','xai','XAI_API_KEY']];
  $('settingsProviderStatus').innerHTML=cards.map(([n,p,k])=>`<div class="settings-provider">${providerMark(p)}<strong>${n}</strong>${statusMarkup(p,k)}</div>`).join('');
  const configured=cards.filter(([,p,k])=>state.config.keys[k]).length,profiles=Object.keys(state.preferences?.researchProfiles||{}).length;
  $('settingsOverview').innerHTML=`<div>${icon('link')}<span>PROVIDER CONNECTIONS<strong>${configured} / 3 keys saved</strong></span></div><div>${icon('sliders')}<span>RESEARCH PROFILES<strong>${profiles} model settings</strong></span></div><div>${icon('shield')}<span>STORAGE AUTHORITY<strong>Private account storage</strong></span></div>`;
}
on('settingsConnections','click',showSettings);on('settingsPresets','click',openPresetEditor);on('editPresets','click',openPresetEditor);on('settingsResetPanels','click',resetPanelWidths);
on('settingsRailMode','change',()=>setRailMode($('settingsRailMode').value));on('settingsModelCollapsed','change',()=>{$('chatModelPanel').open=!$('settingsModelCollapsed').checked;});
let presetDraft=null;
function openPresetEditor(){presetDraft={...presets()};$('presetChoice').value=state.presetId||'original';$('presetInstructions').value=presetDraft[$('presetChoice').value];$('presetDialog').showModal();}
on('presetInstructions','input',()=>{presetDraft[$('presetChoice').value]=$('presetInstructions').value;});on('presetChoice','change',()=>{$('presetInstructions').value=presetDraft[$('presetChoice').value]||'';});on('resetPreset','click',()=>{presetDraft[$('presetChoice').value]=presetDefaults[$('presetChoice').value];$('presetInstructions').value=presetDraft[$('presetChoice').value];});
on('savePresets','click',async()=>{const r=await api('/api/preferences',{method:'POST',body:{presets:presetDraft}});state.preferences=r.preferences;state.style=presets()[state.presetId||'original'];updatePresetDisplay();captureSession();$('presetDialog').close();toast('Prompt presets saved privately.');});
function updatePresetDisplay(){document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b.dataset.preset===(state.presetId||'original')));$('promptDirection').textContent=state.style?'Added direction: '+state.style:'Your prompt. No added art direction.';}
function renderWorkflow(){
  const w=state.provider==='replicate'?workflowFor(state.model):{hasPrompt:true,promptRequired:true,imageKeys:[]};
  const known=state.provider!=='replicate'||Boolean(state.model),inputOnly=known&&!w.hasPrompt;document.body.classList.toggle('input-workflow',inputOnly&&state.mode==='generate');
  $('modelContext').hidden=!inputOnly||state.mode!=='generate';$('noPromptNotice').hidden=!inputOnly;$('prompt').hidden=inputOnly;$('directionSection').hidden=inputOnly;
  const promptLabel=$('promptCard').querySelector('.section-label');if(promptLabel)promptLabel.innerHTML=icon(inputOnly?'image':'sparkles')+(inputOnly?' RUN THIS MODEL':' THE BRIEF');
  $('prompt').placeholder=w.promptRequired?'Describe the image you want to create…':'Optional prompt · use the model default or enter your own';
  if(inputOnly){$('contextTitle').textContent=(state.model?.name||'Model')+' · input workspace';$('contextDescription').textContent=state.model?.description||'Supply the required inputs in the left panel, then run this model. No text prompt is required.';$('noPromptNotice').textContent='This model does not accept a text prompt. Generate uses the model inputs in the left panel.';
    $('contextInputs').innerHTML=w.imageKeys.map(k=>{const images=fieldImages(k);return `<div class="context-tile"><strong>${esc(state.model.schema.properties[k].title||k)}</strong>${images.length?`<img src="${esc(images[0])}" alt="${esc(k)} selected input" referrerpolicy="no-referrer"><small>Input supplied</small>`:`<div class="context-empty">${(state.model.schema.required||[]).includes(k)?'Required image':'Optional image'}</div>`}</div>`;}).join('');$('contextInputs').querySelectorAll('img').forEach(i=>i.onerror=()=>{i.hidden=true;});
    $('emptyStage').querySelector('h2').innerHTML='YOUR RESULT.<br><span>RIGHT HERE.</span>';$('emptyStage').querySelector('p').textContent='Prepare the model inputs, then generate. Your original result will appear here.';
  }else{$('emptyStage').querySelector('h2').innerHTML='A BLANK CANVAS.<br><span>ENDLESS DIRECTIONS.</span>';$('emptyStage').querySelector('p').textContent='Write a prompt. Choose your model. Give your next idea somewhere to land.';}
  let missing=[];if(state.provider==='replicate'&&state.model)try{const input=preparePrompt(collectInputs(),state.model,w.hasPrompt?$('prompt').value:undefined);missing=missingInputs(input,state.model.schema);}catch{}
  $('generate').innerHTML=icon(inputOnly?'arrow':'sparkles')+(inputOnly?'Run model':'Generate');$('generate').disabled=!state.activeSessionId||state.inputBusy>0||pendingGenerations.has(state.activeSessionId);$('contextRun').disabled=$('generate').disabled;
  $('generate').title=state.inputBusy?'Saving input images…':missing.length?'Required: '+missing.join(', '):'Submit generation once';
}
on('advancedJson','input',()=>{captureSession();renderWorkflow();});
function renderModelInfo(){
  const m=state.model;$('modelCode').textContent=m?.id||state.modelId;const owner=m?.owner||m?.id?.split('/')[0]||'R';
  $('modelChipAvatar').innerHTML=safeImageUrl(m?.ownerAvatarUrl)?`<img src="${esc(m.ownerAvatarUrl)}" alt="" referrerpolicy="no-referrer">`:esc(owner.slice(0,1).toUpperCase());
  $('modelInfoPanel').innerHTML=m?`${safeImageUrl(m.coverImageUrl)?`<img src="${esc(m.coverImageUrl)}" alt="Model example" referrerpolicy="no-referrer">`:''}<span class="eyebrow">REPLICATE / MODEL DETAILS</span><h3>${esc(m.name)}</h3><span class="micro">${esc(m.id)}</span><p>${esc(m.description)}</p><dl><dt>Runs</dt><dd>${m.runCount==null?'Not reported':Number(m.runCount).toLocaleString('en-US')}</dd><dt>Version</dt><dd>${esc(m.version?.slice(0,16)||'Not reported')}</dd><dt>Updated</dt><dd>${m.updatedAt?esc(new Date(m.updatedAt).toLocaleDateString('en-US')):'Not reported'}</dd><dt>Workflow</dt><dd>${workflowFor(m).hasPrompt?'Prompt-capable':'Input-based · no prompt'}</dd></dl><div class="model-links">${[['Provider',m.url],['License',m.licenseUrl],['Source',m.githubUrl],['Paper',m.paperUrl]].filter(([,url])=>safeImageUrl(url)).map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`).join('')}</div><p class="helper">Pricing, hardware, and warm-state availability are not inferred. Check the provider page.</p>`:'<p>Load this model to see its current schema and metadata.</p>';
  $('modelInfoPanel').querySelectorAll('img').forEach(i=>i.onerror=()=>i.hidden=true);
}
let infoTimer;
function showModelInfo(open){clearTimeout(infoTimer);$('modelInfoPanel').hidden=!open;$('modelInfoChip').setAttribute('aria-expanded',String(open));if(open){const r=$('modelInfoChip').getBoundingClientRect(),box=$('modelInfoPanel');box.style.left=Math.max(12,Math.min(innerWidth-box.offsetWidth-12,r.left))+'px';box.style.top=Math.max(10,Math.min(innerHeight-box.offsetHeight-12,r.bottom+6))+'px';}}
on('modelInfoChip','click',()=>showModelInfo($('modelInfoPanel').hidden));on('modelIdentity','pointerenter',()=>showModelInfo(true));on('modelIdentity','pointerleave',()=>{infoTimer=setTimeout(()=>showModelInfo(false),180);});on('modelInfoChip','focus',()=>showModelInfo(true));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){showModelInfo(false);setLayoutMenu(false);}});
function leftWidth(){return storageGet('tr-lab-left-width',285);}
function setLeftWidth(width,persist=true){width=Math.max(240,Math.min(420,Number(width)||285));document.documentElement.style.setProperty('--left-size',width+'px');$('leftResizeHandle').setAttribute('aria-valuenow',String(width));if(persist)storageSet('tr-lab-left-width',width);}
function resizePanels(){setLeftWidth(leftWidth(),false);setResearchWidth(storageGet('tr-lab-sidebar',330),false);}
function resetPanelWidths(){storageSet('tr-lab-left-width',285);storageSet('tr-lab-sidebar',330);resizePanels();}
let leftDragging=false;
on('leftResizeHandle','pointerdown',e=>{leftDragging=true;$('leftResizeHandle').setPointerCapture(e.pointerId);document.body.classList.add('is-resizing');});on('leftResizeHandle','pointermove',e=>{if(!leftDragging)return;const tools=$('inspector').getBoundingClientRect().left;setLeftWidth(e.clientX-tools);setResearchWidth(storageGet('tr-lab-sidebar',330),false);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])on('leftResizeHandle',event,()=>{leftDragging=false;document.body.classList.remove('is-resizing');});on('leftResizeHandle','dblclick',()=>{setLeftWidth(285);resizePanels();});on('leftResizeHandle','keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();setLeftWidth(e.key==='Home'?240:e.key==='End'?420:leftWidth()+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?40:10));resizePanels();});
function setRailMode(mode,persist=true){const auto=mode==='auto';$('appShell').classList.toggle('tabs-autohide',auto);$('appShell').classList.remove('rail-open');$('railPin').title=auto?'Pin project tabs':'Auto-hide project tabs';$('railPin').setAttribute('aria-label',$('railPin').title);document.querySelectorAll('[data-layout=pinned]').forEach(b=>b.setAttribute('aria-checked',String(!auto)));document.querySelectorAll('[data-layout=auto]').forEach(b=>b.setAttribute('aria-checked',String(auto)));if(persist)storageSet('tr-lab-rail-mode',auto?'auto':'pinned');}
on('railPin','click',()=>setRailMode($('appShell').classList.contains('tabs-autohide')?'pinned':'auto'));
let railTimer;const revealRail=()=>{clearTimeout(railTimer);$('appShell').classList.add('rail-open');};const hideRail=()=>{clearTimeout(railTimer);railTimer=setTimeout(()=>$('appShell').classList.remove('rail-open'),250);};
on('railReveal','pointerenter',revealRail);on('railReveal','focus',revealRail);on('railReveal','click',revealRail);on('railReveal','pointerleave',hideRail);on('documentRail','pointerenter',revealRail);on('documentRail','pointerleave',hideRail);on('documentRail','focusout',hideRail);
on('chatModelPanel','toggle',()=>{storageSet('tr-lab-chat-model-collapsed',!$('chatModelPanel').open);});
let layoutTimer;function setLayoutMenu(open){clearTimeout(layoutTimer);$('layoutMenu').hidden=!open;$('toggleResearch').setAttribute('aria-expanded',String(open));}
on('layoutMenuRoot','pointerenter',()=>setLayoutMenu(true));on('layoutMenuRoot','pointerleave',()=>{layoutTimer=setTimeout(()=>setLayoutMenu(false),220);});
document.addEventListener('pointerdown',e=>{if(!$('layoutMenuRoot').contains(e.target))setLayoutMenu(false);});
document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{const action=b.dataset.layout;if(action==='research')toggleResearch();else if(action==='window')popResearch();else if(action==='tab')window.open(researchUrl(),'_blank','noopener');else if(action==='left')$('collapseLeft').click();else if(action==='reset')resetPanelWidths();else setRailMode(action);setLayoutMenu(false);});
on('layoutMenu','keydown',e=>{const items=[...$('layoutMenu').querySelectorAll('button')],at=items.indexOf(document.activeElement);let i;if(e.key==='ArrowDown')i=(at+1)%items.length;if(e.key==='ArrowUp')i=(at+items.length-1)%items.length;if(e.key==='Home')i=0;if(e.key==='End')i=items.length-1;if(i!==undefined){e.preventDefault();items[i].focus();}});
const deskChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('thirdrailify-lab-desk-v3:'+labSession.account.id):null;
function publishDesk(value){deskChannel?.postMessage(value);}
function researchUrl(){if(!state.activeSessionId){toast('Open a project before detaching research.',true);return '#';}return '/research?session='+state.activeSessionId+'&tab='+(state.researchTab||'chat');}
let researchWindow=null;
function popResearch(){if(!state.activeSessionId)return toast('Open a project first.',true);captureSession(false);const url=researchUrl();researchWindow=window.open(url,'tr-lab-research-'+labSession.account.id+'-'+state.activeSessionId,'popup=yes,width=840,height=960,resizable=yes,scrollbars=yes');if(!researchWindow)return toast('Popup blocked. Use Open research in a new tab.',true);if(!$('appShell').classList.contains('research-closed'))toggleResearch();researchWindow.focus();}
on('popoutResearch','click',popResearch);on('researchTabLink','click',e=>{if(!state.activeSessionId){e.preventDefault();return;}captureSession(false);$('researchTabLink').href=researchUrl();});
on('dockResearch','click',()=>{if(state.chatBusy)throw new Error('Finish or stop the response first.');publishDesk({type:'dock',sid:state.activeSessionId});if(window.opener&&!window.opener.closed){window.opener.focus();window.close();}else location.assign('/');});
function useResearchPrompt(text,sid=state.activeSessionId){const d=readDoc(sid);if(!d)return toast('The originating project is closed. Reopen it from Library first.',true);d.generation.prompt=text;d.dirty=true;writeDoc(d);if(state.activeSessionId===sid&&!state.researchOnly){$('prompt').value=text;setMode('generate');}publishDesk({type:'use-prompt',sid,text});toast('Response placed in this project’s prompt. Review before generating.');}
if(deskChannel)deskChannel.onmessage=({data})=>{
  if(!data||typeof data!=='object')return;
  if(data.type==='dock'&&!state.researchOnly&&readDoc(data.sid)){switchSession(data.sid).then(()=>{$('appShell').classList.remove('research-closed');});}
  if(data.type==='use-prompt'&&data.sid===state.activeSessionId&&!state.researchOnly){$('prompt').value=data.text;setMode('generate');}
  if(data.type==='closed'&&data.sid===state.activeSessionId){state.activeSessionId=null;if(state.researchOnly){refreshChat();renderTabs();}else showLibrary();}
  if(data.sid!==state.activeSessionId||data.provider!==chatProvider())return;
  if(data.type==='chat-busy'){state.remoteChatBusy=data.busy;$('chatStatus').textContent=data.busy?'RESPONSE IN OTHER VIEW':'PROJECT CONVERSATION';if(!data.busy)refreshChat();}
  if(data.type==='chat-preview'&&!chatRun){let node=$('remoteChatPreview');if(!node){node=addMessage('assistant','');node.id='remoteChatPreview';}node.querySelector('.message-text').innerHTML=renderMarkdown(data.text);}
};
window.addEventListener('beforeunload',e=>{captureSession(false);if(state.chatBusy){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',event=>{
  if(!event.key?.startsWith(storagePrefix))return;const e={key:event.key.slice(storagePrefix.length)};
  if(e.key===WORKSPACE_KEY||e.key?.startsWith(DOC_PREFIX)){renderTabs();if(state.activeSessionId&&!readDoc(state.activeSessionId)){state.activeSessionId=null;refreshChat();if(!state.researchOnly)showLibrary();}else if(e.key===DOC_PREFIX+state.activeSessionId){const doc=readDoc(state.activeSessionId);$('sessionName').textContent=doc?.name||'No open project';}}
  if(e.key===draftKey(chatProvider())&&document.activeElement!==$('chatInput'))$('chatInput').value=storageGet(e.key,'');
  if(e.key===chatKey(chatProvider())&&!chatRun)refreshChat();
});
function archiveChat(){const sid=state.activeSessionId,p=chatProvider(),messages=storageGet(chatKey(p,sid),[]);if(!sid||!messages.length)return;const list=storageGet('tr-lab-v3-history:'+sid,[]);list.unshift({id:crypto.randomUUID(),provider:p,model:$('chatModelSelect').value,title:messages.find(m=>m.role==='user')?.content.slice(0,75)||'Conversation',updatedAt:new Date().toISOString(),messages});storageSet('tr-lab-v3-history:'+sid,list.slice(0,50));markResearchDirty();}
function showChatHistory(){
  const sid=state.activeSessionId;if(!sid)return;const entries=storageGet('tr-lab-v3-history:'+sid,[]);
  // Legacy archives are discoverable without modifying/removing the old keys.
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith('tr-lab-chat-saved:')){const d=storageGet(key,null);if(d)entries.push({...d,legacy:true});}}
  $('chatHistoryList').innerHTML=entries.length?entries.map(e=>`<div class="project-entry"><button class="project-chip" data-chat-open="${e.id}">${esc(e.title)}<small>${esc(e.provider==='openai'?'GPT':'Grok')} · ${e.legacy?'Legacy archive':esc(readDoc(sid)?.name)} · ${esc(new Date(e.updatedAt).toLocaleString('en-US'))}</small></button><button class="icon-button danger-text" data-chat-delete="${e.id}" aria-label="Delete saved conversation ${esc(e.title)}">${icon('trash')}</button></div>`).join(''):'<p class="helper">No archived conversations in this project. New conversation archives the current one first.</p>';
  $('chatHistoryList').querySelectorAll('[data-chat-open]').forEach(b=>b.onclick=async()=>{if(chatBusyForSession())return toast('Finish the current response first.',true);const e=entries.find(e=>e.id===b.dataset.chatOpen);archiveChat();$('chatProvider').value=e.provider;storageSet(chatKey(e.provider),e.messages);saveResearchPrefs();state.chosen[modelKey(e.provider,'chat')]=e.model;refreshChat();await loadChatModels();$('chatHistoryDialog').close();markResearchDirty();});
  $('chatHistoryList').querySelectorAll('[data-chat-delete]').forEach(b=>b.onclick=async()=>{const e=entries.find(e=>e.id===b.dataset.chatDelete);if(!await askSession({title:'Delete saved conversation?',text:'Remove this archived conversation from local project history. No provider-side record is changed.',confirm:'Delete',discard:false}))return;if(e.legacy)localStorage.removeItem('tr-lab-chat-saved:'+e.id);else storageSet('tr-lab-v3-history:'+sid,entries.filter(x=>!x.legacy&&x.id!==e.id));markResearchDirty();showChatHistory();});
  if(!$('chatHistoryDialog').open)$('chatHistoryDialog').showModal();
}
on('chatHistory','click',showChatHistory);
on('chatModelSelect','change',saveResearchPrefs);
on('parameterForm','submit',e=>e.preventDefault());
on('thumbCanvas','pointerup',()=>captureSession());
on('parameterForm','change',()=>{captureSession();renderWorkflow();});
on('modelInfoPanel','pointerenter',()=>clearTimeout(infoTimer));on('modelInfoPanel','pointerleave',()=>{infoTimer=setTimeout(()=>showModelInfo(false),180);});
on('contextRun','click',()=>$('generate').click());on('mobileChatHistory','click',showChatHistory);on('mobileNewChat','click',()=>$('newChat').click());on('mobileDeleteChat','click',()=>$('deleteChat').click());on('imageModelSelect','change',()=>captureSession());

let canvasView=null,editingResearch=null;
const defaultResearch={system:'',webSearch:true,analysis:true,xSearch:true,searchImages:true,effort:'default',imageDetail:'auto',maxOutputTokens:null};
function attachmentDraftKey(p=chatProvider(),sid=state.activeSessionId){return 'tr-lab-v4-attachment-draft:'+sid+':'+p;}
function effectiveResearchProfile(){const k=chatProvider()+'/'+$('chatModelSelect').value;return {...defaultResearch,...state.preferences?.researchProfiles?.[k]};}
async function openResearchConfig(){
 const p=chatProvider(),model=$('chatModelSelect').value;if(!model)return toast('Select a research model first.',true);
 const data=await api('/api/research/profile?provider='+p+'&model='+encodeURIComponent(model));editingResearch={provider:p,model};
 $('profileIdentity').innerHTML=providerMark(p)+`<span><strong>${esc(model)}</strong><small>${p==='openai'?'OpenAI / GPT':'Grok / SpaceXAI'} · independent model profile</small></span>`;
 fillResearchProfile(data.profile);$('xSearchRow').hidden=p!=='xai';$('searchImagesRow').hidden=p!=='xai';$('researchProfileDialog').showModal();
}
function fillResearchProfile(p){$('researchSystem').value=p.system;$('researchWeb').checked=p.webSearch;$('researchAnalysis').checked=p.analysis;$('researchX').checked=p.xSearch;$('researchSearchImages').checked=p.searchImages;$('researchEffort').value=p.effort;$('researchBudget').value=p.maxOutputTokens??'';$('researchDetail').value=p.imageDetail;}
function renderChatAttachmentTray(){
 const ids=state.activeSessionId?storageGet(attachmentDraftKey(),[]):[];
 $('chatAttachments').innerHTML=ids.map(id=>{const a=state.attachments?.find(x=>x.id===id);return `<span class="attachment-chip">${a?.kind==='image'?`<img src="${esc(a.url)}" alt="">`:icon('document')}<span>${esc(a?.name||'Attachment')}</span><button type="button" class="icon-button small" data-remove-chat-file="${id}" aria-label="Remove ${esc(a?.name||'attachment')}">${icon('close')}</button></span>`;}).join('');
 $('chatAttachments').querySelectorAll('[data-remove-chat-file]').forEach(b=>b.onclick=()=>{storageSet(attachmentDraftKey(),ids.filter(x=>x!==b.dataset.removeChatFile));markResearchDirty();renderChatAttachmentTray();});
}
function decorateMessage(node,m){
 if(m.attachments?.length){const box=document.createElement('div');box.className='message-attachments';box.innerHTML=m.attachments.map(id=>{const a=state.attachments?.find(x=>x.id===id);return `<a href="/attachments/${esc(id)}?download=1" class="attachment-chip">${a?.kind==='image'?`<img src="${esc(a.url)}" alt="${esc(a.name)}">`:icon('document')}<span>${esc(a?.name||'Attached file')}</span></a>`;}).join('');node.append(box);}
 if(m.sources?.length){const d=document.createElement('details');d.className='research-sources';d.innerHTML='<summary>'+icon('globe')+'Sources · '+m.sources.length+'</summary>'+m.sources.filter(x=>safeUrl(x.url)).map(x=>`<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.title||x.url)} ${icon('external')}</a>`).join('');node.append(d);}
 if(m.artifacts?.length){const d=document.createElement('div');d.className='message-attachments';d.innerHTML=m.artifacts.filter(a=>/^[a-f0-9-]{36}$/.test(a.id)).map(a=>`<a class="attachment-chip" href="/attachments/${a.id}?download=1">${icon('download')}${esc(a.name)}</a>`).join('');node.append(d);}
 if(m.usage){const d=document.createElement('div');d.className='response-usage';const total=m.usage.total_tokens??((m.usage.input_tokens||0)+(m.usage.output_tokens||0));d.textContent=(Number.isFinite(total)?new Intl.NumberFormat('en-US').format(total)+' tokens · ':'')+'Provider-reported usage';node.append(d);}
 if(m.warning){const d=document.createElement('p');d.className='helper response-warning';d.textContent=m.warning;node.append(d);}
}
function renderStudioAttachments(){
 if(!$('studioAttachments'))return;const urls=state.provider==='replicate'?[]:state.directReferences||[];
 $('studioAttachments').innerHTML=urls.map(url=>`<span class="attachment-chip"><img src="${esc(url)}" alt="Image edit reference"><span>Image reference</span><button class="icon-button small" type="button" data-remove-studio-file="${esc(url)}" aria-label="Remove reference image">${icon('close')}</button></span>`).join('');
 $('studioAttachments').querySelectorAll('[data-remove-studio-file]').forEach(b=>b.onclick=()=>{state.directReferences=(state.directReferences||[]).filter(u=>u!==b.dataset.removeStudioFile);captureSession();renderStudioAttachments();});
 $('attachStudio').title=state.provider==='replicate'?'Attach image to a model input':'Attach reference images for editing';
}
async function renameSavedProject(id){
 const p=state.projects.find(x=>x.id===id);if(!p)return;
 const answer=await askSession({title:'Rename saved session',text:'Only the name changes. Images, conversation history and settings are preserved.',name:p.name,confirm:'Rename'});if(!answer)return;
 const r=await api('/api/projects/'+id+'/rename',{method:'POST',body:{name:answer.name}});state.projects=state.projects.map(x=>x.id===id?r.project:x);projectRevisions.set(id,r.project.revision);
 const d=readDoc(id);if(d){d.name=answer.name;writeDoc(d);}updateSessionLabel();renderLibrary();toast('Saved session renamed.');
}
function setupFinalUI(){
 canvasView=new CanvasView($('stage'),$('resultImage'),$('stageShell'),$('viewToolbar'));state.directReferences=[];
 const tip=$('railTooltip');function showTip(b){tip.textContent=b.dataset.tooltip||b.getAttribute('aria-label');tip.hidden=false;const r=b.getBoundingClientRect();tip.style.left=(r.right+9)+'px';tip.style.top=Math.max(5,Math.min(innerHeight-40,r.top+(r.height-32)/2))+'px';b.setAttribute('aria-describedby','railTooltip');}
 document.querySelectorAll('.toolrail .rail-button').forEach(b=>{b.addEventListener('pointerenter',()=>showTip(b));b.addEventListener('focus',()=>showTip(b));for(const ev of ['pointerleave','blur','click'])b.addEventListener(ev,()=>{tip.hidden=true;b.removeAttribute('aria-describedby');});});
 on('brandPageButton','click',()=>{captureSession(false);showShellPage('brand');});on('brandOpenLibrary','click',showLibrary);
 on('configureResearch','click',openResearchConfig);on('chatContextShortcut','click',openResearchConfig);
 on('resetResearchProfile','click',async()=>{const r=await api('/api/research/profile?provider='+editingResearch.provider+'&model='+encodeURIComponent(editingResearch.model)+'&defaults=1');fillResearchProfile(r.profile);});
 on('saveResearchProfile','click',async()=>{if(!editingResearch)return;const profile={system:$('researchSystem').value,webSearch:$('researchWeb').checked,analysis:$('researchAnalysis').checked,xSearch:$('researchX').checked,searchImages:$('researchSearchImages').checked,effort:$('researchEffort').value,maxOutputTokens:$('researchBudget').value,imageDetail:$('researchDetail').value};const r=await api('/api/research/profile',{method:'POST',body:{...editingResearch,profile}});state.preferences=r.preferences;refreshChatCaption();$('researchProfileDialog').close();toast('Context and tools saved for this model.');});
 on('attachChat','click',()=>{if(!state.activeSessionId)return toast('Open a project first.',true);$('chatFileInput').click();});
 on('chatFileInput','change',async()=>{
   const sid=state.activeSessionId,p=chatProvider(),files=[...$('chatFileInput').files];$('chatFileInput').value='';if(!sid||!files.length)return;
   const ids=storageGet(attachmentDraftKey(p,sid),[]);if(ids.length+files.length>8)throw new Error('Attach up to eight files per message.');state.chatUploading=true;
   try{for(const f of files){if(f.size>16*1024*1024)throw new Error('Each attachment must be 16 MB or smaller.');const r=await api('/api/attachments',{method:'POST',body:{name:f.name,dataUrl:await readFile(f)}});state.attachments.push(r.attachment);ids.push(r.attachment.id);storageSet(attachmentDraftKey(p,sid),ids);markResearchDirty(sid);}}finally{state.chatUploading=false;renderChatAttachmentTray();}
 });
 on('attachStudio','click',async()=>{
   if(!state.activeSessionId)return toast('Open a project first.',true);
   if(state.provider==='replicate'){
     if(!state.model)await loadModel(state.modelId);
     const fields=Object.entries(state.model.schema.properties||{}).filter(([k,v])=>isImageField(k,v));
     if(!fields.length)return toast('This model has no image input. Select an editing model to attach a reference.',true);
     if(fields.length===1){$('parameterForm').querySelector(`[data-reference="${CSS.escape(fields[0][0])}"]`)?.click();return;}
     if(!$('inputTargetDialog')){const d=document.createElement('dialog');d.id='inputTargetDialog';d.innerHTML=`<form class="dialog-head" method="dialog"><h2>Choose image input</h2><button class="icon-button" aria-label="Close input picker">${icon('close')}</button></form><div class="dialog-body" id="inputTargetList"></div>`;document.body.append(d);}
     $('inputTargetList').innerHTML=fields.map(([k,v])=>`<button type="button" class="input-target button full" data-target-field="${esc(k)}">${icon('image')}${esc(v.title||k)}<small>${esc(v.description||'').slice(0,180)}</small></button>`).join('');
     $('inputTargetList').querySelectorAll('[data-target-field]').forEach(b=>b.onclick=()=>{$('inputTargetDialog').close();$('parameterForm').querySelector(`[data-reference="${CSS.escape(b.dataset.targetField)}"]`)?.click();});$('inputTargetDialog').showModal();return;
   }
   $('studioFileInput').click();
 });
 on('studioFileInput','change',async()=>{
   const sid=state.activeSessionId,provider=state.provider,files=[...$('studioFileInput').files];$('studioFileInput').value='';if(!sid||!files.length)return;
   const refs=[...(state.directReferences||[])];if(files.length+refs.length>8)throw new Error('Attach up to eight image references.');state.inputBusy++;renderWorkflow();
   try{for(const f of files){if(f.size>16*1024*1024)throw new Error('Reference images must be 16 MB or smaller.');const r=await api('/api/import',{method:'POST',body:{dataUrl:await readFile(f),title:'Reference · '+f.name}});state.assets.unshift(r.asset);refs.push(r.asset.url);}
     const d=readDoc(sid);if(d){d.generation.options??={};d.generation.options.references=refs;d.dirty=true;writeDoc(d);}if(sid===state.activeSessionId&&provider===state.provider){state.directReferences=refs;captureSession();renderStudioAttachments();}
   }finally{state.inputBusy--;renderWorkflow();}
 });
 $('chatProvider').addEventListener('change',renderChatAttachmentTray);$('chatModelSelect').addEventListener('change',refreshChatCaption);
 document.querySelectorAll('[data-provider]').forEach(b=>b.addEventListener('click',renderStudioAttachments));
 window.addEventListener('storage',e=>{if(e.key===attachmentDraftKey())renderChatAttachmentTray();});
}

boot().catch(e=>{$('serverStatus').textContent='Workshop unavailable';error('The Workshop could not finish loading. '+e.message);});
