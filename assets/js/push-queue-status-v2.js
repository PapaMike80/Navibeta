(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const profile=()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}};
  const waitFor=(test,timeout=10000)=>new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      let value=null;
      try{value=test();}catch(_){ }
      if(value){clearInterval(timer);resolve(value);return;}
      if(Date.now()-started>timeout){clearInterval(timer);reject(new Error('Interfaccia notifiche non pronta'));}
    },100);
  });

  function describe(item){
    const state=String(item?.status||'');
    if(state==='pending')return '⏳ Test in coda: attendo il worker TrueNAS.';
    if(state==='processing')return '⏳ Worker TrueNAS: invio Web Push in corso…';
    if(state==='sent')return `✅ Web Push inviato (${Number(item.sentCount||0)} dispositivo${Number(item.sentCount||0)===1?'':'i'}).`;
    if(state==='partial')return `⚠️ Invio parziale: ${Number(item.sentCount||0)} riusciti, ${Number(item.failedCount||0)} falliti.`;
    if(state==='no_subscriptions')return '❌ Nessuna sottoscrizione valida per il destinatario. Riattiva le notifiche sul dispositivo.';
    if(state==='error')return `❌ Invio fallito: ${String(item.errorSummary||'errore Web Push')}`;
    return `Stato ultimo test: ${state||'sconosciuto'}.`;
  }

  async function install(){
    await waitFor(()=>window.NaviPush&&document.getElementById('push-device-card'));

    const deviceCard=document.getElementById('push-device-card');
    const deviceStatus=document.getElementById('push-status');
    const controls=deviceCard?.querySelector('div[style*="display:flex"]');
    if(controls&&!document.getElementById('push-local-test')){
      const button=document.createElement('button');
      button.className='btn';
      button.id='push-local-test';
      button.type='button';
      button.textContent='🔔 Test su questo iPhone';
      controls.appendChild(button);
      button.addEventListener('click',async()=>{
        button.disabled=true;
        try{
          if(!('Notification' in window))throw new Error('Notifiche non supportate');
          if(Notification.permission!=='granted')throw new Error('Prima attiva le notifiche su questo dispositivo');
          const reg=await navigator.serviceWorker.ready;
          await reg.showNotification('NaviSuite · Test locale',{
            body:'Se vedi questo avviso, iPhone e Service Worker funzionano correttamente.',
            icon:'assets/images/icona_192.png',
            badge:'assets/images/icona_192.png',
            tag:'navisuite-local-test-'+Date.now(),
            data:{url:'impostazioni.html'}
          });
          if(deviceStatus)deviceStatus.textContent='✅ Test locale inviato a iOS.';
        }catch(error){if(deviceStatus)deviceStatus.textContent='❌ '+(error?.message||'Test locale non riuscito.');}
        finally{button.disabled=false;}
      });
    }

    const adminSend=document.getElementById('push-admin-send');
    const adminAgent=document.getElementById('push-admin-agent');
    const adminStatus=document.getElementById('push-admin-status');
    if(!adminSend||!adminAgent||!adminStatus)return;

    const footnote=document.querySelector('#push-admin p[style*="font-size:11px"]');
    if(footnote)footnote.textContent='In Navibeta l’invio è processato dal worker TrueNAS: normalmente arriva entro pochi secondi.';

    let detail=document.getElementById('push-admin-queue-status');
    if(!detail){
      detail=document.createElement('div');
      detail.id='push-admin-queue-status';
      detail.style.cssText='margin-top:8px;padding:9px 11px;border:1px solid #294b56;border-radius:9px;color:var(--muted);font-size:12px;line-height:1.45';
      detail.textContent='Stato ultimo test: nessun test controllato.';
      adminStatus.insertAdjacentElement('afterend',detail);
    }

    const currentAgentId=()=>String(profile()?.id||profile()?.agentId||'');

    async function latestFor(targetAgentId,notBefore=0){
      const queue=await NaviPush.listQueue(50);
      return queue.find(item=>
        String(item?.kind||'')==='admin-test'&&
        String(item?.requestedByAgentId||'')===currentAgentId()&&
        (!targetAgentId||String(item?.targetAgentId||'')===String(targetAgentId))&&
        (!notBefore||Date.parse(item?.createdAt||'')>=notBefore-3000)
      )||null;
    }

    async function poll(targetAgentId,startedAt){
      for(let attempt=0;attempt<60;attempt++){
        try{
          const item=await latestFor(targetAgentId,startedAt);
          if(item){
            detail.textContent=describe(item);
            const state=String(item.status||'');
            if(state==='pending')adminStatus.textContent='✅ Notifica in coda. Il worker TrueNAS la elaborerà entro pochi secondi.';
            if(state==='processing')adminStatus.textContent='⏳ Invio in corso dal worker TrueNAS…';
            if(state==='sent')adminStatus.textContent='✅ Notifica inviata dal worker TrueNAS.';
            if(['sent','partial','no_subscriptions','error'].includes(state))return item;
          }else{
            detail.textContent='⏳ Cerco il test appena inserito nella coda…';
          }
        }catch(error){
          detail.textContent='Impossibile leggere lo stato della coda: '+(error?.message||error);
          return null;
        }
        await sleep(1000);
      }
      detail.textContent='⚠️ Il test è ancora in coda dopo 60 secondi: verifica che il worker TrueNAS sia attivo.';
      adminStatus.textContent='⚠️ Worker TrueNAS non ha ancora elaborato la notifica.';
      return null;
    }

    adminSend.addEventListener('click',()=>{
      const target=String(adminAgent.value||'');
      if(!target)return;
      const started=Date.now();
      setTimeout(()=>poll(target,started),500);
    });

    try{
      const recent=await latestFor('',Date.now()-30*60*1000);
      if(recent){
        detail.textContent=describe(recent);
        if(String(recent.status||'')==='pending')adminStatus.textContent='✅ Notifica in coda. Il worker TrueNAS la elaborerà entro pochi secondi.';
      }
    }catch(_){ }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install().catch(()=>{}),{once:true});
  else install().catch(()=>{});
})();
