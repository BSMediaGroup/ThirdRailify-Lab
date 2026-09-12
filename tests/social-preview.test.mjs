import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const cardPath = 'social/lab-social-card-v1.png';
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
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  for (const html of [app, login]) {
    assert.match(meta(html, 'name', 'description'), /private AI creative workspace/i);
    assert.equal(meta(html, 'property', 'og:type'), 'website');
    assert.equal(meta(html, 'property', 'og:title'), 'Third Railify Lab — Creative Workshop');
    assert.match(meta(html, 'property', 'og:description'), /turn sparks into standout visuals/);
    assert.equal(meta(html, 'property', 'og:image'), cardUrl);
    assert.equal(meta(html, 'property', 'og:image:secure_url'), cardUrl);
    assert.equal(meta(html, 'property', 'og:image:type'), 'image/png');
    assert.equal(meta(html, 'property', 'og:image:width'), '1200');
    assert.equal(meta(html, 'property', 'og:image:height'), '630');
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
    assert.equal(meta(html, 'name', 'twitter:image'), cardUrl);
    const canonical = (html.match(/<link\b[^>]*>/g) || []).find(value => value.includes('rel="canonical"'));
    assert.match(canonical || '', /href="https:\/\/lab\.thirdrailify\.com\/"/);
  }
});
