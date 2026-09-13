import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifySchemaField,inputErrors,isLabAssetReference,labAssetReference,normalizeReplicateInputSchema,preparePrompt,workflowFor} from '../public/model-schema.js';

const matrix=JSON.parse(await readFile(new URL('./fixtures/replicate-schema-matrix.json',import.meta.url),'utf8'));
const normalized=new Map(matrix.models.map(model=>[model.id,normalizeReplicateInputSchema({components:{schemas:{...matrix.components.schemas,Input:model.input}}})]));

test('live Replicate schema shapes select controls without image-name heuristics',()=>{
  const bria=normalized.get('bria/expand-image');
  assert.equal(classifySchemaField('image',bria.properties.image).kind,'file');
  assert.deepEqual(classifySchemaField('image_url',bria.properties.image_url),{kind:'string',semantic:'url'});
  assert.equal(classifySchemaField('canvas_size',bria.properties.canvas_size).kind,'number_array');
  assert.equal(classifySchemaField('aspect_ratio',bria.properties.aspect_ratio).kind,'enum');
  assert.equal(workflowFor({schema:bria,promptKey:'prompt'}).promptRequired,false);
  assert.deepEqual(preparePrompt({image:labAssetReference('11111111-1111-4111-8111-111111111111.jpg')},{schema:bria,promptKey:'prompt'},''),{image:labAssetReference('11111111-1111-4111-8111-111111111111.jpg')});
});

test('required, optional, two-image, arrays, editing, prompt-free and text-only shapes normalize generically',()=>{
  const required=normalized.get('lucataco/remove-bg'),optional=normalized.get('black-forest-labs/flux-kontext-pro'),face=normalized.get('cdingram/face-swap'),multi=normalized.get('google/nano-banana'),qwen=normalized.get('qwen/qwen-image-edit-plus'),text=normalized.get('replicate/hello-world');
  assert.equal(classifySchemaField('image',required.properties.image).kind,'file');
  assert.equal(optional.required.includes('input_image'),false);
  assert.deepEqual(workflowFor({schema:face,promptKey:null}).fileKeys,['swap_image','input_image']);
  assert.equal(workflowFor({schema:face,promptKey:null}).hasPrompt,false);
  assert.equal(classifySchemaField('image_input',multi.properties.image_input).kind,'file_array');
  assert.equal(classifySchemaField('image',qwen.properties.image).kind,'file_array');
  assert.deepEqual(workflowFor({schema:text,promptKey:'text'}).fileKeys,[]);
});

test('typed private assets satisfy file fields while malformed URLs, arrays and complex unions fail explicitly',()=>{
  const ref=labAssetReference('11111111-1111-4111-8111-111111111111.png'),required=normalized.get('lucataco/remove-bg'),face=normalized.get('cdingram/face-swap'),multi=normalized.get('qwen/qwen-image-edit-plus');
  assert.equal(isLabAssetReference(ref),true);
  assert.deepEqual(inputErrors({image:ref},required,'submitted'),[]);
  assert.equal(inputErrors({image:'/assets/11111111-1111-4111-8111-111111111111.png'},required,'submitted')[0].code,'invalid_file');
  assert.equal(inputErrors({image:'http://example.com/a.png'},required,'submitted')[0].code,'invalid_file');
  assert.equal(inputErrors({swap_image:ref},face,'submitted')[0].field,'input_image');
  assert.deepEqual(inputErrors({image:[ref],prompt:'edit'},multi,'submitted'),[]);
  const unsupported=normalizeReplicateInputSchema({components:{schemas:{Input:{type:'object',required:['choice'],properties:{choice:{oneOf:[{type:'string'},{type:'object'}]}}}}}});
  assert.equal(classifySchemaField('choice',unsupported.properties.choice).kind,'unsupported');
  assert.equal(inputErrors({},unsupported,'submitted')[0].message,'choice: Input type not yet supported');
});
