import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const cardPath = 'backgrounds/labseo.webp';
const cardUrl = `https://lab.thirdrailify.com/${cardPath}`;
const meta = (html, attribute, key) => {
  const tag = (html.match(/<meta\b[^>]*>/g) || []).find(value => value.includes(`${attribute}="${key}"`));
  return tag?.match(/content="([^"]*)"/)?.[1] || '';
};

test('crawler-facing Lab pages expose a complete large-image social card', async () => {
  const [app, login, manifest, image] = await Promise.all([
    readFile(new URL('public/index.html', root), 'utf8'),
    readFile(new URL('public/login.html', root), 'utf8'),
    readFile(new URL('build-assets.json', root), 'utf8').then(JSON.parse),
    readFile(new URL(`assets/${cardPath}`, root))
  ]);
  assert.equal(manifest[`assets/${cardPath}`], cardPath);
  assert.equal(image.toString('ascii', 0, 4), 'RIFF');
  assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  assert.equal(image.toString('ascii', 12, 16), 'VP8 ');
  assert.equal(image.readUInt16LE(26) & 0x3fff, 1733);
  assert.equal(image.readUInt16LE(28) & 0x3fff, 907);
  for (const html of [app, login]) {
    assert.match(meta(html, 'name', 'description'), /private AI creative workspace/i);
    assert.equal(meta(html, 'property', 'og:type'), 'website');
    assert.equal(meta(html, 'property', 'og:title'), 'Third Railify Lab — Creative Workshop');
    assert.match(meta(html, 'property', 'og:description'), /turn sparks into standout visuals/);
    assert.equal(meta(html, 'property', 'og:image'), cardUrl);
    assert.equal(meta(html, 'property', 'og:image:secure_url'), cardUrl);
    assert.equal(meta(html, 'property', 'og:image:type'), 'image/webp');
    assert.equal(meta(html, 'property', 'og:image:width'), '1733');
    assert.equal(meta(html, 'property', 'og:image:height'), '907');
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
    assert.equal(meta(html, 'name', 'twitter:image'), cardUrl);
    const canonical = (html.match(/<link\b[^>]*>/g) || []).find(value => value.includes('rel="canonical"'));
    assert.match(canonical || '', /href="https:\/\/lab\.thirdrailify\.com\/"/);
  }
});
