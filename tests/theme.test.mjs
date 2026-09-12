import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('gold and muted-violet tokens own structural chrome while semantic colors remain distinct', async () => {
  const [theme, style, workspace, login] = await Promise.all([
    read('public/violet.css'), read('public/style.css'), read('public/workspace.css'), read('public/login.css')
  ]);
  assert.match(theme, /--gold:#e8bd55/);
  assert.match(theme, /--violet:#62556e/);
  assert.match(theme, /--green:#78d5a0;--red:#ed9280;--warning:#e2a950;--info:#7fb0d8/);
  assert.match(theme, /\.statusbar\{background:linear-gradient\(90deg,#0d0a10/);
  assert.match(theme, /\.model-code-chip\{background:#17131c/);
  assert.match(theme, /scrollbar-color:#5b4d65 #0a080d/);
  assert.doesNotMatch(style, /#39442b|#65753f|#333e22|#778c49/);
  assert.doesNotMatch(workspace, /scrollbar-color:#5d5429/);
  assert.ok(login.lastIndexOf('.primary-button:disabled{background:linear-gradient(115deg,#2b2630') > login.lastIndexOf('.primary-button:disabled{background:linear-gradient(115deg,#514b29'));
});

test('workspace controls and icon semantics use their intended single locations', async () => {
  const [html, icons, theme] = await Promise.all([read('public/index.html'), read('public/icons.svg'), read('public/violet.css')]);
  assert.equal((html.match(/id="researchVisibility"/g) || []).length, 1);
  const researchHeader = html.slice(html.indexOf('<div class="research-heading">'), html.indexOf('<div class="research-tabs"'));
  assert.doesNotMatch(researchHeader, /researchVisibility|collapseResearch/);
  assert.match(researchHeader, /id="popoutResearch"/);
  assert.match(researchHeader, /id="researchTabLink"/);
  assert.match(html, /id="toggleResearch"[\s\S]{0,500}icons\.svg#workspace-layout/);
  assert.match(html, /id="brandPageButton"[\s\S]{0,500}icons\.svg#palette/);
  assert.match(html, /<small>CREATIVE WORKSHOP<\/small>/);
  assert.doesNotMatch(html, /THE CREATIVE WORKSHOP/);
  assert.match(icons, /id="workspace-layout"/);
  assert.match(icons, /id="panel-right"/);
  assert.match(icons, /id="palette"/);
  const documentTools = html.slice(html.indexOf('<div class="document-tools">'), html.indexOf('</div>', html.indexOf('<div class="document-tools">')));
  assert.ok(documentTools.indexOf('id="railPin"') < documentTools.indexOf('id="researchVisibility"'), 'Research Desk visibility belongs at the far-right end of the document toolbar');
  assert.match(theme, /\.document-tools \.research-visibility\{border-left:1px solid var\(--line\)/);
  assert.doesNotMatch(theme, /\.document-tools \.research-visibility\{border-right:/);
});

test('Connections publishes approved brand marks for every stock provider', async () => {
  const [manifest, api, app] = await Promise.all([read('build-assets.json'), read('lib/api.mjs'), read('public/app.js')]);
  for (const provider of ['pexels', 'pixabay', 'unsplash']) {
    assert.match(manifest, new RegExp(`assets/icons/${provider}-0\\.svg.*brand-assets/${provider}\\.svg`));
    assert.match(api, new RegExp(`${provider}:true`));
    assert.match(app, new RegExp(`'${provider}'`));
  }
});

test('image provider selector uses approved monochrome marks that inherit label color', async () => {
  const [html, controls] = await Promise.all([read('public/index.html'), read('public/control-room.css')]);
  for (const [provider, icon] of [['replicate', 'replicate-0'], ['openai', 'gpt-0'], ['xai', 'grok-0']]) {
    assert.match(html, new RegExp(`data-provider="${provider}"[\\s\\S]{0,220}provider-tab-icon--${provider}`));
    assert.match(controls, new RegExp(`provider-tab-icon--${provider}[\\s\\S]{0,140}${icon}\\.svg`));
  }
  assert.match(controls, /\.provider-tab-icon\s*\{[\s\S]*background: currentColor/);
});
