const response=await fetch('/api/auth/session',{cache:'no-store',redirect:'error'});
export const labSession=await response.json();
if(!response.ok||!labSession.authenticated||!labSession.workshop?.allowed){location.replace('/login.html');throw new Error('Workshop access is required.');}
export const storagePrefix='lab:'+labSession.account.id+':';
const storage=window.localStorage;
const keys=()=>Object.keys(storage).filter(k=>k.startsWith(storagePrefix));
export const scopedStorage={getItem:k=>storage.getItem(storagePrefix+k),setItem:(k,v)=>storage.setItem(storagePrefix+k,v),removeItem:k=>storage.removeItem(storagePrefix+k),key:i=>keys()[i]?.slice(storagePrefix.length)||null,get length(){return keys().length;}};
const accountChannel=new BroadcastChannel('lab-account:'+labSession.account.id);
accountChannel.onmessage=event=>{if(event.data==='signed-out')location.replace('/login.html');};
export async function signOut(){const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':labSession.csrfToken},body:'{}'});if(!r.ok)throw new Error('Sign out could not be completed.');for(const key of keys())storage.removeItem(key);accountChannel.postMessage('signed-out');location.replace('/login.html');}
export function updateAccountWidget(){
  const root=document.getElementById('accountWidget');if(!root)return;
  const account=labSession.account,name=account.displayName||'Third Railify account';
  const role=account.adminLevel==='master'?'Master Admin':account.adminLevel==='full'?'Full Admin':'Regular account';
  root.querySelectorAll('.account-identity-name > span').forEach(e=>e.textContent=name);
  root.querySelector('.admin-account__trigger').setAttribute('aria-label',name+' account menu');
  root.querySelector('.admin-account__copy small').textContent=role;
  root.querySelector('.admin-account__identity > div > span').textContent='Third Railify account';
  root.querySelectorAll('.account-access-badge').forEach(e=>{e.setAttribute('aria-label',role);e.hidden=account.adminLevel==='none';});
  root.querySelectorAll('dd').forEach((e,i)=>e.textContent=[name,'Private Workshop',labSession.workshop.source||'Approved','Your account'][i]||'');
  root.querySelectorAll('.admin-avatar').forEach(avatar=>{avatar.textContent=name.slice(0,2).toUpperCase();let url;try{url=new URL(account.avatarUrl);if(url.protocol!=='https:')return;}catch{return;}const img=document.createElement('img');img.src=url.href;img.alt='';img.referrerPolicy='no-referrer';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';avatar.replaceChildren(img);});
}
