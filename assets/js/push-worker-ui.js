(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const profile=()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function replaceWorkerCopy(){
    const admin=document.getElementById('push-admin');
    if(admin){
      admin.querySelectorAll('p').forEach(el=>{
        if(/GitHub Actions/i.test(el.textContent||''))el.textContent='In Navibeta l’invio è processato dal worker TrueNAS: normalmente arriva entro pochi secondi.';
      });
    }
    const status=document.getElementById('push-admin-status');
    if(status&&/pochi minuti/i.test(status.textContent||''))status.textContent=status.textContent.replace(/entro pochi minuti/i,'entro pochi secondi');
    const detail=document.getElementById('push-admin-queue-status');
    if(detail){
      detail.textContent=(detail.textContent||'')
        .replace(/worker GitHub/gi,'worker TrueNAS')
        .replace(/può subire ritardi; riprova tra qualche minuto/gi,'non ha ancora processato la coda');
    }
  }

  async function applyMigrationState(){
    const p=profile();
    if(!p||!window.NaviPush)return;
    try{
      const state=await NaviPush.getStatus(p);
      if(!state.requiresMigration)return;
      const title=document.getElementById('push-device-title');
      const copy=document.getElementById('push-device-copy');
      const enable=document.getElementById('push-enable');
      const disable=document.getElementById('push-disable');
      if(title)title.textContent='🔄 Aggiornamento notifiche richiesto';
      if(copy)copy.textContent='La chiave notifiche di Navibeta è stata aggiornata. Tocca Riattiva notifiche una sola volta su questo dispositivo.';
      if(enable){enable.hidden=false;enable.disabled=false;enable.textContent='🔔 Riattiva notifiche';}
      if(disable)disable.hidden=true;
    }catch(_){ }
  }

  async function install(){
    for(let i=0;i<50&&!window.NaviPush;i++)await sleep(100);
    replaceWorkerCopy();
    await applyMigrationState();
    const root=document.getElementById('notifiche-push')||document.body;
    new MutationObserver(()=>{replaceWorkerCopy();applyMigrationState();}).observe(root,{childList:true,subtree:true,characterData:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install(),{once:true});
  else install();
})();
