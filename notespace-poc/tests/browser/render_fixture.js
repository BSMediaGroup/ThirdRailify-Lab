// TEST ONLY. In-memory IndexedDB-like fixture used because this container's managed
// Chromium blocks all URL navigation. Not shipped in or used by the POC.
(function(){
 const stores=new Map();
 function tx(names,mode){const t={pending:0,error:null,aborted:false};let timer;
  function done(){clearTimeout(timer);timer=setTimeout(()=>{if(!t.pending&&!t.aborted)t.oncomplete?.({target:t});},5);}
  t.abort=()=>{t.aborted=true;t.onabort?.();};
  t.objectStore=name=>{if(!stores.has(name))stores.set(name,new Map());const s=stores.get(name);const run=fn=>{const r={};t.pending++;setTimeout(()=>{try{r.result=fn();r.onsuccess?.({target:r});}catch(e){r.error=e;t.error=e;r.onerror?.({target:r});t.onerror?.();}finally{t.pending--;done();}},0);return r;};return{get:key=>run(()=>structuredClone(s.get(key))),getAll:()=>run(()=>[...s.values()].map(v=>structuredClone(v))),put:value=>run(()=>{s.set(value.id,structuredClone(value));return value.id;}),delete:key=>run(()=>s.delete(key))};};done();return t;
 }
 const db={createObjectStore:n=>stores.set(n,new Map()),transaction:tx};
 Object.defineProperty(window,'indexedDB',{value:{open(){const r={};setTimeout(()=>{r.result=db;if(!stores.size)r.onupgradeneeded?.();r.onsuccess?.();},0);return r;}}});
 for(const name of ['localStorage','sessionStorage']){const m=new Map();Object.defineProperty(window,name,{value:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}});}
 // Disable external URLs (fonts and provider calls) without changing browser policy.
 const originalFetch=window.fetch.bind(window);window.fetch=(url,...rest)=>String(url).startsWith('data:')||String(url).startsWith('blob:')?originalFetch(url,...rest):Promise.reject(Error('External requests disabled in offline renderer fixture.'));
 window.__fixtureStores=stores;
})();
