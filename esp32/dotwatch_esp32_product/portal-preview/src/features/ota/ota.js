function formatOtaBytes(value){const bytes=Number(value||0);if(!Number.isFinite(bytes)||bytes<=0)return'0 B';if(bytes<1024)return bytes+' B';if(bytes<1024*1024)return(bytes/1024).toFixed(1)+' KB';return(bytes/(1024*1024)).toFixed(2)+' MB'}
function otaBadgeClass(state){const value=String(state||'').toUpperCase();if(['UP_TO_DATE','UPDATE_AVAILABLE','REBOOTING'].includes(value))return'ok';if(['ERROR'].includes(value))return'bad';return'warn'}
function applyOtaStatus(data){
  setText('otaCurrentVersion',data.firmwareVersion||'—');
  setText('otaCurrentBuild',data.firmwareBuild?'Build '+data.firmwareBuild:'—');
  setText('otaAvailableVersion',data.otaAvailableVersion||'—');
  setText('otaAvailableBuild',data.otaAvailableBuild?'Build '+data.otaAvailableBuild:'ยังไม่พบอัปเดต');
  setText('otaChannelValue',data.otaChannel||'stable');
  setText('otaCheckIntervalValue','ตรวจทุก '+Number(data.otaCheckIntervalMinutes||360)+' นาที');
  setText('otaPolicyValue',data.otaAutoInstall?'Auto install':'Manual install');
  setText('otaEnabledValue',data.otaEnabled?'Internet OTA enabled':'Internet OTA disabled');
  setText('otaStatusMessage',data.otaMessage||'—');
  setText('otaByteProgress',formatOtaBytes(data.otaDownloadedBytes)+' / '+formatOtaBytes(data.otaTotalBytes));
  setText('otaProgressValue',Number(data.otaProgressPercent||0)+'%');
  setText('otaReleaseNotes',data.otaReleaseNotes||'Release notes จะแสดงหลังตรวจพบ Firmware ใหม่');
  const bar=byId('otaProgressBar');if(bar)bar.style.width=Math.max(0,Math.min(100,Number(data.otaProgressPercent||0)))+'%';
  const badge=byId('otaStateBadge');if(badge){badge.className='badge '+otaBadgeClass(data.otaState);badge.textContent=data.otaState||'IDLE'}
  const install=byId('otaInstallButton');if(install)install.disabled=!data.otaUpdateAvailable||data.otaBusy;
  const check=byId('otaCheckButton');if(check)check.disabled=data.otaBusy||data.otaEnabled===false;
  const otaBaseUrl=byId('otaBaseUrl');if(otaBaseUrl&&document.activeElement!==otaBaseUrl)otaBaseUrl.value=data.otaBaseUrl===data.apiUrl?'':(data.otaBaseUrl||'');
  const effective=byId('otaEffectiveUrl');if(effective)effective.textContent='Effective URL: '+(data.otaBaseUrl||data.apiUrl||'—');
  const channel=byId('otaChannel');if(channel&&data.otaChannel)channel.value=data.otaChannel;
  const interval=byId('otaCheckInterval');if(interval&&data.otaCheckIntervalMinutes)interval.value=String(data.otaCheckIntervalMinutes);
  const enabled=byId('otaEnabled');if(enabled)enabled.checked=data.otaEnabled!==false;
  const auto=byId('otaAutoInstall');if(auto)auto.checked=data.otaAutoInstall===true;
}
async function postOtaAction(path){
  const message=byId('otaActionMessage');if(message){message.style.display='block';message.textContent='กำลังส่งคำสั่ง...'}
  try{
    const response=await fetch(path+(window.location.search||''),{method:'POST',headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'HTTP '+response.status);
    if(message)message.textContent=data.message||'รับคำสั่งแล้ว';
    setTimeout(refreshSensorValues,250);
  }catch(error){if(message){message.className='notice';message.textContent=error.message||'ส่งคำสั่งไม่สำเร็จ'}}
}
function initOtaActions(){byId('otaCheckButton')?.addEventListener('click',()=>postOtaAction('/ota-check'));byId('otaInstallButton')?.addEventListener('click',()=>{if(confirm('ติดตั้ง Firmware ใหม่และ Restart ESP32 หรือไม่?'))postOtaAction('/ota-install')})}
