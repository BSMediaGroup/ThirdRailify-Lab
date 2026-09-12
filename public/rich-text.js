const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function inline(text){
  const slots=[];const hold=s=>'\u0000'+(slots.push(s)-1)+'\u0000';
  text=String(text).replace(/\x00/g,'');
  text=text.replace(/`([^`\n]+)`/g,(_,c)=>hold('<code>'+esc(c)+'</code>'));
  text=text.replace(/!?\[([^\]\n]*)\]\(([^\s)]+)\)/g,(all,label,url)=>{const u=safeUrl(url);if(!u)return label;return hold(all.startsWith('!')?`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img class="research-inline-image" src="${esc(u)}" alt="${esc(label)}" loading="lazy" referrerpolicy="no-referrer"></a>`:`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label||u)}</a>`);});
  text=esc(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g,(_,n)=>slots[Number(n)]||'');
}
export function renderMarkdown(text){
  const lines=String(text||'').slice(0,600000).replace(/\r\n/g,'\n').split('\n');let html='',code=null,list=null,paragraph=[];
  const flush=()=>{if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[];}if(list){html+='</'+list+'>';list=null;}};
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(/^\s*```/.test(line)){flush();if(code!==null){html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';code=null;}else code=[];continue;}
    if(code!==null){code.push(line);continue;}
    const heading=line.match(/^(#{1,6})\s+(.+)$/),item=line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/);
    if(!line.trim()){flush();continue;}
    if(heading){flush();const n=Math.min(6,heading[1].length+2);html+=`<h${n}>${inline(heading[2])}</h${n}>`;continue;}
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){flush();html+='<hr>';continue;}
    if(item){if(paragraph.length){html+='<p>'+paragraph.map(inline).join('<br>')+'</p>';paragraph=[];}const type=item[1]?'ul':'ol';if(list!==type){if(list)html+='</'+list+'>';html+='<'+type+'>';list=type;}html+='<li>'+inline(item[2])+'</li>';continue;}
    if(line.startsWith('> ')){flush();html+='<blockquote>'+inline(line.slice(2))+'</blockquote>';continue;}
    if(line.includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')){
      flush();const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());const header=cells(line);html+='<div class="research-table"><table><thead><tr>'+header.map(x=>'<th>'+inline(x)+'</th>').join('')+'</tr></thead><tbody>';i++;
      while(i+1<lines.length&&lines[i+1].includes('|')&&lines[i+1].trim()){i++;html+='<tr>'+cells(lines[i]).map(x=>'<td>'+inline(x)+'</td>').join('')+'</tr>';}
      html+='</tbody></table></div>';continue;
    }
    if(list){html+='</'+list+'>';list=null;}paragraph.push(line);
  }
  flush();if(code!==null)html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';return html;
}
