import { mkdir, readFile, copyFile, writeFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const stage = path.join(root, '.artifacts', 'build-stage');
const manifest = JSON.parse(await readFile(path.join(root, 'build-assets.json'), 'utf8'));
// All deletion targets are fixed children of this repository. Never walk /poc.
await rm(dist, { recursive: true, force: true });
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
const output = [];
for (const [source, target] of Object.entries(manifest)) {
  for (const name of [source, target]) {
    if (path.isAbsolute(name) || name.split(/[\\/]/).some(p => !p || p === '..' || p.startsWith('.')) || /(?:^|\/)(poc|tests|diagnostics|backups)(?:\/|$)/i.test(name)) throw new Error('Invalid build allowlist path');
  }
  const bytes = await readFile(path.join(root, source));
  if (bytes.length > 25 * 1024 * 1024) throw new Error('Published asset exceeds Pages size limit');
  await mkdir(path.dirname(path.join(stage, target)), { recursive: true });
  await copyFile(path.join(root, source), path.join(stage, target));
  output.push({ source, target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
// The complete stylesheet is assembled in its approved cascade order, so the shell cannot load only some of its visual layers.
const styleSources = ["public/style.css","public/upgrade.css","public/workspace.css","public/final-pass.css"];
const styleBytes = Buffer.from((await Promise.all(styleSources.map(source => readFile(path.join(root, source), 'utf8')))).join('\n'));
await writeFile(path.join(stage, 'lab.css'), styleBytes);
output.push({source:styleSources.join(' + '),target:'lab.css',bytes:styleBytes.length,sha256:createHash('sha256').update(styleBytes).digest('hex')});
await writeFile(path.join(stage, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: [] }));
await writeFile(path.join(stage, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n  Cache-Control: private, no-store\n');
await writeFile(path.join(root, '.artifacts', 'build-manifest.json'), JSON.stringify(output, null, 2));
for(let attempt=0;;attempt++){
  try{await rename(stage,dist);break;}
  catch(error){if(process.platform!=='win32'||!['EPERM','EBUSY'].includes(error.code)||attempt>=9)throw error;await new Promise(resolve=>setTimeout(resolve,200));}
}
console.log(`Built ${output.length} allowlisted assets into dist; all routes invoke Pages Functions.`);
