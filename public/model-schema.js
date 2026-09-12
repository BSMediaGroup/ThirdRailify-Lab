// Shared by the browser and local server. Do not infer a prompt from a model name.
export function workflowFor(model) {
  const schema=model?.schema||{}, props=schema.properties||{};
  const promptKey=model?.promptKey && props[model.promptKey] ? model.promptKey : null;
  return {promptKey,hasPrompt:Boolean(promptKey),promptRequired:Boolean(promptKey&&(schema.required||[]).includes(promptKey)),imageKeys:Object.entries(props).filter(([k,p])=>isImageField(k,p)).map(([k])=>k)};
}
export function isImageField(key,p={}) {
  if(p.type==='array')return p.items?.format==='uri' || /image|mask|photo|reference/.test(key);
  return p.format==='uri' && !/audio|video|file_url|weights/.test(key) || p.type==='string' && /^(image|input_image|swap_image|mask|reference_image|image_url)$/.test(key);
}
export function missingInputs(input,schema={}) {
  return (schema.required||[]).filter(k=>input[k]===undefined||input[k]===null||input[k]===''||Array.isArray(input[k])&&!input[k].length);
}
export function safeImageUrl(value) {
  if(typeof value!=='string')return '';
  if(/^\/assets\/[a-f0-9-]+\.(png|jpg|webp)$/.test(value))return value;
  if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value))return value;
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}
}
export function preparePrompt(input,model,prompt) {
  const out={...input}, w=workflowFor(model);
  if(w.promptKey) {
    if(typeof prompt==='string'&&prompt.trim())out[w.promptKey]=prompt.trim();
    else if(out[w.promptKey]===undefined && model.schema.properties[w.promptKey].default!==undefined)out[w.promptKey]=model.schema.properties[w.promptKey].default;
  }
  return out;
}
