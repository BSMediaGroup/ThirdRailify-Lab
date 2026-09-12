import path from 'node:path';
import {stat} from 'node:fs/promises';

// Read-only, explicit assets only. Supports repo/poc as well as repo-root installs.
export function brandRoots(root) {
  const parent=path.dirname(root),workspace=path.basename(root).toLowerCase()==='poc'?path.dirname(parent):parent;
  return [...new Set([path.join(root,'assets'),path.join(parent,'assets'),path.join(workspace,'ThirdRailify','assets'),path.join(workspace,'ThirdRailify-Admin','assets')])];
}
export async function discoverBrandAssets(root) {
  const roots=brandRoots(root),fonts={},sources={};
  const specs={display:['fonts/headings/American Captain.ttf','fonts/headings/American Captain.otf'],body:['fonts/body/Blinker-Regular.ttf'],bodybold:['fonts/body/Blinker-SemiBold.ttf'],mono:['fonts/monospace/GeistMono-VariableFont_wght.ttf']};
  async function locate(paths){for(const base of roots)for(const relative of paths){const file=path.join(base,relative);try{if((await stat(file)).isFile())return {file,relative,base};}catch{}}return null;}
  for(const [kind,paths] of Object.entries(specs)){const hit=await locate(paths);if(hit){fonts[kind]=hit.file;sources[kind]=path.relative(root,hit.file).replaceAll('\\','/');}}
  const logo=await locate(['logos/labs0.svg']),providers={},providerSources={};
  for(const [id,relative] of Object.entries({replicate:'icons/replicate-0.svg',openai:'icons/opanai.svg',xai:'icons/grok-0.svg'})){const hit=await locate([relative]);if(hit){providers[id]=hit.file;providerSources[id]=path.relative(root,hit.file).replaceAll('\\','/');}}
  return {providers,providerSources,fonts,logo:logo?.file||null,sources,logoSource:logo?path.relative(root,logo.file).replaceAll('\\','/'):null};
}
