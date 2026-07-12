function byId(id){return document.getElementById(id)}
function setText(id,text){const el=byId(id);if(el)el.textContent=text}
function wifiQualityClass(quality){if(quality>=75)return'q4';if(quality>=50)return'q3';if(quality>=25)return'q2';return'q1'}
function makeTag(text,className){const tag=document.createElement('span');tag.className='tag '+(className||'');tag.textContent=text;return tag}
function stateClass(value){const state=String(value||'').toUpperCase();if(state==='ONLINE')return'ok';if(state==='DEGRADED'||state==='RECOVERY')return'bad';return'warn'}
