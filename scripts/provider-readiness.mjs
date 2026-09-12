import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from '../lib/core.mjs';
import { Providers } from '../lib/providers.mjs';
import { ModelCatalog } from '../lib/models.mjs';
const env=parseEnv(await readFile(new URL('../poc/.env',import.meta.url),'utf8'));
const provider=new Providers(()=>env),catalog=new ModelCatalog(provider),out={};
for(const p of ['replicate','openai','xai']){
  try {const test=await provider.test(p);out[p]={authenticated:test.ok};if(p!=='replicate'){out[p].image=(await catalog.list(p,'image')).items;out[p].chat=(await catalog.list(p,'chat')).items;}else{const model=await provider.model('black-forest-labs/flux-schnell');out[p].baseline={id:model.id,version:model.version,schema:model.schema};out[p].promptFreeCandidates=await provider.search('background removal');}}
  catch(e){out[p]={error:e.code,status:e.status};}
}
await writeFile(new URL('../.artifacts/provider-readiness.json',import.meta.url),JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
