import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

test('featured catalogue models hydrate through the canonical model endpoint',async()=>{
  const app=await read('public/app.js');
  assert.match(app,/state\.catalog\.map\(model=>api\('\/api\/model\?id='/);
  assert.match(app,/state\.featuredModels=state\.catalog\.map/);
  assert.match(app,/void hydrateFeaturedModels\(\)/);
  assert.doesNotMatch(app,/replicate\.delivery\/.*flux-schnell/i,'cover URLs are never hardcoded');
});

test('model explorer and detail media are square, cover-filled, and theme-safe',async()=>{
  const css=await read('public/control-room.css');
  assert.match(css,/\.model-result-visual,\.model-info-visual[^}]*aspect-ratio: 1/);
  assert.match(css,/\.model-result \.model-cover,\.model-info-panel \.model-cover[^}]*object-fit: cover/);
  assert.match(css,/\.model-result \.model-cover-empty,\.model-info-panel \.model-cover-empty[^}]*radial-gradient[^}]*#7f4ca066/);
  assert.doesNotMatch(css,/\.model-result \.model-cover-empty,\.model-info-panel \.model-cover-empty[^}]*#35331b/);
});
