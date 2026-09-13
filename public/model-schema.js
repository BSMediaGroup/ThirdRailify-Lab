// Shared by the browser and server. Provider control types come from JSON Schema,
// never from a model or field name.
export const LAB_ASSET_KIND='lab_asset';
export const DEFAULT_FILE_ARRAY_MAX=8;

const assetIdPattern=/^[a-f0-9-]{36}(?:\.(?:png|jpg|webp|gif))?$/;
const dataUriPattern=/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i;

function refAt(document,reference){
  if(!reference?.startsWith('#/'))return null;
  return reference.slice(2).split('/').reduce((value,key)=>value?.[key.replace(/~1/g,'/').replace(/~0/g,'~')],document);
}

function mergeAllOf(parts){
  const merged={};
  for(const part of parts){
    for(const [key,value] of Object.entries(part||{})){
      if(key==='required')merged.required=[...new Set([...(merged.required||[]),...(value||[])])];
      else if(key==='properties')merged.properties={...(merged.properties||{}),...(value||{})};
      else merged[key]=value;
    }
  }
  return merged;
}

export function resolveReplicateSchema(node,document,depth=0,seen=new Set()){
  if(!node||typeof node!=='object'||depth>16)return {};
  if(node.$ref){
    if(seen.has(node.$ref))return {'x-lab-unsupported':'recursive schema reference'};
    const target=refAt(document,node.$ref);if(!target)return {'x-lab-unsupported':'external schema reference'};
    const next=new Set(seen);next.add(node.$ref);
    return {...resolveReplicateSchema(target,document,depth+1,next),...Object.fromEntries(Object.entries(node).filter(([key])=>key!=='$ref'))};
  }
  if(node.allOf){
    const resolved=mergeAllOf(node.allOf.map(part=>resolveReplicateSchema(part,document,depth+1,new Set(seen))));
    return {...resolved,...Object.fromEntries(Object.entries(node).filter(([key])=>key!=='allOf'))};
  }
  const union=node.anyOf||node.oneOf;
  if(union){
    const concrete=union.filter(part=>part?.type!=='null').map(part=>resolveReplicateSchema(part,document,depth+1,new Set(seen)));
    const nullable=union.some(part=>part?.type==='null');
    if(concrete.length===1)return {...concrete[0],...Object.fromEntries(Object.entries(node).filter(([key])=>!['anyOf','oneOf'].includes(key))),nullable};
    return {...node,'x-lab-unsupported':'multi-branch union'};
  }
  const out={...node};
  if(node.items)out.items=resolveReplicateSchema(node.items,document,depth+1,new Set(seen));
  if(node.properties)out.properties=Object.fromEntries(Object.entries(node.properties).map(([key,value])=>[key,resolveReplicateSchema(value,document,depth+1,new Set(seen))]));
  return out;
}

function semanticHints(field){return `${field?.title||''} ${field?.description||''}`.toLowerCase();}

export function classifySchemaField(_key,field={}){
  if(field['x-lab-unsupported'])return {kind:'unsupported',reason:field['x-lab-unsupported']};
  const hints=semanticHints(field),media=/\b(?:image|photo|photograph|mask|picture)\b/.test(hints)?'image':/\b(?:audio|sound|voice|music)\b/.test(hints)?'audio':/\b(?:video|movie|clip)\b/.test(hints)?'video':'file';
  if(Array.isArray(field.enum))return {kind:'enum'};
  if(field.type==='string'&&field.format==='uri')return {kind:'file',media};
  if(field.type==='array'&&field.items?.type==='string'&&field.items?.format==='uri')return {kind:'file_array',media,maxItems:Math.min(field.maxItems??DEFAULT_FILE_ARRAY_MAX,20),minItems:field.minItems??0};
  if(field.type==='boolean')return {kind:'boolean'};
  if(field.type==='integer')return {kind:'integer'};
  if(field.type==='number')return {kind:'number'};
  if(field.type==='string')return {kind:'string',semantic:field.format==='url'||field.format==='uri-reference'||/\burl\b/.test(hints)?'url':'text'};
  if(field.type==='array'&&['integer','number'].includes(field.items?.type))return {kind:'number_array',itemType:field.items.type};
  if(field.type==='object')return {kind:'object'};
  return {kind:'unsupported',reason:'schema construct'};
}

export function normalizeReplicateInputSchema(document){
  const base=resolveReplicateSchema(document?.components?.schemas?.Input,document);
  const properties=Object.fromEntries(Object.entries(base.properties||{}).map(([key,value],index)=>{
    const field=resolveReplicateSchema(value,document),classification=classifySchemaField(key,field);
    return [key,{...field,'x-lab-order':field['x-order']??index,'x-lab-kind':classification.kind,'x-lab-media':classification.media||null,'x-lab-semantic':classification.semantic||null,...(classification.reason?{'x-lab-unsupported-reason':classification.reason}:{})}];
  }));
  return {...base,properties,required:Array.isArray(base.required)?base.required:[]};
}

export function isLabAssetReference(value){
  return Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&value.kind===LAB_ASSET_KIND&&assetIdPattern.test(value.assetId||'')&&Object.keys(value).every(key=>['kind','assetId'].includes(key)));
}

export function labAssetReference(assetId){
  if(!assetIdPattern.test(String(assetId||'')))throw new Error('Invalid private Lab asset.');
  return {kind:LAB_ASSET_KIND,assetId};
}

export function fileArrayLimit(field={}){return Math.min(field.maxItems??DEFAULT_FILE_ARRAY_MAX,20);}

export function isFileField(key,field={}){return ['file','file_array'].includes(classifySchemaField(key,field).kind);}
export function isImageField(key,field={}){return isFileField(key,field);}

export function workflowFor(model) {
  const schema=model?.schema||{},props=schema.properties||{};
  const promptKey=model?.promptKey&&props[model.promptKey]?model.promptKey:null;
  const fileKeys=Object.entries(props).filter(([key,field])=>isFileField(key,field)).sort((a,b)=>(a[1]['x-lab-order']??a[1]['x-order']??99)-(b[1]['x-lab-order']??b[1]['x-order']??99)).map(([key])=>key);
  const primaryFileKey=fileKeys.find(key=>classifySchemaField(key,props[key]).media==='image')||fileKeys[0]||null;
  return {promptKey,hasPrompt:Boolean(promptKey),promptRequired:Boolean(promptKey&&(schema.required||[]).includes(promptKey)),fileKeys,imageKeys:fileKeys,primaryFileKey};
}

function missingValue(value){return value===undefined||value===null||value===''||Array.isArray(value)&&!value.length;}
export function missingInputs(input,schema={}) {return (schema.required||[]).filter(key=>missingValue(input?.[key]));}

export function safeHttpsUrl(value){
  if(typeof value!=='string'||value.length>2048)return '';
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}

export function safeImageUrl(value) {
  if(isLabAssetReference(value))return '';
  if(typeof value!=='string')return '';
  if(/^\/assets\/[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(value))return value;
  if(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(value))return value;
  return safeHttpsUrl(value);
}

function itemError(key,message,code='invalid'){return {field:key,code,message:`${key}: ${message}`};}
function validProviderDataUri(value){const match=typeof value==='string'&&value.match(dataUriPattern);return Boolean(match&&match[2].length<=Math.ceil(256*1024*4/3)+16);}

export function inputErrors(input,schema={},mode='submitted'){
  const errors=[];
  if(!input||Array.isArray(input)||typeof input!=='object')return [itemError('$','model inputs must be an object','invalid_object')];
  const props=schema.properties||{};
  for(const key of schema.required||[]){
    const field=props[key],kind=classifySchemaField(key,field).kind;
    if(kind==='unsupported'){errors.push(itemError(key,'Input type not yet supported','unsupported_input'));continue;}
    if(missingValue(input[key]))errors.push(itemError(key,'is required','missing'));
  }
  for(const [key,value] of Object.entries(input)){
    if(['__proto__','constructor','prototype'].includes(key)){errors.push(itemError(key,'invalid field','invalid_field'));continue;}
    const field=props[key];if(!field){errors.push(itemError(key,'is not part of the current model schema','unknown_field'));continue;}
    if(value===null){if(!field.nullable)errors.push(itemError(key,'cannot be null'));continue;}
    const classification=classifySchemaField(key,field),kind=classification.kind;
    if(kind==='unsupported'){errors.push(itemError(key,'Input type not yet supported','unsupported_input'));continue;}
    if(kind==='enum'&&!field.enum.includes(value))errors.push(itemError(key,'must use one of the listed options'));
    if(kind==='boolean'&&typeof value!=='boolean')errors.push(itemError(key,'must be true or false'));
    if(kind==='integer'&&!Number.isSafeInteger(value))errors.push(itemError(key,'must be a whole number'));
    if(kind==='number'&&(typeof value!=='number'||!Number.isFinite(value)))errors.push(itemError(key,'must be a number'));
    if(kind==='string'){
      if(typeof value!=='string')errors.push(itemError(key,'must be text'));
      else if(classification.semantic==='url'&&!safeHttpsUrl(value))errors.push(itemError(key,'must be an HTTPS URL without embedded credentials','invalid_url'));
    }
    const checkFile=item=>{
      if(mode==='submitted'&&isLabAssetReference(item))return;
      if(typeof item==='string'&&safeHttpsUrl(item))return;
      if(mode==='provider'&&validProviderDataUri(item))return;
      errors.push(itemError(key,mode==='submitted'?'choose an uploaded private asset or enter an HTTPS URL':'provider file transport could not be prepared','invalid_file'));
    };
    if(kind==='file')checkFile(value);
    if(kind==='file_array'){
      if(!Array.isArray(value))errors.push(itemError(key,'must be an ordered file array'));
      else{
        if(value.length<(field.minItems??0))errors.push(itemError(key,`needs at least ${field.minItems} items`,'min_items'));
        if(value.length>fileArrayLimit(field))errors.push(itemError(key,`accepts at most ${fileArrayLimit(field)} items`,'max_items'));
        value.forEach(checkFile);
      }
    }
    if(kind==='number_array'){
      if(!Array.isArray(value))errors.push(itemError(key,'must be an array of numbers'));
      else for(const item of value)if(classification.itemType==='integer'?!Number.isSafeInteger(item):typeof item!=='number'||!Number.isFinite(item))errors.push(itemError(key,classification.itemType==='integer'?'must contain whole numbers':'must contain numbers'));
    }
    if(kind==='object'&&(typeof value!=='object'||Array.isArray(value)))errors.push(itemError(key,'must be a JSON object'));
    if(typeof value==='number'&&field.minimum!==undefined&&value<field.minimum)errors.push(itemError(key,`minimum is ${field.minimum}`));
    if(typeof value==='number'&&field.maximum!==undefined&&value>field.maximum)errors.push(itemError(key,`maximum is ${field.maximum}`));
    if(typeof value==='string'&&field.maxLength!==undefined&&value.length>field.maxLength)errors.push(itemError(key,`maximum length is ${field.maxLength}`));
    if(typeof value==='string'&&field.minLength!==undefined&&value.length<field.minLength)errors.push(itemError(key,`minimum length is ${field.minLength}`));
  }
  return errors;
}

export function summarizeInputTypes(input={}){
  const describe=value=>{
    if(Array.isArray(value))return {type:'array',length:value.length,items:[...new Set(value.map(item=>describe(item).type))]};
    if(isLabAssetReference(value))return {type:'lab_asset'};
    if(typeof value==='string'&&value.startsWith('data:'))return {type:'data_uri'};
    if(typeof value==='string'&&safeHttpsUrl(value))return {type:'https_url'};
    if(value===null)return {type:'null'};
    return {type:typeof value};
  };
  return Object.fromEntries(Object.entries(input).map(([key,value])=>[key,describe(value)]));
}

export function preparePrompt(input,model,prompt) {
  const out={...input},workflow=workflowFor(model);
  if(workflow.promptKey) {
    if(typeof prompt==='string'&&prompt.trim())out[workflow.promptKey]=prompt.trim();
    else if(out[workflow.promptKey]===undefined&&model.schema.properties[workflow.promptKey].default!==undefined)out[workflow.promptKey]=model.schema.properties[workflow.promptKey].default;
  }
  return out;
}
