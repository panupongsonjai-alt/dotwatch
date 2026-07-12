function hasSensorNumber(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))}
function applySensorValues(data){const available=data.sensorReadingAvailable!==false&&hasSensorNumber(data.temperature)&&hasSensorNumber(data.humidity);setText('sensorTemperature',available?Number(data.temperature).toFixed(1):'--');setText('sensorHumidity',available?Number(data.humidity).toFixed(1):'--');if(data.lastSensorError){setText('sensorLiveStatus','ยังอ่านค่า Sensor ไม่สำเร็จ');return}const age=Number(data.sensorReadingAgeSeconds);if(available&&Number.isFinite(age)){setText('sensorLiveStatus','ค่าล่าสุดจาก Sensor · '+Math.max(0,Math.round(age))+' วินาทีที่แล้ว')}else{setText('sensorLiveStatus',available?'ค่าล่าสุดจาก Sensor · อัปเดตอัตโนมัติ':'กำลังรอค่าจาก Sensor')}}
function applyPortalStatus(data){
  applySensorValues(data);
  applyOtaStatus(data);
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
  setText('wifiIpMode',data.ipMode||'DHCP learning');
  setText('wifiLockedIp',data.lockedIp||'ยังไม่เรียนรู้');
  if(data.rememberedWifiProfiles!==undefined)setText('rememberedWifi',String(data.rememberedWifiProfiles)+' networks');
  setText('healthWifi',wifiConnected?'Connected':'Disconnected');
  setText('healthBackend',backendOk?'Connected':(data.lastSendError||'Waiting'));
  setText('healthSensor',data.sensorReadingAvailable?'Available':'Waiting');
  setText('healthTls',data.tlsCaSource||'—');
  ['healthWifi','healthBackend','healthSensor','healthTls'].forEach(id=>{const row=byId(id)?.closest('.health-row');const marker=row?.querySelector('.health-dot');if(!marker)return;let cls='warn';if(id==='healthWifi')cls=wifiConnected?'ok':'bad';if(id==='healthBackend')cls=backendOk?'ok':'bad';if(id==='healthSensor')cls=data.sensorReadingAvailable?'ok':'warn';if(id==='healthTls')cls=data.tlsCaSource?'ok':'warn';marker.className='health-dot '+cls});
  const dot=byId('sidebarStateDot');if(dot)dot.className='sidebar-status-dot '+stateClass(data.state);
  ['headerStateBadge','appStateBadge'].forEach(id=>{const badge=byId(id);if(badge){badge.className='badge '+stateClass(data.state);badge.textContent=data.state||'UNKNOWN'}});
}
async function refreshSensorValues(){if(!byId('sensorTemperature')&&!byId('statusDeviceCode'))return;try{const response=await fetch('/json'+(window.location.search||''),{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.message||'Status failed');applyPortalStatus(data)}catch(error){setText('sensorLiveStatus','ไม่สามารถอัปเดตสถานะอุปกรณ์ได้')}}
