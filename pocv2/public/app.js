const $=id=>document.getElementById(id);
const icon=name=>`<svg class="icon"><use href="/icons.svg#${name}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={csrf:'',config:null,provider:'replicate',modelId:'black-forest-labs/flux-schnell',model:null,assets:[],jobs:[],projects:[],selected:null,image:null,currentJob:null,mode:'generate',style:'',fileInputs:{},pollTimer:null,chatBusy:false,chatAbort:null,projectId:null,chosen:{},modelChoices:{},researchOnly:location.pathname==='/research'};
let toastTimer;
function toast(text,error=false){$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?8500:4200);}
function error(text){$('mainError').textContent=text;$('mainError').hidden=!text;}
async function api(route,{method='GET',body,signal}={}){
  const response=await fetch(route,{method,headers:method==='POST'?{'Content-Type':'application/json','X-Lab-CSRF':state.csrf}:{},body:body===undefined?undefined:JSON.stringify(body),signal});
  const data=await response.json();if(!response.ok||data.ok===false)throw new Error(data.error||`Request failed (${response.status})`);return data;
}
function on(id,event,handler){$(id).addEventListener(event,async e=>{try{await handler(e);}catch(err){toast(err.message,true);}});}
const activeStatus=s=>!['succeeded','failed','canceled','submission_uncertain','interrupted','download_failed'].includes(s);
const niceStatus=s=>String(s||'').replaceAll('_',' ');
const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read this image.'));r.readAsDataURL(file);});
function storageGet(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function storageSet(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{toast('Local browser storage is full. Saved image projects remain on disk.',true);}}

async function boot(){
  const data=await api('/api/state');state.csrf=data.csrf;state.config=data.config;state.jobs=data.jobs;state.assets=data.assets;state.projects=data.projects;state.catalog=data.catalog;
  if(data.config.fonts.length){
    const mapping={display:['American Captain','--display'],body:['Blinker','--body'],bodybold:['Blinker',null],mono:['Geist Mono','--mono']};
    const rules=data.config.fonts.map(k=>{const [family]=mapping[k];return `@font-face{font-family:"${family}";src:url('/brand-fonts/${k}');font-weight:${k==='bodybold'?600:k==='mono'?'100 900':400};font-display:swap}`;}).join('');
    const style=document.createElement('style');style.textContent=rules;document.head.append(style);
    document.fonts.ready.then(()=>drawThumbnail());
    for(const key of data.config.fonts){const [family,varname]=mapping[key];if(varname)document.documentElement.style.setProperty(varname,`'${family}',${getComputedStyle(document.documentElement).getPropertyValue(varname)}`);}
  }
  $('serverStatus').textContent='Local server connected';state.chosen=storageGet('tr-lab-model-choices',{});setupBrand();setupLayout();updateKeyStatus();renderHistory();renderModelCards(state.catalog);refreshChat();loadChatModels().catch(()=>{});
  if(innerWidth<=1000&&!state.researchOnly){$('appShell').classList.add('research-closed');$('toggleResearch').setAttribute('aria-expanded','false');}
  setResearchWidth(storageGet('tr-lab-sidebar',330),false);
  const remembered=storageGet('tr-lab-prompt','');if(remembered)$('prompt').value=remembered;
  if(state.assets.length&&!state.researchOnly&&!storageGet('tr-lab-work-reset',false))await selectAsset(state.assets[0]);
  if(state.config.keys.REPLICATE_API_TOKEN&&!state.researchOnly){loadModel(state.modelId).catch(e=>{$('schemaStatus').textContent=e.message;});}
  schedulePoll();
}
function updateKeyStatus(){
  $('keyDot').classList.toggle('ready',Object.entries(state.config.keys).some(([k,v])=>k!=='REPLICATE_WEBHOOK_SIGNING_SECRET'&&v));
  updateDirectControls();
}
function setMode(mode){
  state.mode=mode;document.body.classList.toggle('thumbnail-mode',mode==='thumbnail');
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('generationControls').hidden=mode!=='generate';$('thumbnailControls').hidden=mode!=='thumbnail';$('promptCard').hidden=mode!=='generate';
  $('modeLabel').textContent=mode==='thumbnail'?'Thumbnail composer':'Image studio';$('inspectorTitle').textContent=mode==='thumbnail'?'Composition settings':'Generation settings';$('workTitle').innerHTML=mode==='thumbnail'?'THUMBNAIL COMPOSER<span>.</span>':'THE IMAGE STUDIO<span>.</span>';
  renderStage();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>{
  state.provider=b.dataset.provider;document.querySelectorAll('[data-provider]').forEach(x=>x.classList.toggle('active',x===b));
  error('');$('replicateModelSection').hidden=state.provider!=='replicate';$('directModelSection').hidden=state.provider==='replicate';$('advancedSection').hidden=state.provider!=='replicate';
  if(state.provider==='replicate')renderParameters();else updateDirectControls();
});
document.querySelectorAll('[data-style]').forEach(b=>b.onclick=()=>{state.style=b.dataset.style;document.querySelectorAll('[data-style]').forEach(x=>x.classList.toggle('active',x===b));$('promptDirection').textContent=state.style?'Added direction: '+state.style:'Your prompt. No hidden embellishment.';});
on('prompt','input',()=>storageSet('tr-lab-prompt',$('prompt').value));

function renderModelCards(items){
  $('modelResults').innerHTML=items.length?items.map(m=>`<button class="model-result" data-model-id="${esc(m.id)}"><span class="tag">${esc(m.tag||'Replicate model')}</span>${icon('arrow')}<strong>${esc(m.name)}</strong><small>${esc(m.id)}</small><p>${esc(m.description||'Load to inspect its live schema and model inputs.')}</p></button>`).join(''):'<div class="soft-note">No models found. Try a different search or paste the model URL.</div>';
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
  $('schemaStatus').textContent='Reading current provider schema…';$('loadModel').disabled=true;
  try{
    const data=await api('/api/model?id='+encodeURIComponent(id));state.model=data.model;state.modelId=data.model.ref||data.model.id;state.fileInputs={};$('advancedJson').value='';
    $('modelName').textContent=data.model.name;$('modelOwner').textContent=data.model.id.split('/')[0];
    $('schemaStatus').textContent=`Live inputs loaded · version ${String(data.model.version).slice(0,10)}`;
    if(state.provider==='replicate')renderParameters();
  }catch(e){$('schemaStatus').textContent=e.message;throw e;}finally{$('loadModel').disabled=false;}
}
function renderParameters(){
  if(state.provider!=='replicate')return;
  const m=state.model;
  if(!m){$('parameterForm').innerHTML='<div class="soft-note">Connect Replicate and load the selected model to view its real inputs.</div>';$('fieldCount').textContent='—';return;}
  const fields=Object.entries(m.schema.properties||{}).filter(([k])=>k!==m.promptKey).sort((a,b)=>(a[1]['x-order']??99)-(b[1]['x-order']??99));
  $('fieldCount').textContent=fields.length+' FIELDS';
  $('parameterForm').innerHTML=fields.map(([key,p])=>{
    const required=(m.schema.required||[]).includes(key),name=p.title||key.replaceAll('_',' '),id='param_'+key,val=p.default??'';
    const attrs=`id="${esc(id)}" data-param="${esc(key)}" data-type="${esc(p.type||'string')}"`;
    let control;
    if(p.enum)control=`<select ${attrs}><option value="">Provider default${required?' / choose':''}</option>${p.enum.map(v=>`<option value="${esc(String(v))}" ${v===val?'selected':''}>${esc(String(v))}</option>`).join('')}</select>`;
    else if(p.type==='boolean')control=`<select ${attrs}><option value="">Provider default</option><option value="true" ${val===true?'selected':''}>Yes</option><option value="false" ${val===false?'selected':''}>No</option></select>`;
    else if(p.type==='integer'||p.type==='number')control=`<input ${attrs} type="number" value="${esc(val)}" step="${p.type==='integer'?1:'any'}" ${p.minimum!==undefined?`min="${p.minimum}"`:''} ${p.maximum!==undefined?`max="${p.maximum}"`:''} placeholder="Provider default">`;
    else if(p.type==='array'||p.type==='object')control=`<textarea ${attrs} rows="2" placeholder='${p.type==='array'?'[ ]':'{ }'}'>${val!==''?esc(JSON.stringify(val)):''}</textarea>`;
    else control=`<input ${attrs} value="${esc(val)}" placeholder="${p.format==='uri'?'HTTPS image URL or attach below':'Provider default'}">`;
    const upload=(p.format==='uri'||(p.type==='array'&&(p.items?.format==='uri'||/image/.test(key))))?`<input type="file" accept="image/png,image/jpeg,image/webp" data-reference="${esc(key)}" ${p.type==='array'?'multiple':''}><small data-file-note="${esc(key)}">Reference uploads are sent to this model only when you Generate.</small>`:'';
    return `<label class="field" for="${esc(id)}">${esc(name)}${required?' *':''}${control}${upload}<small>${esc((p.description||'').slice(0,280))}</small></label>`;
  }).join('')||'<div class="soft-note">This model uses only the prompt.</div>';
  $('parameterForm').querySelectorAll('[data-reference]').forEach(el=>el.onchange=async()=>{
    try{const files=[...el.files];if(files.length>4)throw new Error('Up to four reference images per field in this POC.');if(files.some(f=>f.size>5*1024*1024))throw new Error('Each reference image must be 5 MB or smaller.');const urls=await Promise.all(files.map(readFile));state.fileInputs[el.dataset.reference]=el.multiple?urls:urls[0];el.parentElement.querySelector('[data-file-note]').textContent=files.map(f=>f.name).join(', ')+' · attached';}catch(e){el.value='';toast(e.message,true);}
  });
  $('parameterForm').querySelectorAll('[data-param]').forEach(el=>el.addEventListener('input',()=>delete state.fileInputs[el.dataset.param]));
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
  $('parameterForm').innerHTML=p==='openai'?`<label class="field">Output size<select id="directSize"><option value="1536x1024">1536 × 1024 · landscape</option><option value="1024x1024">1024 × 1024 · square</option><option value="1024x1536">1024 × 1536 · portrait</option></select></label><label class="field">Quality<select id="directQuality"><option value="low">Low · draft</option><option value="medium">Medium</option><option value="high">High</option><option value="auto">Model decides</option></select></label><p class="helper">One image per submission. Model-specific options/access are validated by the provider. Direct editing remains deferred.</p>`:`<label class="field">Aspect ratio<select id="directRatio"><option>16:9</option><option>1:1</option><option>3:2</option><option>2:3</option><option>9:16</option></select></label><p class="helper">One image per submission. Output is saved locally.</p>`;
  loadImageModels().catch(()=>{});
}
on('generate','click',async()=>{
  error('');let prompt=$('prompt').value.trim();if(!prompt){error('Describe your image in the prompt box first.');$('prompt').focus();return;}
  const key={replicate:'REPLICATE_API_TOKEN',openai:'OPENAI_API_KEY',xai:'XAI_API_KEY'}[state.provider];if(!state.config.keys[key]){showSettings();return;}
  $('generate').disabled=true;
  try{
    if(state.provider==='replicate'&&!state.model)await loadModel(state.modelId);
    if(state.style)prompt+='\n\nArt direction: '+state.style;
    const input=state.provider==='replicate'?collectInputs():{};
    const model=state.provider==='replicate'?state.modelId:$('imageModelSelect').value;if(!model||(state.provider!=='replicate'&&$('imageModelSelect').disabled))throw new Error('Choose an image model. Use Refresh models if the list has not loaded.');
    const options=state.provider==='openai'?{size:$('directSize').value,quality:$('directQuality').value}:state.provider==='xai'?{aspect_ratio:$('directRatio').value}:{};
    const result=await api('/api/generate',{method:'POST',body:{provider:state.provider,model,prompt,input,options,requestId:crypto.randomUUID()}});
    state.currentJob=result.job.id;state.jobs.unshift(result.job);renderJob();schedulePoll();
  }catch(e){error(e.message);}finally{$('generate').disabled=false;}
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
    const current=state.jobs.find(x=>x.id===state.currentJob);
    if(current?.status==='succeeded'&&current.assets.length&&!current.localSelected){await selectAsset(current.assets[0]);state.currentJob=null;toast('Generation complete. Original image saved to your local library.');}
    renderJob();renderHistory();$('serverStatus').textContent='Local server connected';
  }catch(e){$('serverStatus').textContent='Server connection interrupted';error(e.message);}
  schedulePoll();
}
on('cancelCurrent','click',async()=>{if(!state.currentJob)return;await api('/api/jobs/'+state.currentJob+'/cancel',{method:'POST',body:{}});await refreshJobs();});

async function selectAsset(asset){
  state.selected=asset;state.projectId=null;storageSet('tr-lab-work-reset',false);updateSessionLabel();const image=new Image();image.src=asset.url;
  try{await image.decode();}catch{throw new Error('Saved image could not be decoded. Open the library and check its download.');}
  state.image=image;$('resultImage').src=asset.url;$('resultImage').alt=asset.title||'Generated or imported image';
  $('useThumbnail').disabled=false;$('downloadOriginal').disabled=false;renderStage();renderHistory();
}
function renderStage(){
  const thumb=state.mode==='thumbnail';$('emptyStage').hidden=Boolean(state.image)||thumb;$('resultImage').hidden=!state.image||thumb;$('thumbCanvas').hidden=!thumb;
  if(thumb){drawThumbnail();$('canvasLabel').textContent='COMPOSER / EDITABLE TEXT';}
  else $('canvasLabel').textContent='CANVAS / ORIGINAL';
  $('assetMeta').textContent=state.image?`${state.image.naturalWidth} × ${state.image.naturalHeight} · ${state.selected.source==='generation'?'Generated original':state.selected.source==='thumbnail'?'Thumbnail export':'Local image'} · ${Math.round(state.selected.bytes/1024)} KB`:'Original framing preserved · No image loaded';
  renderJob();
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
  const file=e.target.files[0];if(!file)return;
  try{if(file.size>12*1024*1024)throw new Error('Import an image smaller than 12 MB.');const result=await api('/api/import',{method:'POST',body:{dataUrl:await readFile(file),title:file.name}});state.assets.unshift(result.asset);await selectAsset(result.asset);toast('Image saved locally. It has not been sent to an AI provider.');}finally{e.target.value='';}
});

const thumbIds=['thumbSize','thumbFit','thumbTitle','thumbFontSize','thumbColor','thumbAccent','thumbX','thumbY','thumbBadge','thumbSubtitle','thumbDim','thumbBrand','exportType'];
$('thumbTitle').value='YOUR NEXT\nBIG IDEA';
function thumbSettings(){return Object.fromEntries(thumbIds.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));}
function applySettings(settings){for(const id of thumbIds)if(settings[id]!==undefined){if($(id).type==='checkbox')$(id).checked=Boolean(settings[id]);else $(id).value=settings[id];}drawThumbnail();}
for(const id of thumbIds)on(id,'input',drawThumbnail);
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
$('thumbCanvas').addEventListener('pointerup',()=>dragging=false);
function moveTitle(e){const r=$('thumbCanvas').getBoundingClientRect();$('thumbX').value=Math.max(5,Math.min(80,100*(e.clientX-r.left)/r.width));$('thumbY').value=Math.max(10,Math.min(85,100*(e.clientY-r.top)/r.height));drawThumbnail();}
on('demoButton','click',async()=>{
  const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');const g=ctx.createLinearGradient(0,0,1280,720);g.addColorStop(0,'#19192b');g.addColorStop(.42,'#060b0e');g.addColorStop(1,'#2d2a0c');ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
  const light=ctx.createRadialGradient(840,250,5,850,260,500);light.addColorStop(0,'#a48a374f');light.addColorStop(1,'#10101700');ctx.fillStyle=light;ctx.fillRect(0,0,1280,720);
  ctx.save();ctx.translate(850,350);ctx.rotate(-.3);for(let i=0;i<26;i++){ctx.beginPath();ctx.ellipse(0,0,90+i*13,140+i*9,0,0,Math.PI*2);ctx.strokeStyle=`rgba(${i%3===0?'211,184,80':'106,91,161'},${.05+(26-i)/80})`;ctx.lineWidth=i%4===0?3:1;ctx.stroke();}ctx.restore();
  ctx.strokeStyle='#b2983433';for(let i=0;i<20;i++){ctx.beginPath();ctx.moveTo(40+i*75,720);ctx.lineTo(760+i*12,0);ctx.stroke();}
  const out=await api('/api/import',{method:'POST',body:{dataUrl:c.toDataURL('image/png'),title:'Layout study — procedural artwork, not AI-generated'}});state.assets.unshift(out.asset);await selectAsset(out.asset);setMode('thumbnail');toast('Layout study loaded. This is procedural demo artwork, not an AI generation.');
});
on('saveProject','click',saveSession);on('saveSession','click',saveSession);on('discardSession','click',discardSession);
on('exportThumb','click',async()=>{
  await document.fonts.ready;drawThumbnail();const format=$('exportType').value;const r=await api('/api/export',{method:'POST',body:{dataUrl:$('thumbCanvas').toDataURL('image/'+format,.93),title:$('thumbTitle').value.replaceAll('\n',' ')||'Thumbnail'}});state.assets.unshift(r.asset);renderHistory();download(r.asset.url+'?download=1');toast('Export saved in .data/assets and sent to your browser downloads.');
});

async function showLibrary(){
  const r=await api('/api/state');state.assets=r.assets;state.projects=r.projects;state.jobs=r.jobs;
  $('projectList').innerHTML=state.projects.length?state.projects.map(p=>`<div class="project-entry"><button class="project-chip" data-project="${p.id}">${esc(p.name)}<small>${p.project?.mode==='generate'?'Image session':'Thumbnail project'} · ${esc(new Date(p.updatedAt).toLocaleString())}</small></button><button class="icon-button danger-text" data-delete-project="${p.id}" aria-label="Delete session ${esc(p.name)}" title="Delete saved session">${icon('trash')}</button></div>`).join(''):'<p class="helper">Save a session to keep its prompt, selected model, image and editable thumbnail.</p>';
  $('assetLibrary').innerHTML=state.assets.length?state.assets.map(a=>`<div class="asset-entry"><button class="asset-tile" data-asset="${a.id}"><img src="${a.url}" loading="lazy" alt="${esc(a.title||a.source)}"><span>${esc(a.title||a.source)}</span></button><button class="icon-button danger-text asset-delete" data-delete-asset="${a.id}" aria-label="Delete image ${esc(a.title||a.source)}" title="Delete local image">${icon('trash')}</button></div>`).join(''):'<p class="helper">No saved images yet.</p>';
  $('jobList').innerHTML=state.jobs.length?state.jobs.map(j=>`<div class="job-row"><div><strong>${esc(j.prompt.slice(0,110))}</strong><p>${esc(j.provider+' / '+j.model)}</p><span class="micro">${esc(niceStatus(j.status))} · ${esc(new Date(j.createdAt).toLocaleString())}</span>${j.error?`<div class="error-message">${esc(j.error)}</div>`:''}</div><div class="job-buttons"><button class="text-button" data-reuse="${j.id}">Reuse prompt</button>${j.providerUrl?`<a href="${esc(j.providerUrl)}" target="_blank" rel="noopener noreferrer" class="text-button">Provider ↗</a>`:''}${j.provider==='replicate'&&j.providerId&&['download_failed','interrupted'].includes(j.status)?`<button class="button compact" data-retry="${j.id}">Retry download</button>`:''}<button class="text-button danger-text" data-delete-job="${j.id}" ${activeStatus(j.status)?'disabled title="Cancel or finish this job before deleting history"':''}>Delete history</button></div></div>`).join(''):'<p class="helper">No generation jobs have been submitted.</p>';
  $('assetLibrary').querySelectorAll('[data-asset]').forEach(b=>b.onclick=async()=>{try{await selectAsset(state.assets.find(a=>a.id===b.dataset.asset));$('libraryDialog').close();}catch(e){toast(e.message,true);}});
  $('projectList').querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>openSession(b.dataset.project).catch(e=>toast(e.message,true)));
  $('jobList').querySelectorAll('[data-reuse]').forEach(b=>b.onclick=()=>{$('prompt').value=state.jobs.find(j=>j.id===b.dataset.reuse).prompt;storageSet('tr-lab-prompt',$('prompt').value);setMode('generate');$('libraryDialog').close();toast('Prompt restored. Check model/settings before generating.');});
  $('jobList').querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{try{await api('/api/jobs/'+b.dataset.retry+'/download',{method:'POST',body:{}});state.currentJob=b.dataset.retry;$('libraryDialog').close();await refreshJobs();}catch(e){toast(e.message,true);}});
  for(const [attribute,kind,message] of [['project','projects','Delete this saved session? Images and exports will be retained.'],['asset','assets','Permanently delete this local image? Files saved outside the Lab and provider-side files are not affected.'],['job','jobs','Delete this generation history? Saved images remain. This does not cancel or delete anything at the provider.']]){
    $('libraryDialog').querySelectorAll('[data-delete-'+attribute+']').forEach(b=>b.onclick=async()=>{if(!confirm(message))return;b.disabled=true;try{const id=b.dataset['delete'+attribute[0].toUpperCase()+attribute.slice(1)];const out=await api('/api/'+kind+'/'+id+'/delete',{method:'POST',body:{}});if(kind==='projects'&&state.projectId===id){state.projectId=null;updateSessionLabel();}if(kind==='assets'&&state.selected?.id===id)resetCanvas();await showLibrary();renderHistory();toast(out.message);}catch(e){toast(e.message,true);}finally{b.disabled=false;}});
  }
  if(!$('libraryDialog').open)$('libraryDialog').showModal();
}
on('libraryButton','click',showLibrary);on('allHistory','click',showLibrary);
on('helpButton','click',()=>$('helpDialog').showModal());

function showSettings(){
  const cards=[['REPLICATE_API_TOKEN','Replicate','replicate','https://replicate.com/account/api-tokens'],['OPENAI_API_KEY','OpenAI / GPT','openai','https://platform.openai.com/api-keys'],['XAI_API_KEY','Grok / SpaceXAI','xai','https://console.x.ai/']];
  $('keyFields').innerHTML=cards.map(([key,name,p,url])=>`<section class="key-card"><div class="key-card-head"><span>${name}</span><span class="key-state ${state.config.keys[key]?'set':''}">${state.config.keys[key]?'KEY SAVED · NOT A LIVE VERIFICATION':'NOT CONFIGURED'}</span></div><div class="key-row"><input type="password" id="key_${key}" autocomplete="new-password" spellcheck="false" placeholder="${state.config.keys[key]?'Saved — leave blank to keep':'Paste your API key'}" aria-label="${name} API key"><button type="button" class="button compact" data-test-provider="${p}">Test</button></div><p><a href="${url}" target="_blank" rel="noopener noreferrer">Open provider key console ↗</a> · Keys are never returned to this page.</p></section>`).join('');
  const names=[['OPENAI_IMAGE_MODEL','OpenAI image model',state.config.models.openaiImage],['OPENAI_CHAT_MODEL','OpenAI chat model',state.config.models.openaiChat],['XAI_IMAGE_MODEL','Grok image model',state.config.models.xaiImage],['XAI_CHAT_MODEL','Grok chat model',state.config.models.xaiChat]];
  $('modelSettings').innerHTML=names.map(([k,label,v])=>`<label class="field">${label}<select id="cfg_${k}"><option value="${esc(v)}">${esc(v||'Load provider models')}</option></select></label>`).join('');
  $('keyFields').querySelectorAll('[data-test-provider]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await saveConnections(false);const result=await api('/api/settings/test',{method:'POST',body:{provider:b.dataset.testProvider}});settingsNote(result.message);}catch(e){settingsNote(e.message,true);}finally{b.disabled=false;}});
  $('settingsMessage').hidden=true;$('settingsDialog').showModal();refreshSettingsModels().catch(e=>settingsNote(e.message,true));showBrandStatus();
}
function settingsNote(message,bad=false){$('settingsMessage').textContent=message;$('settingsMessage').classList.toggle('error-message',bad);$('settingsMessage').hidden=false;}
async function saveConnections(announce=true){
  const vals={};for(const k of ['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY']){if($('key_'+k)?.value)vals[k]=$('key_'+k).value;}
  for(const k of ['OPENAI_IMAGE_MODEL','OPENAI_CHAT_MODEL','XAI_IMAGE_MODEL','XAI_CHAT_MODEL'])if($('cfg_'+k)?.value)vals[k]=$('cfg_'+k).value;
  const r=await api('/api/settings',{method:'POST',body:vals});state.config=r.config;
  for(const k of ['REPLICATE_API_TOKEN','OPENAI_API_KEY','XAI_API_KEY']){$('key_'+k).value='';$('key_'+k).placeholder=state.config.keys[k]?'Saved — leave blank to keep':'Paste your API key';const chip=$('key_'+k).closest('.key-card').querySelector('.key-state');chip.textContent=state.config.keys[k]?'KEY SAVED · NOT A LIVE VERIFICATION':'NOT CONFIGURED';chip.classList.toggle('set',state.config.keys[k]);}
  state.modelChoices={};updateKeyStatus();loadChatModels().catch(()=>{});refreshChatCaption();if(announce)settingsNote('Saved to this Lab folder’s .env file. Use Test to verify provider authentication. No restart is needed.');
}
on('connections','click',showSettings);on('saveSettings','click',async()=>{try{await saveConnections();}catch(e){settingsNote(e.message,true);}});
on('fetchWebhookKey','click',async()=>{try{await saveConnections(false);const r=await api('/api/settings/webhook-key',{method:'POST',body:{}});state.config=r.config;settingsNote(r.message);}catch(e){settingsNote(e.message,true);}});

function toggleResearch(){if(state.researchOnly)return;const closed=$('appShell').classList.toggle('research-closed');$('toggleResearch').setAttribute('aria-expanded',String(!closed));setResearchWidth(storageGet('tr-lab-sidebar',330),false);}
on('toggleResearch','click',toggleResearch);on('collapseResearch','click',toggleResearch);
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
const chats={openai:storageGet('tr-lab-chat-openai',[]),xai:storageGet('tr-lab-chat-xai',[])};
function chatProvider(){return $('chatProvider').value;}
function refreshChatCaption(){if(!state.config)return;$('chatModelCaption').textContent=($('chatModelSelect').value||'Select a model')+' · No web tools';}
function addMessage(role,text){
  const node=document.createElement('div');node.className='chat-message '+role;
  const head=document.createElement('div');head.className='message-head';head.textContent=role==='user'?'YOU':chatProvider()==='openai'?'GPT / OPENAI':'GROK / SPACEXAI';
  const body=document.createElement('div');body.className='message-text';body.textContent=text;node.append(head,body);$('chatMessages').append(node);return node;
}
function attachActions(node,text){
  const div=document.createElement('div');div.className='message-actions';
  const copy=document.createElement('button');copy.className='text-button';copy.textContent='Copy';copy.onclick=()=>navigator.clipboard.writeText(text).then(()=>toast('Copied.'));
  const use=document.createElement('button');use.className='text-button';use.textContent='Use as prompt';use.onclick=()=>useResearchPrompt(text);div.append(copy,use);node.append(div);
}
function bindSuggestions(){document.querySelectorAll('[data-chat-prompt]').forEach(b=>b.onclick=()=>{$('chatInput').value=b.dataset.chatPrompt;storageSet('tr-lab-chat-draft-'+chatProvider(),$('chatInput').value);$('chatInput').focus();});}
function refreshChat(){refreshChatCaption();const history=chats[chatProvider()];$('chatMessages').innerHTML=history.length?'':welcomeMarkup;for(const m of history){const node=addMessage(m.role,m.content);if(m.role==='assistant')attachActions(node,m.content);}bindSuggestions();}
on('chatProvider','change',()=>{if(state.chatBusy){$('chatProvider').value=state.chatActiveProvider;return;}state.remoteChatBusy=false;storageSet('tr-lab-chat-provider',chatProvider());$('chatInput').value=storageGet('tr-lab-chat-draft-'+chatProvider(),'');refreshChat();loadChatModels().catch(()=>{});toast('Switched provider. Conversations stay separate.');});
on('newChat','click',()=>{if(state.chatBusy||state.remoteChatBusy)throw new Error('Stop or finish the current response first.');archiveChat();chats[chatProvider()]=[];storageSet('tr-lab-chat-'+chatProvider(),[]);refreshChat();$('chatInput').value='';storageSet('tr-lab-chat-draft-'+chatProvider(),'');toast('Previous conversation archived. A new chat is ready.');});
on('deleteChat','click',()=>{if(state.chatBusy||state.remoteChatBusy)throw new Error('Stop or finish the current response first.');if(!confirm('Delete this current conversation from this browser? This does not delete provider-side records.'))return;chats[chatProvider()]=[];storageSet('tr-lab-chat-'+chatProvider(),[]);$('chatInput').value='';storageSet('tr-lab-chat-draft-'+chatProvider(),'');refreshChat();});
async function sendChatRequest(){
  if(state.chatBusy){state.chatAbort?.abort();return;}
  const p=chatProvider(),model=$('chatModelSelect').value,text=$('chatInput').value.trim();if(!text)return;if(!model)throw new Error('Choose a chat model first.');
  if(!state.config.keys[p==='openai'?'OPENAI_API_KEY':'XAI_API_KEY'])return showSettings();
  if(chats[p].length>=38)throw new Error('Start a new chat to stay within the POC conversation limit.');
  if(!chats[p].length)$('chatMessages').innerHTML='';
  chats[p].push({role:'user',content:text});storageSet('tr-lab-chat-'+p,chats[p]);addMessage('user',text);$('chatInput').value='';storageSet('tr-lab-chat-draft-'+p,'');
  const waiting=document.createElement('div');waiting.className='thinking-indicator';waiting.innerHTML='<i></i><i></i><i></i><span>Waiting for response…</span>';$('chatMessages').append(waiting);
  state.chatBusy=true;state.chatActiveProvider=p;publishDesk({type:'chat-busy',provider:p,busy:true});$('chatModelSelect').disabled=true;state.chatAbort=new AbortController();$('chatProvider').disabled=true;$('sendChat').innerHTML=icon('close');$('sendChat').setAttribute('aria-label','Stop chat response');$('chatStatus').textContent='REQUEST IN PROGRESS';
  let responseNode=null,full='';
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-CSRF':state.csrf},body:JSON.stringify({provider:p,model,messages:chats[p]}),signal:state.chatAbort.signal});
    if(!response.ok){const d=await response.json();throw new Error(d.error||'Chat failed.');}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
      while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const type=block.match(/^event: (.*)$/m)?.[1],raw=block.match(/^data: (.*)$/m)?.[1];if(!raw)continue;const d=JSON.parse(raw);
        if(type==='status')waiting.querySelector('span').textContent=d.message;
        if(type==='delta'){waiting.remove();if(!responseNode)responseNode=addMessage('assistant','');full+=d.text;publishDesk({type:'chat-preview',provider:p,text:full});responseNode.querySelector('.message-text').textContent=full;$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
        if(type==='error')throw new Error(d.message);
      }
    }
    if(full){chats[p].push({role:'assistant',content:full});storageSet('tr-lab-chat-'+p,chats[p]);attachActions(responseNode,full);}
  }catch(e){toast(e.name==='AbortError'?'Response stopped. Provider work already performed may still be billed.':e.message,true);if(full&&responseNode){const note=document.createElement('small');note.textContent='\n[Partial response — not saved to conversation]';responseNode.append(note);}}
  finally{waiting.remove();state.chatBusy=false;state.chatAbort=null;$('chatModelSelect').disabled=false;publishDesk({type:'chat-busy',provider:p,busy:false});$('chatProvider').disabled=false;$('sendChat').innerHTML=icon('send');$('sendChat').setAttribute('aria-label','Send chat message');$('chatStatus').textContent='LOCAL CONVERSATION';}
}
on('sendChat','click',async()=>{if(state.chatBusy){state.chatAbort?.abort();return;}if(state.remoteChatBusy)throw new Error('A response is running in the other research view. Finish it there first.');if(navigator.locks)await navigator.locks.request('thirdrailify-lab-chat-'+chatProvider(),{ifAvailable:true},async lock=>{if(!lock)throw new Error('This conversation is being used in another tab/window.');await sendChatRequest();});else await sendChatRequest();});
on('chatInput','input',()=>storageSet('tr-lab-chat-draft-'+chatProvider(),$('chatInput').value));
on('chatInput','keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('sendChat').click();}});
// Modal-native focus and Escape handling; click on the backdrop closes only dialogs.
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
// POC 0.2: model catalogues, session lifecycle, layout and shared research views.
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
  const select=$(selectId),note=$(noteId),ticket=crypto.randomUUID();select.dataset.ticket=ticket;
  select.disabled=true;select.innerHTML='<option value="">Loading models…</option>';note.textContent='Loading models from '+(provider==='openai'?'OpenAI':'Grok')+'…';
  if(!state.config.keys[provider==='openai'?'OPENAI_API_KEY':'XAI_API_KEY']){select.innerHTML='<option value="">Connect provider first</option>';note.textContent='Save your API key in Connections. Models will load automatically.';return;}
  try{const data=await fetchModelChoices(provider,kind,refresh);if(select.dataset.ticket!==ticket)return;populateModels(select,provider,kind,data);select.disabled=!data.items.length;note.textContent=`${data.items.length} ${kind} models · ${data.source==='live'?'Listed by provider':data.source==='stale'?'Cached · refresh failed':'Cached provider list'}`+(data.warning?' · '+data.warning:'');}
  catch(e){if(select.dataset.ticket!==ticket)return;const configured=state.chosen[modelKey(provider,kind)]||cfgModel(provider,kind);select.innerHTML=configured?`<option value="${esc(configured)}">${esc(configured)} · saved setting</option>`:'<option value="">Model list unavailable</option>';select.disabled=!configured;note.textContent=e.message+(configured?' Showing saved setting, not a verified catalogue choice.':'');}
  finally{if(kind==='chat')refreshChatCaption();}
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
function updateSessionLabel(){
  const saved=state.projects.find(p=>p.id===state.projectId);$('sessionName').textContent=saved?.name||'Untitled session';$('sessionState').textContent=saved?'OPEN SESSION · SAVE TO UPDATE':'UNSAVED WORKSPACE';
}
async function saveSession(){
  const name=prompt('Session name',state.projects.find(p=>p.id===state.projectId)?.name||'New '+(state.mode==='thumbnail'?'thumbnail':'image session'));if(!name?.trim())return;
  let input={};try{input=state.provider==='replicate'&&state.model?collectInputs():{};}catch{}
  const referencesOmitted=Object.values(input).some(v=>JSON.stringify(v).includes('data:image/'));
  input=Object.fromEntries(Object.entries(input).filter(([,v])=>!JSON.stringify(v).includes('data:image/')));
  const result=await api('/api/projects',{method:'POST',body:{id:state.projectId,name:name.trim(),project:{version:2,mode:state.mode,assetId:state.selected?.id||null,settings:thumbSettings(),generation:{provider:state.provider,modelId:state.modelId,selectedModel:$('imageModelSelect').value,prompt:$('prompt').value,style:state.style,input,referencesOmitted,options:{size:$('directSize')?.value,quality:$('directQuality')?.value,aspect_ratio:$('directRatio')?.value}}}}});
  state.projectId=result.project.id;const i=state.projects.findIndex(p=>p.id===state.projectId);if(i>=0)state.projects[i]=result.project;else state.projects.push(result.project);updateSessionLabel();toast('Session saved on disk.'+(referencesOmitted?' Reattach generation reference files when reopening.':''));
}
async function openSession(id){
  const p=state.projects.find(p=>p.id===id);if(!p)throw new Error('Saved session no longer exists.');
  if(p.project.assetId){const a=state.assets.find(a=>a.id===p.project.assetId);if(!a)throw new Error('The session image is missing. Its editable settings remain saved.');await selectAsset(a);}else resetCanvas();
  state.projectId=p.id;const g=p.project.generation;
  if(g){document.querySelector('[data-provider="'+g.provider+'"]')?.click();$('prompt').value=g.prompt||'';storageSet('tr-lab-prompt',$('prompt').value);state.style=g.style||'';document.querySelectorAll('[data-style]').forEach(b=>b.classList.toggle('active',b.dataset.style===state.style));$('promptDirection').textContent=state.style?'Added direction: '+state.style:'Your prompt. No hidden embellishment.';
    if(g.provider==='replicate'){state.modelId=g.modelId||state.modelId;if(state.config.keys.REPLICATE_API_TOKEN){try{await loadModel(state.modelId);$('advancedJson').value=JSON.stringify(g.input||{},null,2);}catch(e){toast(e.message,true);}}}
    else{await loadImageModels();if([...$('imageModelSelect').options].some(o=>o.value===g.selectedModel)){$('imageModelSelect').value=g.selectedModel;state.chosen[modelKey(g.provider,'image')]=g.selectedModel;}for(const [field,value] of Object.entries(g.options||{})){const el=$({size:'directSize',quality:'directQuality',aspect_ratio:'directRatio'}[field]);if(el&&value)el.value=value;}}
    if(g.referencesOmitted)toast('Session restored. Reattach reference-image files before generating.');
  }
  setMode(p.project.mode||'thumbnail');applySettings(p.project.settings||{});updateSessionLabel();$('libraryDialog').close();storageSet('tr-lab-work-reset',false);
}
function resetCanvas(){state.image=null;state.selected=null;state.currentJob=null;$('resultImage').removeAttribute('src');$('useThumbnail').disabled=true;$('downloadOriginal').disabled=true;renderStage();renderHistory();}
async function discardSession(){
  const running=state.jobs.some(j=>j.id===state.currentJob&&activeStatus(j.status));
  if(!confirm('Discard current unsaved workspace and start fresh? Saved sessions and images stay in Library.'+(running?' The submitted generation continues and will remain in history; this does not cancel provider work.':'')))return;
  state.projectId=null;resetCanvas();$('prompt').value='';storageSet('tr-lab-prompt','');state.style='';state.fileInputs={};$('advancedJson').value='';document.querySelector('[data-style=""]')?.click();setMode('generate');renderParameters();applySettings(initialThumb);error('');updateSessionLabel();storageSet('tr-lab-work-reset',true);toast('Fresh workspace. Saved work is still in Library.');
}

function setupBrand(){
  $('brandMark').classList.toggle('has-motif',Boolean(state.config.brand?.logo));
  if(state.config.brand?.logo){$('brandMark').innerHTML='<img src="/brand-assets/labs0.svg" alt="">';const favicon=document.querySelector('link[rel="icon"]');if(favicon)favicon.href='/brand-assets/labs0.svg';}
  else $('brandMark').title='Logo asset not found: assets/logos/labs0.svg. Check Connections → Local brand assets.';
  if(state.config.fonts.includes('display'))document.documentElement.classList.add('brand-font-ready');
}
function showBrandStatus(){
  let node=$('brandStatus');if(!node){node=document.createElement('div');node.id='brandStatus';node.className='brand-status soft-note';$('settingsDialog').querySelector('.dialog-actions').before(node);}
  node.innerHTML='<strong>Local brand assets</strong><p>'+esc(state.config.brand?.logoSource?'Motif: '+state.config.brand.logoSource:'labs0.svg not found — add it to the Lab assets/logos folder and restart.')+'</p><p>'+esc(state.config.brand?.fonts?.display?'Title font: '+state.config.brand.fonts.display:'American Captain.ttf/.otf not found — the fallback is currently in use.')+'</p><small>Read-only lookup: poc/assets → Lab/assets → sibling ThirdRailify/assets → Admin/assets. No font files are included in the update.</small>';
}
function closeAccount(){$('accountMenu').hidden=true;$('accountTrigger').setAttribute('aria-expanded','false');}
on('accountTrigger','click',()=>{const open=$('accountMenu').hidden;$('accountMenu').hidden=!open;$('accountTrigger').setAttribute('aria-expanded',String(open));});
on('accountConnections','click',()=>{closeAccount();showSettings();});on('accountLibrary','click',()=>{closeAccount();showLibrary();});on('loginScaffold','click',()=>{closeAccount();$('loginDialog').showModal();});
document.addEventListener('pointerdown',e=>{if(!$('accountWidget').contains(e.target))closeAccount();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('accountMenu').hidden){closeAccount();$('accountTrigger').focus();}});
on('accountMenu','keydown',e=>{const items=[...$('accountMenu').querySelectorAll('[role="menuitem"]')];const at=items.indexOf(document.activeElement);let index;if(e.key==='ArrowDown')index=(at+1)%items.length;if(e.key==='ArrowUp')index=(at-1+items.length)%items.length;if(e.key==='Home')index=0;if(e.key==='End')index=items.length-1;if(index!==undefined){e.preventDefault();items[index].focus();}});
on('accountTrigger','keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();$('accountMenu').hidden=false;$('accountTrigger').setAttribute('aria-expanded','true');const items=$('accountMenu').querySelectorAll('[role="menuitem"]');items[e.key==='ArrowDown'?0:items.length-1].focus();}});

function researchMax(){const collapsed=$('appShell').classList.contains('left-collapsed');return innerWidth>1000?Math.max(280,innerWidth-(collapsed?60:349)-330-5):Math.max(280,innerWidth-56);}
function setResearchWidth(value,persist=true){const max=researchMax(),width=Math.max(280,Math.min(max,Number(value)||330));document.documentElement.style.setProperty('--research',width+'px');$('resizeHandle').setAttribute('aria-valuenow',String(width));$('resizeHandle').setAttribute('aria-valuemax',String(max));if(persist)storageSet('tr-lab-sidebar',width);}
function setupLayout(){
  $('appShell').classList.toggle('left-collapsed',storageGet('tr-lab-left-collapsed',false));updateLeftButton();
  const p=new URL(location.href).searchParams.get('provider')||storageGet('tr-lab-chat-provider','openai');$('chatProvider').value=['openai','xai'].includes(p)?p:'openai';$('chatInput').value=storageGet('tr-lab-chat-draft-'+chatProvider(),'');
  if(state.researchOnly){document.body.classList.add('research-only');$('collapseResearch').hidden=true;$('popoutResearch').hidden=true;$('researchTabLink').hidden=true;$('dockResearch').hidden=false;$('toggleResearch').hidden=true;document.title='Research Desk | Third Railify Lab';researchTab(new URL(location.href).searchParams.get('tab')==='images'?'images':'chat');}
}
function updateLeftButton(){const collapsed=$('appShell').classList.contains('left-collapsed');$('collapseLeft').setAttribute('aria-expanded',String(!collapsed));$('collapseLeft').setAttribute('aria-label',collapsed?'Expand left sidebar':'Collapse left sidebar to icons');$('collapseLeft').title=collapsed?'Expand controls':'Collapse controls to icon rail';}
on('collapseLeft','click',()=>{const collapsed=$('appShell').classList.toggle('left-collapsed');storageSet('tr-lab-left-collapsed',collapsed);updateLeftButton();setResearchWidth(storageGet('tr-lab-sidebar',330),false);});
window.addEventListener('resize',()=>setResearchWidth(storageGet('tr-lab-sidebar',330),false));
const deskChannel=typeof BroadcastChannel==='function'?new BroadcastChannel('thirdrailify-lab-desk-v2'):null;
function publishDesk(value){deskChannel?.postMessage(value);}
let researchWindow=null;
on('popoutResearch','click',()=>{if(researchWindow&&!researchWindow.closed){researchWindow.focus();if(!$('appShell').classList.contains('research-closed'))toggleResearch();return;}const target='/research?tab='+(state.researchTab||'chat')+'&provider='+chatProvider();researchWindow=window.open(target,'thirdrailify-lab-research','popup=yes,width=840,height=960,resizable=yes,scrollbars=yes');if(!researchWindow){toast('Popup blocked. Use the adjacent Open in a new tab button.',true);return;}if(!$('appShell').classList.contains('research-closed'))toggleResearch();researchWindow.focus();});
on('researchTabLink','click',()=>{$('researchTabLink').href='/research?tab='+(state.researchTab||'chat')+'&provider='+chatProvider();});
on('dockResearch','click',()=>{if(state.chatBusy)throw new Error('Finish or stop this response before closing the research window.');publishDesk({type:'dock'});if(window.opener&&!window.opener.closed){window.opener.focus();window.close();}else location.assign('/');});
function useResearchPrompt(text){storageSet('tr-lab-prompt',text);if(state.researchOnly){publishDesk({type:'use-prompt',text});toast('Prompt sent to the main workspace. It will also appear there on next load.');}else{$('prompt').value=text;setMode('generate');toast('Response placed in the prompt. Review before generating.');}}
if(deskChannel)deskChannel.onmessage=({data})=>{
  if(!data||typeof data!=='object')return;
  if(data.type==='dock'&&!state.researchOnly){$('appShell').classList.remove('research-closed');$('toggleResearch').setAttribute('aria-expanded','true');refreshChat();}
  if(data.type==='use-prompt'&&!state.researchOnly&&typeof data.text==='string'){$('prompt').value=data.text;setMode('generate');}
  if(data.type==='chat-busy'&&data.provider===chatProvider()){state.remoteChatBusy=data.busy;$('chatStatus').textContent=data.busy?'RESPONSE IN OTHER VIEW':'LOCAL CONVERSATION';if(!data.busy){$('remoteChatPreview')?.remove();chats[chatProvider()]=storageGet('tr-lab-chat-'+chatProvider(),[]);refreshChat();}}
  if(data.type==='chat-preview'&&data.provider===chatProvider()&&!state.chatBusy){let preview=$('remoteChatPreview');if(!preview){preview=addMessage('assistant','');preview.id='remoteChatPreview';}preview.querySelector('.message-text').textContent=data.text;}
};
window.addEventListener('beforeunload',e=>{if(state.chatBusy){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{if(e.key==='tr-lab-chat-draft-'+chatProvider()&&!state.chatBusy)$('chatInput').value=storageGet(e.key,'');if(e.key==='tr-lab-chat-'+chatProvider()&&!state.chatBusy){chats[chatProvider()]=storageGet(e.key,[]);refreshChat();}if(e.key==='tr-lab-prompt'&&!state.researchOnly)$('prompt').value=storageGet(e.key,'');});
function archiveChat(){const p=chatProvider();if(!chats[p].length)return;const id=crypto.randomUUID();storageSet('tr-lab-chat-saved:'+id,{id,provider:p,model:$('chatModelSelect').value,title:chats[p].find(m=>m.role==='user')?.content.slice(0,75)||'Conversation',updatedAt:new Date().toISOString(),messages:chats[p]});}
function showChatHistory(){
  const entries=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith('tr-lab-chat-saved:')){const entry=storageGet(key,null);if(entry)entries.push(entry);}}
  entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  $('chatHistoryList').innerHTML=entries.length?entries.map(e=>`<div class="project-entry"><button class="project-chip" data-chat-open="${e.id}">${esc(e.title)}<small>${esc(e.provider==='openai'?'GPT':'Grok')} · ${esc(new Date(e.updatedAt).toLocaleString())}</small></button><button class="icon-button danger-text" data-chat-delete="${e.id}" aria-label="Delete conversation ${esc(e.title)}">${icon('trash')}</button></div>`).join(''):'<p class="helper">No archived conversations. New chat saves the current conversation here first.</p>';
  $('chatHistoryList').querySelectorAll('[data-chat-open]').forEach(b=>b.onclick=async()=>{if(state.chatBusy||state.remoteChatBusy)return toast('Finish the active response first.',true);const e=entries.find(e=>e.id===b.dataset.chatOpen);archiveChat();$('chatProvider').value=e.provider;storageSet('tr-lab-chat-provider',e.provider);chats[e.provider]=e.messages;storageSet('tr-lab-chat-'+e.provider,e.messages);refreshChat();await loadChatModels();if([...$('chatModelSelect').options].some(o=>o.value===e.model)){$('chatModelSelect').value=e.model;refreshChatCaption();}$('chatHistoryDialog').close();});
  $('chatHistoryList').querySelectorAll('[data-chat-delete]').forEach(b=>b.onclick=()=>{if(confirm('Delete this saved conversation from this browser?')){localStorage.removeItem('tr-lab-chat-saved:'+b.dataset.chatDelete);showChatHistory();}});
  if(!$('chatHistoryDialog').open)$('chatHistoryDialog').showModal();
}
on('chatHistory','click',showChatHistory);

boot().catch(e=>{$('serverStatus').textContent='Local server unavailable';error('Start START-LAB.cmd and open the local address. '+e.message);});
