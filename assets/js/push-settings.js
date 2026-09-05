(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const profile=(()=>{try{return JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');}catch(_){return null;}})();
  if(!profile)return;
  const isAdmin=['91','92'].includes(String(profile?.id||''))||['admin','super_user'].includes(String(profile?.role||'').toLowerCase());
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const agentId=String(profile?.id||profile?.agentId||'');

  function createSection(){
    if(document.getElementById('notifiche-push'))return document.getElementById('notifiche-push');
    const section=document.createElement('section');
    section.className='section settings-foldable';
    section.id='notifiche-push';
    section.dataset.collapsed='false';
    section.innerHTML=`
      <div class="section-head" role="button" tabindex="0" aria-expanded="true">
        <div><h2>Notifiche</h2><p>Ricevi avvisi NaviSuite anche quando la PWA è chiusa o l’iPhone è bloccato.</p></div>
        <span class="badge">Web Push</span><span class="settings-chevron" aria-hidden="true">⌄</span>
      </div>
      <div class="push-settings-body" style="display:grid;gap:16px">
        <div id="push-device-card" style="padding:15px;border:1px solid #31535e;border-radius:11px;background:#0b2029">
          <strong id="push-device-title" style="display:block;margin-bottom:5px">Verifica notifiche…</strong>
          <span id="push-device-copy" style="display:block;color:var(--muted);font-size:12px;line-height:1.45">Controllo lo stato di questo dispositivo.</span>
          <div style="display:flex;flex-wrap:wrap;gap:9px;margin-top:14px">
            <button class="btn primary" id="push-enable" type="button">🔔 Attiva notifiche</button>
            <button class="btn" id="push-disable" type="button" hidden>Disattiva su questo dispositivo</button>
          </div>
          <div class="status" id="push-status" aria-live="polite"></div>
        </div>
        <div>
          <h3 style="margin:0 0 4px;font-size:15px">Cosa vuoi ricevere</h3>
          <p style="margin:0 0 8px;color:var(--muted);font-size:12px">Le preferenze sono associate a questo dispositivo.</p>
          <div class="switch-row" style="margin:0;padding:12px 0;border-top:1px solid #203e48;border-bottom:0">
            <div class="switch-copy"><strong>Riepilogo turno di domani</strong><span>Servizio, nave, equipaggio, ormeggio e rifornimento.</span></div>
            <label class="switch"><input id="push-pref-tomorrow" type="checkbox"><i></i></label>
          </div>
          <div class="switch-row" style="margin:0;padding:12px 0;border-bottom:0">
            <div class="switch-copy"><strong>Cambi turno</strong><span>Richieste, approvazioni e modifiche che ti riguardano.</span></div>
            <label class="switch"><input id="push-pref-changes" type="checkbox"><i></i></label>
          </div>
          <div class="switch-row" style="margin:0;padding:12px 0">
            <div class="switch-copy"><strong>ODS e variazioni</strong><span>Nuovi ODS e variazioni rilevanti per il tuo servizio.</span></div>
            <label class="switch"><input id="push-pref-ods" type="checkbox"><i></i></label>
          </div>
        </div>
        <div id="push-ios-help" style="display:none;padding:12px 14px;border:1px solid #795b24;border-radius:10px;background:#2b2415;color:#ffd27a;font-size:12px;line-height:1.5">
          Su iPhone le notifiche funzionano solo aprendo NaviSuite dall’icona aggiunta alla schermata Home.
        </div>
        <div id="push-admin" class="admin-section" ${isAdmin?'':'hidden'} style="padding-top:5px">
          <div style="height:1px;background:#294b56;margin:2px 0 14px"></div>
          <div class="section-head" style="margin-bottom:10px"><div><h3 style="margin:0 0 4px;font-size:16px">Test notifiche · Admin</h3><p style="margin:0;color:var(--muted);font-size:12px">Scegli un agente registrato e metti un vero Web Push in coda.</p></div><span class="badge">Beta</span></div>
          <div class="grid">
            <div class="field"><label for="push-admin-agent">Destinatario</label><select id="push-admin-agent"><option value="">Caricamento…</option></select></div>
            <div class="field"><label for="push-admin-title">Titolo</label><input id="push-admin-title" value="NaviSuite · Test remoto" maxlength="120"></div>
          </div>
          <div class="field" style="margin-top:10px"><label for="push-admin-body">Messaggio</label><input id="push-admin-body" value="Test Web Push ricevuto correttamente ✅" maxlength="500"></div>
          <div style="display:flex;flex-wrap:wrap;gap:9px;margin-top:12px"><button class="btn primary" id="push-admin-send" type="button">Invia notifica di prova</button><button class="btn" id="push-admin-refresh" type="button">Aggiorna dispositivi</button></div>
          <div class="status" id="push-admin-status" aria-live="polite"></div>
          <p style="margin:8px 0 0;color:var(--muted);font-size:11px;line-height:1.4">In Navibeta l’invio è processato dalla coda GitHub Actions: normalmente arriva entro pochi minuti.</p>
        </div>
      </div>`;
    const intro=document.querySelector('main > .intro');
    if(intro)intro.insertAdjacentElement('afterend',section);else document.querySelector('main')?.prepend(section);
    const head=section.querySelector(':scope > .section-head');
    const toggle=()=>{const collapsed=section.dataset.collapsed==='true';section.dataset.collapsed=String(!collapsed);head.setAttribute('aria-expanded',String(collapsed));};
    head.addEventListener('click',event=>{if(event.target.closest('button,a,input,select,textarea'))return;toggle();});
    head.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});
    return section;
  }

  const section=createSection();
  const $=id=>document.getElementById(id);
  const enableBtn=$('push-enable'),disableBtn=$('push-disable'),statusEl=$('push-status');
  const titleEl=$('push-device-title'),copyEl=$('push-device-copy');
  const prefTomorrow=$('push-pref-tomorrow'),prefChanges=$('push-pref-changes'),prefOds=$('push-pref-ods');
  const iosHelp=$('push-ios-help');
  const adminAgent=$('push-admin-agent'),adminTitle=$('push-admin-title'),adminBody=$('push-admin-body'),adminSend=$('push-admin-send'),adminRefresh=$('push-admin-refresh'),adminStatus=$('push-admin-status');

  const prefsFromUi=()=>({tomorrowSummary:prefTomorrow.checked,shiftChanges:prefChanges.checked,ods:prefOds.checked});
  const fillPrefs=prefs=>{prefTomorrow.checked=prefs?.tomorrowSummary!==false;prefChanges.checked=prefs?.shiftChanges!==false;prefOds.checked=prefs?.ods!==false;};

  async function refreshStatus(){
    if(!window.NaviPush){titleEl.textContent='Notifiche non disponibili';copyEl.textContent='Il modulo Web Push non è stato caricato.';enableBtn.disabled=true;return;}
    try{
      const state=await NaviPush.getStatus(profile);
      fillPrefs(state.preferences);
      iosHelp.style.display=NaviPush.isIos()&&!NaviPush.isStandalone()?'block':'none';
      if(!state.supported){titleEl.textContent='Dispositivo non compatibile';copyEl.textContent='Questo browser non espone le API Web Push.';enableBtn.hidden=false;enableBtn.disabled=true;disableBtn.hidden=true;return;}
      if(state.enabled){
        titleEl.textContent='🔔 Notifiche attive su questo dispositivo';
        copyEl.textContent='NaviSuite può ricevere veri Web Push anche quando è chiusa.';
        enableBtn.hidden=true;disableBtn.hidden=false;
      }else{
        titleEl.textContent='🔕 Notifiche non attive';
        copyEl.textContent=state.permission==='denied'?'Il permesso è stato negato nelle impostazioni di iOS/browser.':'Attivale per ricevere gli avvisi di NaviSuite.';
        enableBtn.hidden=false;enableBtn.disabled=state.permission==='denied';disableBtn.hidden=true;
      }
    }catch(error){statusEl.textContent=error?.message||'Impossibile verificare le notifiche.';}
  }

  enableBtn.addEventListener('click',async()=>{
    enableBtn.disabled=true;statusEl.textContent='Attivazione notifiche…';
    try{await NaviPush.subscribe(profile,prefsFromUi());statusEl.textContent='✅ Notifiche attive e dispositivo registrato.';await refreshStatus();if(isAdmin)await loadAdminAgents();}
    catch(error){statusEl.textContent=error?.message||'Attivazione non riuscita.';}
    finally{enableBtn.disabled=false;}
  });

  disableBtn.addEventListener('click',async()=>{
    disableBtn.disabled=true;statusEl.textContent='Disattivazione…';
    try{await NaviPush.unsubscribe(profile);statusEl.textContent='Notifiche disattivate su questo dispositivo.';await refreshStatus();if(isAdmin)await loadAdminAgents();}
    catch(error){statusEl.textContent=error?.message||'Disattivazione non riuscita.';}
    finally{disableBtn.disabled=false;}
  });

  [prefTomorrow,prefChanges,prefOds].forEach(input=>input.addEventListener('change',async()=>{
    try{await NaviPush.updatePreferences(profile,prefsFromUi());statusEl.textContent='Preferenze notifiche salvate.';}
    catch(error){statusEl.textContent=error?.message||'Preferenze non salvate.';}
  }));

  async function loadAdminAgents(){
    if(!isAdmin||!adminAgent)return;
    adminRefresh.disabled=true;adminStatus.textContent='Aggiornamento dispositivi…';
    try{
      await window.NaviAdminFirebase?.ready;
      const [users,subs]=await Promise.all([
        window.NaviAdminFirebase?.listRegisteredUsers?.()||[],
        NaviPush.listSubscriptions()
      ]);
      const counts=new Map();
      subs.forEach(item=>counts.set(String(item.agentId),Number(counts.get(String(item.agentId))||0)+1));
      const byId=new Map();
      users.forEach(user=>{if(user?.id)byId.set(String(user.id),user);});
      subs.forEach(item=>{if(item?.agentId&&!byId.has(String(item.agentId)))byId.set(String(item.agentId),{id:item.agentId,name:item.agentName||item.agentId});});
      const ordered=[...byId.values()].sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'it'));
      adminAgent.innerHTML='<option value="">Scegli agente…</option>'+ordered.map(user=>{
        const count=Number(counts.get(String(user.id))||0);
        return `<option value="${esc(user.id)}" ${count?'':'disabled'}>${esc(user.name||user.id)} · ${count?`${count} dispositivo${count===1?'':'i'}`:'nessun dispositivo'}</option>`;
      }).join('');
      if(counts.get(agentId))adminAgent.value=agentId;
      adminStatus.textContent=`${subs.length} dispositivo${subs.length===1?'':'i'} push registrato${subs.length===1?'':'i'}.`;
    }catch(error){adminStatus.textContent=error?.message||'Impossibile caricare i dispositivi.';}
    finally{adminRefresh.disabled=false;}
  }

  adminRefresh?.addEventListener('click',loadAdminAgents);
  adminSend?.addEventListener('click',async()=>{
    const targetAgentId=String(adminAgent.value||'');
    if(!targetAgentId){adminStatus.textContent='Scegli un agente con almeno un dispositivo registrato.';return;}
    adminSend.disabled=true;adminStatus.textContent='Inserimento notifica in coda…';
    try{
      await NaviPush.queuePush({
        requestedByAgentId:agentId,
        requestedByName:String(profile?.name||profile?.agente||profile?.cognome||agentId),
        targetAgentId,
        title:adminTitle.value,
        body:adminBody.value,
        url:'naviturni.html',
        kind:'admin-test'
      });
      adminStatus.textContent='✅ Notifica in coda. In Navibeta dovrebbe arrivare entro pochi minuti.';
    }catch(error){adminStatus.textContent=error?.message||'Invio non riuscito.';}
    finally{adminSend.disabled=false;}
  });

  refreshStatus();
  if(isAdmin)loadAdminAgents();
})();