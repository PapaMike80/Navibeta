(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const profile=(()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}})();
  if(!profile)return;
  const isAdmin=['91','92'].includes(String(profile?.id||''))||['admin','super_user'].includes(String(profile?.role||'').toLowerCase());
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const senderId=String(profile?.id||profile?.agentId||'').trim();
  const senderName=String(profile?.name||profile?.agente||profile?.cognome||senderId).trim();

  const waitForBase=async()=>{
    for(let i=0;i<100;i+=1){
      const base=document.querySelector('#notifiche-push .push-settings-body');
      const dayBox=document.getElementById('push-admin');
      if(base&&dayBox&&window.NaviPush)return {base,dayBox};
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return null;
  };

  function buildBox(dayBox){
    const existing=document.getElementById('push-custom-admin');
    if(existing)return existing;
    const box=document.createElement('div');
    box.id='push-custom-admin';
    box.className='push-custom-section';
    box.style.paddingTop='5px';
    box.innerHTML=`
      <div style="height:1px;background:#294b56;margin:2px 0 14px"></div>
      <div class="section-head" style="margin-bottom:10px">
        <div><h3 style="margin:0 0 4px;font-size:16px">Invia notifica personalizzata</h3><p style="margin:0;color:var(--muted);font-size:12px">Scrivi un messaggio e invialo a un agente con Web Push attivo${isAdmin?', oppure a tutti':''}.</p></div>
        <span class="badge">Web Push</span>
      </div>
      <div class="grid">
        <div class="field"><label for="push-custom-agent">Destinatario</label><select id="push-custom-agent"><option value="">Caricamento…</option></select></div>
        <div class="field"><label for="push-custom-sender">Mittente</label><input id="push-custom-sender" value="${esc(senderName)}" readonly aria-readonly="true"></div>
      </div>
      <div class="field" style="margin-top:10px"><label for="push-custom-body">Messaggio</label><textarea id="push-custom-body" maxlength="500" rows="4" placeholder="Scrivi qui il messaggio da inviare…" style="width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #31535e;border-radius:9px;background:#0b2029;color:var(--ink);outline:none;color-scheme:dark;resize:vertical;min-height:96px;font:inherit"></textarea></div>
      <div class="field" style="margin-top:10px"><label for="push-custom-destination">Apri al tocco</label><select id="push-custom-destination"><option value="index.html">Home</option><option value="oggi.html">Oggi</option><option value="naviturni.html" selected>Turni</option><option value="cambi_turno.html">Cambio turno</option><option value="navidiaria.html">Diaria</option><option value="documenti.html">Documenti</option></select></div>
      <div style="display:flex;flex-wrap:wrap;gap:9px;margin-top:12px"><button class="btn primary" id="push-custom-send" type="button">Invia notifica</button><button class="btn" id="push-custom-refresh" type="button">Aggiorna destinatari</button></div>
      <div class="status" id="push-custom-status" aria-live="polite"></div>
      <p style="margin:8px 0 0;color:var(--muted);font-size:11px;line-height:1.4">Il mittente viene preso automaticamente dall’agente collegato e non può essere modificato.</p>`;
    dayBox.insertAdjacentElement('afterend',box);
    return box;
  }

  async function loadRecipients(){
    const select=document.getElementById('push-custom-agent');
    const refresh=document.getElementById('push-custom-refresh');
    const status=document.getElementById('push-custom-status');
    if(!select)return;
    if(refresh)refresh.disabled=true;
    if(status)status.textContent='Aggiornamento destinatari…';
    try{
      await window.NaviAdminFirebase?.ready;
      const [users,subs]=await Promise.all([window.NaviAdminFirebase?.listRegisteredUsers?.()||[],window.NaviPush.listSubscriptions()]);
      const counts=new Map();
      subs.forEach(item=>counts.set(String(item.agentId),Number(counts.get(String(item.agentId))||0)+1));
      const byId=new Map();
      users.forEach(user=>{if(user?.id)byId.set(String(user.id),user);});
      subs.forEach(item=>{if(item?.agentId&&!byId.has(String(item.agentId)))byId.set(String(item.agentId),{id:item.agentId,name:item.agentName||item.agentId});});
      const ordered=[...byId.values()].sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'it'));
      const broadcast=isAdmin?'<option value="*">📣 Tutti gli agenti con notifiche attive</option>':'';
      select.innerHTML='<option value="">Scegli agente…</option>'+broadcast+ordered.map(user=>{
        const count=Number(counts.get(String(user.id))||0);
        return `<option value="${esc(user.id)}" ${count?'':'disabled'}>${esc(user.name||user.id)} · ${count?`${count} dispositivo${count===1?'':'i'}`:'nessun dispositivo'}</option>`;
      }).join('');
      if(counts.get(senderId))select.value=senderId;
      if(status)status.textContent=`${subs.length} dispositivo${subs.length===1?'':'i'} push registrato${subs.length===1?'':'i'}.`;
    }catch(error){if(status)status.textContent=error?.message||'Impossibile caricare i destinatari.';}
    finally{if(refresh)refresh.disabled=false;}
  }

  (async()=>{
    const ui=await waitForBase();
    if(!ui)return;
    buildBox(ui.dayBox);
    const send=document.getElementById('push-custom-send');
    const refresh=document.getElementById('push-custom-refresh');
    const status=document.getElementById('push-custom-status');

    refresh?.addEventListener('click',loadRecipients);
    send?.addEventListener('click',async()=>{
      const targetAgentId=String(document.getElementById('push-custom-agent')?.value||'');
      const body=String(document.getElementById('push-custom-body')?.value||'').trim();
      const url=String(document.getElementById('push-custom-destination')?.value||'naviturni.html');
      if(!targetAgentId){status.textContent='Scegli un destinatario.';return;}
      if(targetAgentId==='*'&&!isAdmin){status.textContent='L’invio a tutti è riservato agli admin.';return;}
      if(!body){status.textContent='Scrivi il messaggio da inviare.';return;}
      if(targetAgentId==='*'&&!confirm(`Inviare questo messaggio a tutti come ${senderName}?`))return;
      send.disabled=true;
      status.textContent=targetAgentId==='*'?'Invio a tutti in corso…':'Inserimento notifica in coda…';
      try{
        await window.NaviPush.queuePush({requestedByAgentId:senderId,requestedByName:senderName,targetAgentId,title:senderName,body,url,kind:isAdmin?'admin-custom':'user-custom',meta:{senderAgentId:senderId,senderName}});
        status.textContent=targetAgentId==='*'?`✅ Messaggio inviato a tutti come ${senderName}.`:`✅ Messaggio inviato come ${senderName}.`;
        const bodyEl=document.getElementById('push-custom-body');if(bodyEl)bodyEl.value='';
      }catch(error){status.textContent=error?.message||'Invio non riuscito.';}
      finally{send.disabled=false;}
    });

    loadRecipients();
  })();
})();
