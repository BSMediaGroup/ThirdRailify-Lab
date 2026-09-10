import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// Read-only verification of release files. Never traverses .env/.data/user assets.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const manifest = JSON.parse(await readFile(path.join(root, 'PACKAGE-MANIFEST.json'), 'utf8'));
  if (manifest.version !== '0.3.0-poc' || !Array.isArray(manifest.files)) throw new Error('Invalid release manifest.');
  const failures = [];
  for (const entry of manifest.files) {
    const name = entry.path;
    if (typeof name !== 'string' || name.includes('\\') || path.isAbsolute(name) || name.split('/').includes('..') || /^(?:\.env$|\.data\/|\.git\/|assets\/)/.test(name)) throw new Error('Unsafe manifest path.');
    try {
      const file = path.join(root, name);
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const bytes = await readFile(file);
      if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) failures.push(name + ': differs from release');
    } catch (error) { failures.push(name + ': ' + error.message); }
  }
  if (failures.length) {
    console.error('Package check found missing or changed release files:\n' + failures.join('\n'));
    process.exitCode = 1;
  } else console.log(`ThirdRailify Lab ${manifest.version}: all ${manifest.files.length} release files verified. Private data was not read or changed.`);
} catch (error) { console.error('Package verification failed: ' + error.message); process.exitCode = 1; }
