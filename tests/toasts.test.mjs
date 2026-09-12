import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const files=Promise.all([
  readFile(new URL('../public/index.html',import.meta.url),'utf8'),
  readFile(new URL('../public/app.js',import.meta.url),'utf8'),
  readFile(new URL('../public/style.css',import.meta.url),'utf8'),
]);

test('Lab transient feedback uses the Admin toast region and accessible cards',async()=>{
  const [html,app]=await files;
  assert.match(html,/class="admin-toast-region"[\s\S]*id="toast"/);
  assert.match(html,/aria-label="Lab notifications"/);
  assert.match(html,/aria-live="polite"/);
  assert.doesNotMatch(html,/class="toast"/);
  assert.match(app,/card\.className=`admin-toast admin-toast--\$\{tone\}`/);
  assert.match(app,/card\.setAttribute\('role','status'\)/);
  assert.match(app,/card\.setAttribute\('aria-atomic','true'\)/);
  assert.match(app,/dismiss\.setAttribute\('aria-label','Dismiss notification'\)/);
});

test('Admin toast lifecycle is preserved without unsafe message markup',async()=>{
  const [,app]=await files;
  assert.match(app,/Math\.min\(15000,Math\.max\(2000,options\.durationMs\|\|5200\)\)/);
  assert.match(app,/while\(region\.children\.length>4\)/);
  assert.match(app,/\.textContent===cleanMessage\)dismissToast\(duplicate\)/);
  assert.match(app,/heading\.textContent=title;body\.textContent=cleanMessage/);
  assert.match(app,/tone==='success'\?'shield':'signal'/);
  assert.match(app,/event\.key==='Escape'/);
  assert.match(app,/dismiss\.addEventListener\('click'/);
  assert.doesNotMatch(app,/admin-toast__[\s\S]{0,300}innerHTML/);
});

test('Admin toast geometry, tones, timer and mobile rules are ported to Lab',async()=>{
  const [,,css]=await files;
  assert.match(css,/\.admin-toast-region\{position:fixed;z-index:240;top:78px;right:clamp\(14px,2\.4vw,34px\)/);
  assert.match(css,/width:min\(430px,calc\(100vw - 28px\)\)/);
  assert.match(css,/\.admin-toast--success\{border-color:rgba\(114,215,165,\.42\)\}/);
  assert.match(css,/\.admin-toast--info\{border-color:rgba\(187,107,217,\.48\)/);
  assert.match(css,/\.admin-toast--warning\{border-color:rgba\(243,201,40,\.5\)\}/);
  assert.match(css,/\.admin-toast__timer\{[\s\S]*animation:admin-toast-timer var\(--admin-toast-duration\) linear forwards/);
  assert.match(css,/@media\(max-width:640px\)\{\.admin-toast-region\{top:76px;right:12px;width:calc\(100vw - 24px\)\}/);
});
