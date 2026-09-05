(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const NON_WORKING=/^(?:RIP|RIPOSO|CON|CONG|CONGEDO|FERIE|MAL|MALATTIA|F\.?P\.?|===|--+)$/i;
  const ROLE_NAMES=[
    [/capitano|comandante/i,'Capitano'],[/capo\s*timoniere|capotimoniere/i,'Capo timoniere'],
    [/motorista/i,'Motorista'],[/timoniere/i,'Timoniere'],[/aiuto\s*motorista|aiutomotorista/i,'Aiuto motorista'],
    [/marinaio/i,'Marinaio'],[/barista/i,'Barista']
  ];
  const MONTHS=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  const WEEKDAYS=['dom','lun','mar','mer','gio','ven','sab'];
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const norm=value=>String(value||'').trim().toLocaleUpperCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
  const rawShift=value=>String(value??'').trim().toUpperCase().replace(/[‐‑–—]/g,'-').replace(/\s+/g,'');
  const displayShift=value=>{
    const raw=rawShift(value);
    if(!raw||/^(?:RIP|RIPOSO|===|--+)$/.test(raw))return 'RIP';
    if(/^(?:CON|CONG\.?|CONGEDO)$/.test(raw))return 'CON';
    if(/^(?:LAV\.?|TERRA)$/.test(raw))return 'TERRA';
    if(/^F\.?P\.?$/.test(raw))return 'F.P.';
    return raw;
  };
  const courseShift=value=>{
    const raw=rawShift(value);
    const direct=raw.match(/^C?(D[1-4]|BIS|T[12]|M1|R[1-4]|CAR\d*|P[1-3]|CAP\d*|SR1)C?$/)?.[1];
    if(!direct)return '';
    const code=direct.replace(/\d+$/,'');
    return code==='CAR'||code==='CAP'?code:direct;
  };
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const profile=()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}};

  function todayRome(){return new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'});}
  function addDays(iso,days){const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days,12)).toISOString().slice(0,10);}
  function dateLabel(iso){const [y,m,d]=iso.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d,12));return `${WEEKDAYS[date.getUTCDay()]} ${d} ${MONTHS[m-1]}`;}
  function roleFor(agent){return ROLE_NAMES.find(([re])=>re.test(String(agent?.qualifica||agent?.grado||agent?.role||'')))?.[1]||'Equipaggio';}

  function loadScript(src,test){
    if(test())return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(script=>String(script.src||'').includes(src.split('?')[0]));
      if(existing){
        const started=Date.now();
        const timer=setInterval(()=>{if(test()){clearInterval(timer);resolve();}else if(Date.now()-started>10000){clearInterval(timer);reject(new Error('Modulo turni non disponibile'));}},50);
        return;
      }
      const script=document.createElement('script');script.src=src;script.async=false;
      script.onload=()=>resolve();script.onerror=()=>reject(new Error('Modulo turni non disponibile'));
      document.head.appendChild(script);
    });
  }

  async function loadEffectiveData(){
    await loadScript('assets/js/shared-data.js?v=118',()=>Boolean(window.NaviSharedData?.load));
    await loadScript('assets/js/effective-schedule.js?v=20260905-4',()=>Boolean(window.NaviEffectiveSchedule));
    window.NaviEffectiveSchedule?.install?.();
    if(window.NaviEffectiveSchedule?.load)return NaviEffectiveSchedule.load('',{force:true});
    return NaviSharedData.load('',{force:true});
  }

  function flattenAgents(data){
    const result=[];const seen=new Set();
    Object.entries(data?.residenze||{}).forEach(([residence,list])=>(list||[]).forEach(agent=>{
      const key=String(agent?.id||agent?.agent_uid||norm(agent?.agente||agent?.name));if(!key||seen.has(key))return;
      seen.add(key);result.push({...agent,__residence:residence});
    }));
    return result;
  }
  function findAgent(data,id){return flattenAgents(data).find(agent=>String(agent?.id||agent?.agent_uid||'')===String(id))||null;}
  function shipInfoFor(data,iso,shift){
    const course=courseShift(shift);if(!course)return null;
    return (data?.turni_navi||[]).filter(item=>item?.attiva!==false&&String(item?.data||'').slice(0,10)===iso)
      .find(item=>courseShift(item?.corsa||item?.turno)===course)||null;
  }
  function crewFor(data,iso,shift){
    const course=courseShift(shift);if(!course)return [];
    return flattenAgents(data).filter(agent=>courseShift(displayShift(agent?.turni?.[iso]))===course)
      .sort((a,b)=>String(roleFor(a)).localeCompare(String(roleFor(b)),'it')||String(a.agente||a.name).localeCompare(String(b.agente||b.name),'it'));
  }
  function refuelLabel(ship){
    const value=ship?.rifornimento_mattina??ship?.rifornimento??ship?.rifornimentoMattina??'';
    if(value===true)return 'Sì';if(value===false||value===null||value===undefined)return '';
    const text=String(value).trim();if(!text)return '';
    if(/^(?:1|true|si|sì|yes)$/i.test(text))return 'Sì';
    if(/^(?:0|false|no)$/i.test(text))return '';
    return text;
  }
  function buildSummary(data,agentId,iso){
    const agent=findAgent(data,agentId);if(!agent)throw new Error('Agente non trovato nel Turno effettivo.');
    const shift=displayShift(agent?.turni?.[iso]);
    const working=Boolean(shift)&&!NON_WORKING.test(shift);
    const label=dateLabel(iso);
    const title=`NaviSuite · ${label} · ${shift||'N/D'}`;
    if(!working){return {title,body:shift||'Nessun servizio assegnato.',shift:shift||'',iso,agent};}
    const ship=shipInfoFor(data,iso,shift);
    const vessel=String(ship?.nave||ship?.nome_nave||'').trim();
    const berth=String(ship?.ormeggio_serale||ship?.ormeggio||ship?.ormeggioSera||'').trim();
    const refuel=refuelLabel(ship);
    const crew=crewFor(data,iso,shift);
    const names=crew.map(item=>String(item?.agente||item?.name||'').trim()).filter(Boolean);
    const lines=[vessel?`${shift} · ${vessel}`:shift];
    if(names.length)lines.push(`Equipaggio: ${names.join(', ')}`);
    if(berth)lines.push(`Ormeggio serale: ${berth}`);
    if(refuel)lines.push(`Rifornimento: ${refuel}`);
    let body=lines.join('\n');
    if(body.length>500){
      const fixed=[vessel?`${shift} · ${vessel}`:shift];
      if(berth)fixed.push(`Ormeggio serale: ${berth}`);if(refuel)fixed.push(`Rifornimento: ${refuel}`);
      const room=Math.max(30,500-fixed.join('\n').length-14);
      const crewText=names.join(', ');
      fixed.splice(1,0,`Equipaggio: ${crewText.length>room?crewText.slice(0,Math.max(0,room-1))+'…':crewText}`);
      body=fixed.join('\n').slice(0,500);
    }
    return {title,body,shift,iso,agent,vessel,berth,refuel,crew};
  }

  function waitForUi(){return new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{const admin=document.getElementById('push-admin');const select=document.getElementById('push-admin-agent');const send=document.getElementById('push-admin-send');if(admin&&select&&send){clearInterval(timer);resolve({admin,select,send});return;}if(Date.now()-started>10000){clearInterval(timer);reject(new Error('Interfaccia notifiche non disponibile'));}},100);});}

  async function install(){
    const {admin,select,send}=await waitForUi();
    const actor=profile();if(!actor)return;
    const head=admin.querySelector('.section-head');
    const h3=head?.querySelector('h3');const p=head?.querySelector('p');
    if(h3)h3.textContent='Invia giornata · Admin';
    if(p)p.textContent='Invia a un agente il riepilogo reale della giornata dal Turno effettivo.';

    const grid=admin.querySelector('.grid');
    const titleField=document.getElementById('push-admin-title')?.closest('.field');
    if(titleField){titleField.innerHTML='<label for="push-admin-date">Giornata</label><input id="push-admin-date" type="date">';}
    document.getElementById('push-admin-body')?.closest('.field')?.remove();
    const dateInput=document.getElementById('push-admin-date');if(dateInput)dateInput.value=addDays(todayRome(),1);

    let preview=document.getElementById('push-day-preview');
    if(!preview){
      preview=document.createElement('div');preview.id='push-day-preview';
      preview.style.cssText='margin-top:12px;padding:12px 14px;border:1px solid #294b56;border-radius:10px;background:#0b2029;color:var(--muted);font-size:12px;line-height:1.5;white-space:pre-line';
      preview.textContent='Scegli destinatario e giornata per vedere l’anteprima.';
      grid?.insertAdjacentElement('afterend',preview);
    }

    const oldSend=send;const newSend=oldSend.cloneNode(true);newSend.textContent='Invia giornata';oldSend.replaceWith(newSend);
    const status=document.getElementById('push-admin-status');
    const oldDetail=document.getElementById('push-admin-queue-status');if(oldDetail)oldDetail.remove();
    const footer=[...admin.querySelectorAll('p')].find(el=>/GitHub Actions|worker TrueNAS/i.test(el.textContent||''));
    if(footer)footer.textContent='Il riepilogo viene letto dal Turno effettivo e inviato dal worker TrueNAS in pochi secondi.';

    let currentSummary=null;let previewToken=0;
    async function refreshPreview(){
      const token=++previewToken;const agentId=String(select.value||'');const iso=String(dateInput?.value||'');
      if(!agentId||!iso){preview.textContent='Scegli destinatario e giornata per vedere l’anteprima.';currentSummary=null;return;}
      preview.textContent='Preparazione riepilogo dal Turno effettivo…';
      try{
        const data=await loadEffectiveData();if(token!==previewToken)return;
        currentSummary=buildSummary(data,agentId,iso);
        preview.innerHTML=`<strong style="display:block;color:var(--ink);margin-bottom:5px">${esc(currentSummary.title)}</strong>${esc(currentSummary.body).replace(/\n/g,'<br>')}`;
      }catch(error){if(token!==previewToken)return;currentSummary=null;preview.textContent='❌ '+(error?.message||'Riepilogo non disponibile.');}
    }
    select.addEventListener('change',refreshPreview);dateInput?.addEventListener('change',refreshPreview);
    setTimeout(refreshPreview,700);

    async function pollQueue(id){
      let detail=document.getElementById('push-day-queue-status');
      if(!detail){detail=document.createElement('div');detail.id='push-day-queue-status';detail.style.cssText='margin-top:8px;padding:9px 11px;border:1px solid #294b56;border-radius:9px;color:var(--muted);font-size:12px;line-height:1.45';status?.insertAdjacentElement('afterend',detail);}
      for(let i=0;i<60;i++){
        try{
          const rows=await NaviPush.listQueue(60);const item=rows.find(row=>String(row?.id||'')===String(id));
          const state=String(item?.status||'pending');
          if(state==='pending')detail.textContent='⏳ Giornata in coda: attendo il worker TrueNAS.';
          else if(state==='processing')detail.textContent='⏳ Invio della giornata in corso…';
          else if(state==='sent'){detail.textContent=`✅ Giornata inviata a ${Number(item.sentCount||0)} dispositivo${Number(item.sentCount||0)===1?'':'i'}.`;return;}
          else if(state==='partial'){detail.textContent=`⚠️ Invio parziale: ${Number(item.sentCount||0)} riusciti, ${Number(item.failedCount||0)} falliti.`;return;}
          else if(state==='no_subscriptions'){detail.textContent='❌ Nessun dispositivo con notifiche attive per questo agente.';return;}
          else if(state==='error'){detail.textContent='❌ Invio non riuscito: '+String(item?.errorSummary||'errore Web Push');return;}
        }catch(error){detail.textContent='❌ Impossibile controllare la coda: '+(error?.message||error);return;}
        await sleep(1000);
      }
      detail.textContent='⚠️ Il worker TrueNAS non ha elaborato la giornata entro 60 secondi.';
    }

    newSend.addEventListener('click',async()=>{
      const targetAgentId=String(select.value||'');const iso=String(dateInput?.value||'');
      if(!targetAgentId){if(status)status.textContent='Scegli un agente con notifiche attive.';return;}
      if(!iso){if(status)status.textContent='Scegli la giornata da inviare.';return;}
      newSend.disabled=true;if(status)status.textContent='Preparazione giornata…';
      try{
        const data=await loadEffectiveData();currentSummary=buildSummary(data,targetAgentId,iso);
        const item=await NaviPush.queuePush({
          requestedByAgentId:String(actor?.id||actor?.agentId||''),requestedByName:String(actor?.name||actor?.agente||actor?.cognome||''),
          targetAgentId,title:currentSummary.title,body:currentSummary.body,url:'naviturni.html',kind:'tomorrow-summary',
          meta:{date:iso,service:currentSummary.shift||''}
        });
        if(status)status.textContent=`✅ Giornata ${dateLabel(iso)} messa in coda.`;
        pollQueue(item.id);
      }catch(error){if(status)status.textContent='❌ '+(error?.message||'Invio giornata non riuscito.');}
      finally{newSend.disabled=false;}
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>install().catch(error=>console.error('Push giornata:',error)),{once:true});
  else install().catch(error=>console.error('Push giornata:',error));
})();
