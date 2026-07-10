// Shared with ESP32 firmware. Run `npm run sync` after editing.

function byId(id){return document.getElementById(id)}
function setText(id,text){const el=byId(id);if(el)el.textContent=text}
function wifiQualityClass(quality){if(quality>=75)return'q4';if(quality>=50)return'q3';if(quality>=25)return'q2';return'q1'}
function makeTag(text,className){const tag=document.createElement('span');tag.className='tag '+(className||'');tag.textContent=text;return tag}
function stateClass(value){const state=String(value||'').toUpperCase();if(state==='ONLINE')return'ok';if(state==='DEGRADED'||state==='RECOVERY')return'bad';return'warn'}

function openDashboardPage(pageId,updateHash){
  const target=byId(pageId)||byId('overview');
  if(!target)return;
  document.querySelectorAll('.dashboard-page').forEach(page=>page.classList.toggle('is-active',page===target));
  document.querySelectorAll('[data-page-target]').forEach(item=>{
    const active=item.getAttribute('data-page-target')===target.id;
    item.classList.toggle('is-active',active);
    if(item.classList.contains('portal-nav-item'))item.setAttribute('aria-current',active?'page':'false');
  });
  const nav=document.querySelector('.portal-nav-item[data-page-target="'+target.id+'"]');
  setText('portalPageTitle',nav?.getAttribute('data-page-title')||target.getAttribute('data-page-title')||'ESP32 Dashboard');
  setText('portalPageSubtitle',nav?.getAttribute('data-page-subtitle')||target.getAttribute('data-page-subtitle')||'Local Device Console');
  document.body.classList.remove('nav-open');
  if(updateHash!==false&&location.hash!=='#'+target.id)history.replaceState(null,'','#'+target.id);
  window.scrollTo({top:0,behavior:'smooth'});
}

function initDashboardNavigation(){
  document.querySelectorAll('[data-page-target]').forEach(item=>item.addEventListener('click',event=>{
    event.preventDefault();
    openDashboardPage(item.getAttribute('data-page-target'),true);
  }));
  byId('portalMenuButton')?.addEventListener('click',()=>document.body.classList.toggle('nav-open'));
  byId('portalOverlay')?.addEventListener('click',()=>document.body.classList.remove('nav-open'));
  window.addEventListener('hashchange',()=>openDashboardPage(location.hash.replace('#','')||'overview',false));
  openDashboardPage(location.hash.replace('#','')||'overview',false);
}

function selectWifi(ssid,secure,button){const input=byId('wifiSsid');const password=byId('wifiPassword');if(input)input.value=ssid;document.querySelectorAll('.network').forEach(el=>el.classList.remove('selected'));if(button)button.classList.add('selected');setText('selectedWifi','เลือกแล้ว: '+ssid+(secure?' · ต้องใช้รหัสผ่าน':' · เครือข่าย Open'));if(password)password.focus()}
async function scanWifi(){const button=byId('scanButton');const list=byId('networkList');if(!list)return;if(button)button.disabled=true;setText('scanStatus','กำลังสแกน Wi-Fi รอบตัว ESP32...');list.innerHTML='';try{const response=await fetch('/wifi-scan'+(window.location.search||''),{cache:'no-store'});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||'Scan failed');if(!data.networks||data.networks.length===0){list.innerHTML='<div class="empty">ไม่พบ Wi-Fi ลองกดสแกนใหม่ หรือกรอกชื่อ SSID เอง</div>';setText('scanStatus','ไม่พบเครือข่าย');return}data.networks.forEach(item=>{const row=document.createElement('button');row.type='button';row.className='network';row.addEventListener('click',()=>selectWifi(item.ssid,item.secure,row));const signal=document.createElement('span');signal.className='signal '+wifiQualityClass(item.quality);for(let i=0;i<4;i++)signal.appendChild(document.createElement('i'));const main=document.createElement('span');const name=document.createElement('span');name.className='network-name';name.textContent=item.ssid;const meta=document.createElement('span');meta.className='network-meta';meta.appendChild(makeTag(item.secure?'มีรหัสผ่าน':'Open',''));if(item.current)meta.appendChild(makeTag('กำลังใช้','current'));if(item.remembered)meta.appendChild(makeTag('จำไว้แล้ว','saved'));main.appendChild(name);main.appendChild(meta);const rssi=document.createElement('span');rssi.className='rssi';rssi.textContent=item.rssi+' dBm';row.appendChild(signal);row.appendChild(main);row.appendChild(rssi);list.appendChild(row)});setText('scanStatus','พบ '+data.networks.length+' เครือข่าย · เลือกชื่อที่ต้องการ')}catch(error){list.innerHTML='<div class="empty">สแกนไม่สำเร็จ กรุณาลองอีกครั้ง</div>';setText('scanStatus',error.message||'Scan failed')}finally{if(button)button.disabled=false}}
function togglePassword(){const input=byId('wifiPassword');const button=byId('passwordToggle');if(!input||!button)return;const visible=input.type==='text';input.type=visible?'password':'text';button.textContent=visible?'แสดง':'ซ่อน'}
function confirmWifiChange(){const ssid=(byId('wifiSsid')?.value||'').trim();if(!ssid){alert('กรุณาเลือกหรือกรอกชื่อ Wi-Fi');return false}return confirm('เปลี่ยน Wi-Fi เป็น "'+ssid+'" หรือไม่?\n\nระบบจะทดสอบหลัง Restart และย้อนกลับ Wi-Fi เดิมอัตโนมัติหากเชื่อมไม่สำเร็จ')}
function hasSensorNumber(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))}
function applySensorValues(data){const available=data.sensorReadingAvailable!==false&&hasSensorNumber(data.temperature)&&hasSensorNumber(data.humidity);setText('sensorTemperature',available?Number(data.temperature).toFixed(1):'--');setText('sensorHumidity',available?Number(data.humidity).toFixed(1):'--');if(data.lastSensorError){setText('sensorLiveStatus','ยังอ่านค่า Sensor ไม่สำเร็จ');return}const age=Number(data.sensorReadingAgeSeconds);if(available&&Number.isFinite(age)){setText('sensorLiveStatus','ค่าล่าสุดจาก Sensor · '+Math.max(0,Math.round(age))+' วินาทีที่แล้ว')}else{setText('sensorLiveStatus',available?'ค่าล่าสุดจาก Sensor · อัปเดตอัตโนมัติ':'กำลังรอค่าจาก Sensor')}}
function applyPortalStatus(data){
  applySensorValues(data);
  const httpStatus=Number(data.lastHttpStatus||0);
  const backendOk=httpStatus>=200&&httpStatus<300;
  const wifiConnected=data.wifiConnected===true;
  setText('sidebarDeviceCode',data.deviceCode||'ยังไม่ได้ตั้ง Device');
  setText('sidebarDeviceIp',data.ip||'ยังไม่มี IP');
  setText('statusWifi',data.wifiSsid||(wifiConnected?'Connected':'Disconnected'));
  setText('statusIp',data.ip||'—');
  setText('statusSignal',Number.isFinite(Number(data.rssi))?String(data.rssi)+' dBm':'—');
  setText('statusDeviceCode',data.deviceCode||'ยังไม่ได้ตั้ง');
  setText('statusBackend',backendOk?'ส่งสำเร็จ':(data.lastSendError||data.lastSendStatus||'กำลังเชื่อมต่อ'));
  setText('statusLastSend',httpStatus?'HTTP '+httpStatus:(data.lastSendStatus||'ยังไม่เคยส่ง'));
  setText('statusUptime',data.uptime||'—');
  setText('currentWifi',data.wifiSsid||'ยังไม่ได้ตั้ง');
  setText('currentIp',data.ip||'—');
  if(data.rememberedWifiProfiles!==undefined)setText('rememberedWifi',String(data.rememberedWifiProfiles)+' networks');
  setText('healthWifi',wifiConnected?'Connected':'Disconnected');
  setText('healthBackend',backendOk?'Connected':(data.lastSendError||'Waiting'));
  setText('healthSensor',data.sensorReadingAvailable?'Available':'Waiting');
  setText('healthTls',data.tlsCaSource||'—');
  ['healthWifi','healthBackend','healthSensor','healthTls'].forEach(id=>{const row=byId(id)?.closest('.health-row');const marker=row?.querySelector('.health-dot');if(!marker)return;let cls='warn';if(id==='healthWifi')cls=wifiConnected?'ok':'bad';if(id==='healthBackend')cls=backendOk?'ok':'bad';if(id==='healthSensor')cls=data.sensorReadingAvailable?'ok':'warn';if(id==='healthTls')cls=data.tlsCaSource?'ok':'warn';marker.className='health-dot '+cls});
  const dot=byId('sidebarStateDot');if(dot)dot.className='sidebar-status-dot '+stateClass(data.state);
  ['headerStateBadge','appStateBadge'].forEach(id=>{const badge=byId(id);if(badge){badge.className='badge '+stateClass(data.state);badge.textContent=data.state||'UNKNOWN'}});
}
async function refreshSensorValues(){if(!byId('sensorTemperature')&&!byId('headerStateBadge'))return;try{const response=await fetch('/json'+(window.location.search||''),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'Status failed');applyPortalStatus(data)}catch(error){setText('sensorLiveStatus','ไม่สามารถอัปเดตสถานะอุปกรณ์ได้')}}
window.addEventListener('load',()=>{initDashboardNavigation();if(byId('networkList'))setTimeout(scanWifi,450);if(byId('sensorTemperature')||byId('headerStateBadge')){setTimeout(refreshSensorValues,300);setInterval(refreshSensorValues,2000)}})
