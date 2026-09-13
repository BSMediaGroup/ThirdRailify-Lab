import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {authorizedProjectAsset,prepareReplicateInputs,serveReplicateAsset,validateReplicateInputReferences} from '../lib/replicate-inputs.mjs';
import {storeFile} from '../lib/storage.mjs';
import {labAssetReference,normalizeReplicateInputSchema} from '../public/model-schema.js';

const ownerA='account-a',ownerB='account-b',projectA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',projectB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',jobId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const schema=normalizeReplicateInputSchema({components:{schemas:{Input:{type:'object',required:['image'],properties:{image:{type:'string',format:'uri',title:'Image',description:'Image file'}}}}}});

async function migrate(db,url){let statement='';for(const line of (await readFile(url,'utf8')).replace(/^--.*$/gm,'').split(/\r?\n/)){statement+=line+'\n';if(line.trim().endsWith(';')){await db.prepare(statement).run();statement='';}}}

test('private Lab assets authorize per account/project and resolve to bounded data or signed delivery',async t=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-12',compatibilityFlags:['nodejs_compat'],d1Databases:['LAB_DB'],r2Buckets:['LAB_FILES'],bindings:{LAB_ORIGIN:'https://lab.thirdrailify.com',LAB_ASSET_DELIVERY_SIGNING_SECRET:Buffer.alloc(32,9).toString('base64url')}});t.after(()=>mf.dispose());const env=await mf.getBindings();
  await migrate(env.LAB_DB,new URL('../migrations/0001_lab.sql',import.meta.url));
  for(const [id,owner] of [[projectA,ownerA],[projectB,ownerA]])await env.LAB_DB.prepare("INSERT INTO projects(id,owner_id,name,body,revision,write_token,created_at,updated_at) VALUES(?,?,?,'{}',1,'','2026-09-13','2026-09-13')").bind(id,owner,id).run();
  const small=await storeFile(env,ownerA,projectA,png,{source:'model-input',title:'small.png'}),large=await storeFile(env,ownerA,projectA,Buffer.concat([png,Buffer.alloc(300*1024)]),{source:'model-input',title:'large.png'});
  assert.deepEqual(await validateReplicateInputReferences(env,ownerA,projectA,schema,{image:labAssetReference(small.id)}),[small.id]);
  await assert.rejects(authorizedProjectAsset(env,ownerB,projectA,small.id,{field:'image',media:'image'}),error=>error.code==='asset_unauthorized');
  await assert.rejects(authorizedProjectAsset(env,ownerA,projectB,small.id,{field:'image',media:'image'}),error=>error.code==='asset_project_unauthorized');
  await env.LAB_DB.prepare('INSERT INTO project_files(project_id,file_id) VALUES(?,?)').bind(projectB,small.id).run();
  await assert.doesNotReject(authorizedProjectAsset(env,ownerA,projectB,small.id,{field:'image',media:'image'}));

  const makeSnapshot=asset=>({input:{image:labAssetReference(asset.id)},validatedModel:{schema}});
  await env.LAB_DB.prepare(`INSERT INTO jobs(id,owner_id,project_id,request_id,input_hash,snapshot,provider,webhook_nonce,status,phase,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'nonce','queued','Queued','2026-09-13','2026-09-13')`).bind(jobId,ownerA,projectA,'request-fixture-0001','hash',JSON.stringify(makeSnapshot(large)),'replicate').run();
  await env.LAB_DB.prepare('INSERT INTO job_files(job_id,file_id) VALUES(?,?)').bind(jobId,large.id).run();
  const preparedLarge=await prepareReplicateInputs(env,{id:jobId,owner_id:ownerA,project_id:projectA},makeSnapshot(large));
  assert.equal(preparedLarge.types.image.type,'https_url');assert.match(preparedLarge.input.image,/^https:\/\/lab\.thirdrailify\.com\/api\/provider-files\//);
  const refreshedLarge=await prepareReplicateInputs(env,{id:jobId,owner_id:ownerA,project_id:projectA},makeSnapshot(large),{nowSeconds:preparedLarge.expiresAt+1});
  assert.notEqual(refreshedLarge.input.image,preparedLarge.input.image);assert.ok(refreshedLarge.expiresAt>preparedLarge.expiresAt);
  const delivered=await serveReplicateAsset(env,new Request(preparedLarge.input.image));assert.equal(delivered.status,200);assert.equal(delivered.headers.get('content-type'),'image/png');assert.equal(delivered.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),Buffer.concat([png,Buffer.alloc(300*1024)]));
  const forged=new URL(preparedLarge.input.image);forged.searchParams.set('signature',forged.searchParams.get('signature').slice(0,-1)+'A');await assert.rejects(serveReplicateAsset(env,new Request(forged)),error=>error.code==='asset_grant_invalid');
  const expired=new URL(preparedLarge.input.image);expired.searchParams.set('expires',String(Math.floor(Date.now()/1000)-1));await assert.rejects(serveReplicateAsset(env,new Request(expired)),error=>error.code==='asset_grant_expired');
  const otherPath=new URL(preparedLarge.input.image);otherPath.pathname='/api/provider-files/'+small.id;await assert.rejects(serveReplicateAsset(env,new Request(otherPath)),error=>error.code==='asset_grant_invalid');

  await env.LAB_DB.prepare('INSERT INTO job_files(job_id,file_id) VALUES(?,?)').bind(jobId,small.id).run();
  const preparedSmall=await prepareReplicateInputs(env,{id:jobId,owner_id:ownerA,project_id:projectA},makeSnapshot(small));assert.equal(preparedSmall.types.image.type,'data_uri');assert.match(preparedSmall.input.image,/^data:image\/png;base64,/);
  await env.LAB_DB.prepare("UPDATE files SET status='deleted' WHERE id=?").bind(small.id).run();await assert.rejects(authorizedProjectAsset(env,ownerA,projectA,small.id,{field:'image',media:'image'}),error=>error.code==='asset_missing');
});
