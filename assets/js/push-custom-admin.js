(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const readProfile=()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}};
  const profile=readProfile();
  if(!profile)return;
  const isAdmin=['91','92'].includes(String(profile?.id||''))||['admin','super_user'].includes(String(profile?.role||'').toLowerCase());
  if(!isAdmin)return;

  const waitForUi=async()=>{
    for(let i=0;i<60;i+=1){
      const box=document.getElementById('push-admin');
      const send=document.getElementById('push-admin-send');
      if(box&&send&&window.NaviPush)return {box,send};
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return null;
  };

  const ensureBroadcastOption=select=>{
    if(!select||select.querySelector('option[value="*"]'))return;
    const option=document.createElement('option');
    option.value='*';
    option.textContent='📣 Tutti gli agenti con notifiche attive';
    const first=select.querySelector('option');
    if(first)first.insertAdjacentElement('afterend',option);else select.appendChild(option);
  };

  (async()=>{
    const ui=await waitForUi();
    if(!ui)return;
    const {box}=ui;

    const head=box.querySelector('.section-head');
    const h3=head?.querySelector('h3');
    const intro=head?.querySelector('p');
    const badge=head?.querySelector('.badge');
    if(h3)h3.textContent='Invia notifica personalizzata · Admin';
    if(intro)intro.textContent='Scrivi una notifica libera e inviala a un agente oppure a tutti i dispositivi Web Push attivi.';
    if(badge)badge.textContent='Web Push';

    const title=document.getElementById('push-admin-title');
    if(title){
      title.value='NaviSuite';
      title.placeholder='Titolo della notifica';
      title.autocomplete='off';
    }

    const oldBody=document.getElementById('push-admin-body');
    let body=oldBody;
    if(oldBody&&oldBody.tagName!=='TEXTAREA'){
      body=document.createElement('textarea');
      body.id='push-admin-body';
      body.maxLength=500;
      body.rows=4;
      body.placeholder='Scrivi qui il messaggio da inviare…';
      body.style.cssText='width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #31535e;border-radius:9px;background:#0b2029;color:var(--ink);outline:none;color-scheme:dark;resize:vertical;min-height:96px;font:inherit';
      oldBody.replaceWith(body);
    }else if(body){
      body.value='';
      body.placeholder='Scrivi qui il messaggio da inviare…';
    }

    const bodyField=body?.closest('.field');
    if(bodyField&&!document.getElementById('push-admin-destination')){
      const destination=document.createElement('div');
      destination.className='field';
      destination.style.marginTop='10px';
      destination.innerHTML=`<label for="push-admin-destination">Apri al tocco</label><select id="push-admin-destination">
        <option value="index.html">Home</option>
        <option value="oggi.html">Oggi</option>
        <option value="naviturni.html" selected>Turni</option>
        <option value="cambi_turno.html">Cambio turno</option>
        <option value="navidiaria.html">Diaria</option>
        <option value="documenti.html">Documenti</option>
      </select>`;
      bodyField.insertAdjacentElement('afterend',destination);
    }

    const agent=document.getElementById('push-admin-agent');
    ensureBroadcastOption(agent);
    if(agent){
      const observer=new MutationObserver(()=>ensureBroadcastOption(agent));
      observer.observe(agent,{childList:true});
    }

    const oldSend=document.getElementById('push-admin-send');
    const send=oldSend.cloneNode(true);
    send.textContent='Invia notifica';
    oldSend.replaceWith(send);

    const refresh=document.getElementById('push-admin-refresh');
    if(refresh)refresh.textContent='Aggiorna destinatari';

    const status=document.getElementById('push-admin-status');
    const note=box.querySelector('.status + p');
    if(note)note.textContent='L’invio usa il worker Web Push su TrueNAS e normalmente viene elaborato in pochi secondi.';

    send.addEventListener('click',async()=>{
      const targetAgentId=String(document.getElementById('push-admin-agent')?.value||'');
      const titleValue=String(document.getElementById('push-admin-title')?.value||'').trim();
      const bodyValue=String(document.getElementById('push-admin-body')?.value||'').trim();
      const destination=String(document.getElementById('push-admin-destination')?.value||'naviturni.html');
      const senderId=String(profile?.id||profile?.agentId||'').trim();
      const senderName=String(profile?.name||profile?.agente||profile?.cognome||senderId).trim();

      if(!targetAgentId){if(status)status.textContent='Scegli un destinatario.';return;}
      if(!titleValue){if(status)status.textContent='Inserisci il titolo della notifica.';return;}
      if(!bodyValue){if(status)status.textContent='Scrivi il messaggio da inviare.';return;}
      if(targetAgentId==='*'&&!confirm('Inviare questa notifica a tutti gli agenti con Web Push attivo?'))return;

      send.disabled=true;
      if(status)status.textContent=targetAgentId==='*'?'Invio a tutti in corso…':'Inserimento notifica in coda…';
      try{
        await window.NaviPush.queuePush({
          requestedByAgentId:senderId,
          requestedByName:senderName,
          targetAgentId,
          title:titleValue,
          body:bodyValue,
          url:destination,
          kind:'admin-custom'
        });
        if(status)status.textContent=targetAgentId==='*'?'✅ Notifica inviata a tutti i dispositivi attivi.':'✅ Notifica inviata.';
        const bodyEl=document.getElementById('push-admin-body');
        if(bodyEl)bodyEl.value='';
      }catch(error){
        if(status)status.textContent=error?.message||'Invio non riuscito.';
      }finally{
        send.disabled=false;
      }
    });
  })();
})();
