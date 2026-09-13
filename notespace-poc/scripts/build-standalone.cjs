'use strict';
// Only bundles this POC's original source. No third-party code, fonts or remote fetches.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),pub=path.join(root,'public');
let html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="/styles.css">',()=>'<style>\n'+fs.readFileSync(path.join(pub,'styles.css'),'utf8')+'\n</style>');
for(const name of ['model.js','seed.js','app.js']){
 const script=fs.readFileSync(path.join(pub,name),'utf8').replace(/<\/script/gi,'<\\/script');
 html=html.replace(`<script src="/${name}"></script>`,()=>'<script>\n'+script+'\n</script>');
}
if(/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html))throw Error('Unbundled application dependency found.');
fs.writeFileSync(path.join(root,'OPEN-NOTESPACE.html'),html,'utf8');
console.log('Created OPEN-NOTESPACE.html ('+Buffer.byteLength(html)+' bytes). No font files included.');
