(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const waitFor=(test,timeout=10000)=>new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      try{
        const value=test();
        if(value){clearInterval(timer);resolve(value);return;}
      }catch(_){ }
      if(Date.now()-started>timeout){clearInterval(timer);reject(new Error('Interfaccia notifiche non pronta'));}
    },100);
  });

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const profile=()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}};

  async function install(){
    await waitFor(()=>window.NaviPush&&document.getElementById('push-device-card'));
    const card=document.getElementById('push-device-card');
    const status=document.getElementById('push-status');
    const controls=card.querySelector('div[style*="display:flex"]');

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
          status.textContent='✅ Test locale inviato a iOS. Se compare, il dispositivo è configurato correttamente.';
        }catch(error){
          status.textContent='❌ '+(error?.message||'Test locale non riuscito.');
        }finally{button.disabled=false;}
      });
    }

    const adminStatus=document.getElementById('push-admin-status');
    const adminSend=document.getElementById('push-admin-send');
    const adminAgent=document.getElementById('push-admin-agent');
    if(!adminStatus||!adminSend||!adminAgent)return;

    let detail=document.getElementById('push-admin-queue-status');
    if(!detail){
      detail=document.createElement('div');
      detail.id='push-admin-queue-status';
      detail.style.cssText='margin-top:8px;padding:9px 11px;border:1px solid #294b56;border-radius:9px;color:var(--muted);font-size:12px;line-height:1.45';
      detail.textContent='Stato ultimo test: nessun test controllato.';
      adminStatus.insertAdjacentElement('afterend',detail);
    }

    const currentAgentId=()=>String(profile()?.id||profile()?.agentId||'');
    const describe=item=>{
      const status=String(item?.status||'');
      if(status==='pending')return '⏳ Test in coda: attendo il worker GitHub.';
      if(status==='processing')return '⏳ Invio Web Push in corso…';
      if(status==='sent')return `✅ Web Push accettato dal servizio push (${Number(item.sentCount||0)} dispositivo${Number(item.sentCount||0)===1?'':'i'}).`;
      if(status==='partial')return `⚠️ Invio parziale: ${Number(item.sentCount||0)} riusciti, ${Number(item.failedCount||0)} falliti. ${esc(item.errorSummary||'')}`;
      if(status==='no_subscriptions')return '❌ Nessuna sottoscrizione valida trovata per il destinatario. Disattiva e riattiva le notifiche su quel dispositivo.';
      if(status==='error')return `❌ Invio fallito. ${esc(item.errorSummary||'Errore Web Push')}`;
      return `Stato ultimo test: ${esc(status||'sconosciuto')}.`;
    };

    async function latestFor(targetAgentId,notBefore=0){
      const queue=await NaviPush.listQueue(40);
      return queue.find(item=>
        String(item?.kind||'')==='admin-test'&&
        String(item?.requestedByAgentId||'')===currentAgentId()&&
        (!targetAgentId||String(item?.targetAgentId||'')===String(targetAgentId))&&
        (!notBefore||Date.parse(item?.createdAt||'')>=notBefore-3000)
      )||null;
    }

    async function poll(targetAgentId,startedAt){
      for(let attempt=0;attempt<40;attempt++){
        try{
          const item=await latestFor(targetAgentId,startedAt);
          if(item){
            detail.textContent=describe(item).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
            if(['sent','partial','no_subscriptions','error'].includes(String(item.status||'')))return item;
          }else{
            detail.textContent='⏳ Cerco il test appena inserito nella coda…';
          }
        }catch(error){
          detail.textContent='Impossibile leggere lo stato della coda: '+(error?.message||error);
          return null;
        }
        await sleep(3000);
      }
      detail.textContent='⏳ Il test è ancora in attesa. Il worker GitHub può subire ritardi; riprova tra qualche minuto.';
      return null;
    }

    adminSend.addEventListener('click',()=>{
      const target=String(adminAgent.value||'');
      if(!target)return;
      const started=Date.now();
      setTimeout(()=>poll(target,started),900);
    });

    try{
      const recent=await latestFor('',Date.now()-30*60*1000);
      if(recent)detail.textContent=describe(recent).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    }catch(_){ }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install().catch(()=>{}),{once:true});
  else install().catch(()=>{});
})();
