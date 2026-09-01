(function(){
  const PB_URL='https://truenas-scale.tail805e51.ts.net';
  const PB_TOKEN_KEY='navibeta.pocketbase.token.v1';
  const PB_USER_KEY='navibeta.pocketbase.user.v1';
  const PB_CACHE_MS=30*1000;
  let pbSnapshot=null;
  let pbSnapshotAt=0;
  let pbOverlayActive=false;

  const provider=async()=>{await window.NaviAdminFirebase?.ready;if(!window.NaviAdminFirebase)throw new Error('Firebase non disponibile');return window.NaviAdminFirebase};
  const directory=()=>window.NaviSharedData?.directory?.()||[];
  const agentFor=id=>directory().find(agent=>String(agent.id)===String(id));
  const localPinFor=id=>String(localStorage.getItem(`navidiaria.pin.${id}`)||'').toLowerCase();
  const validHash=value=>/^[a-f0-9]{64}$/.test(String(value||''));

  function readJson(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
  function pbToken(){return String(localStorage.getItem(PB_TOKEN_KEY)||'')}
  function pbUser(){return readJson(PB_USER_KEY)}
  function savePbAuth(auth){
    if(!auth?.token||!auth?.record)return;
    localStorage.setItem(PB_TOKEN_KEY,String(auth.token));
    localStorage.setItem(PB_USER_KEY,JSON.stringify(auth.record));
  }
  function clearPbAuth(){
    localStorage.removeItem(PB_TOKEN_KEY);
    localStorage.removeItem(PB_USER_KEY);
    pbSnapshot=null;
    pbSnapshotAt=0;
    pbOverlayActive=false;
  }

  async function pbRequest(path,{method='GET',body,auth=true}={}){
    const headers={Accept:'application/json'};
    const token=pbToken();
    if(auth&&token)headers.Authorization=token;
    if(body!==undefined)headers['Content-Type']='application/json';
    let response;
    try{
      response=await fetch(`${PB_URL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    }catch(error){
      const wrapped=new Error('PocketBase non raggiungibile');
      wrapped.cause=error;
      wrapped.pbNetwork=true;
      throw wrapped;
    }
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const message=String(payload?.message||`PocketBase HTTP ${response.status}`);
      const error=new Error(message);
      error.status=response.status;
      error.payload=payload;
      if(response.status===401)clearPbAuth();
      throw error;
    }
    return payload;
  }

  async function authenticatePocketBase(agentId,pinHash){
    const id=String(agentId||'').trim();
    if(!id||!validHash(pinHash))throw new Error('PIN non valido.');
    const auth=await pbRequest('/api/collections/users/auth-with-password',{
      method:'POST',auth:false,body:{identity:id,password:String(pinHash).toLowerCase()}
    });
    savePbAuth(auth);
    return auth;
  }

  async function ensurePocketBaseSession(agentId){
    const id=String(agentId||'').trim();
    if(!id)return false;
    const current=pbUser();
    if(pbToken()&&String(current?.login_id||'')===id)return true;
    const pinHash=localPinFor(id);
    if(!validHash(pinHash))return false;
    try{await authenticatePocketBase(id,pinHash);return true}catch(error){return false}
  }

  async function authenticateFirebase(api,payload){
    const id=String(payload.agentId||'').trim();
    const pinHash=String(payload.pinHash||'').toLowerCase();
    const agent=agentFor(id);
    if(!agent)throw new Error('Utente non presente nell’anagrafica Firebase.');
    if(!validHash(pinHash))throw new Error('PIN non valido.');
    const saved=await api.getUserAuth(id);
    if(!saved)throw new Error('Primo accesso: chiedi all’amministratore il tuo PIN iniziale.');
    if(saved.pinHash!==pinHash)throw new Error('PIN non corretto.');
    return {ok:true,mustChangePin:Boolean(saved.mustChangePin),agent,provider:'Firebase'};
  }

  async function migrateStoredPin(agentId){
    const id=String(agentId||'').trim(),pinHash=localPinFor(id);
    if(!id||!validHash(pinHash))return false;
    let migrated=false;
    try{await authenticatePocketBase(id,pinHash);migrated=true}catch(error){console.warn('[PocketBase] sessione non ripristinata; continuo con Firebase.',error?.message||error)}
    try{
      const api=await provider(),saved=await api.getUserAuth(id);
      if(saved?.pinHash&&!saved.mustChangePin)migrated=saved.pinHash===pinHash||migrated;
      else{await api.saveUserAuth(id,pinHash,{mustChangePin:false});migrated=true}
    }catch(error){console.warn('Migrazione PIN Firebase non completata',error)}
    return migrated;
  }

  async function authenticate(api,payload){
    const id=String(payload.agentId||'').trim();
    const pinHash=String(payload.pinHash||'').toLowerCase();
    const agent=agentFor(id);
    if(!agent)throw new Error('Utente non presente nell’anagrafica Firebase.');
    if(!validHash(pinHash))throw new Error('PIN non valido.');
    try{
      const auth=await authenticatePocketBase(id,pinHash);
      return {ok:true,mustChangePin:Boolean(auth?.record?.must_change_pin),agent,provider:'PocketBase'};
    }catch(pbError){
      // Fase di transizione: gli agenti non ancora provisionati e i dispositivi
      // fuori dalla tailnet continuano a poter usare Firebase senza interruzioni.
      try{return await authenticateFirebase(api,payload)}catch(firebaseError){
        if(pbError?.pbNetwork)throw firebaseError;
        throw firebaseError;
      }
    }
  }

  async function changePinHybrid(api,payload){
    const id=String(payload.agentId||'').trim();
    const oldHash=String(payload.pinHash||'').toLowerCase();
    const newHash=String(payload.newPinHash||'').toLowerCase();
    if(!validHash(oldHash)||!validHash(newHash))throw new Error('PIN non valido.');
    let changed=false;
    let firstError=null;
    try{
      const auth=await authenticatePocketBase(id,oldHash);
      await pbRequest(`/api/collections/users/records/${encodeURIComponent(auth.record.id)}`,{
        method:'PATCH',body:{password:newHash,passwordConfirm:newHash,must_change_pin:false}
      });
      localStorage.setItem(`navidiaria.pin.${id}`,newHash);
      // Riautentica per sostituire il token eventualmente invalidato dal cambio password.
      await authenticatePocketBase(id,newHash);
      changed=true;
    }catch(error){firstError=error}
    try{
      await authenticateFirebase(api,{agentId:id,pinHash:oldHash});
      await api.saveUserAuth(id,newHash,{mustChangePin:false});
      changed=true;
    }catch(error){if(!firstError)firstError=error}
    if(!changed)throw firstError||new Error('Cambio PIN non riuscito.');
    return {ok:true};
  }

  async function request(action,payload={}){
    const api=await provider();
    if(action==='auth')return authenticate(api,payload);
    if(action==='change_pin')return changePinHybrid(api,payload);
    if(action==='reset_own_pin'){await authenticateFirebase(api,payload);await api.resetUserAuth(payload.agentId);clearPbAuth();return {ok:true}}
    if(action==='reset_pin'){await api.resetUserAuth(payload.targetAgentId);return {ok:true}}
    if(action==='delete_user'){await Promise.all([api.resetUserAuth(payload.targetAgentId),api.deleteRegisteredUser(payload.targetAgentId)]);return {ok:true}}
    if(action==='list_users')return {ok:true,users:await api.listRegisteredUsers()};
    if(action==='update_user_role')return {ok:true,...await api.saveAgentProfile(payload.targetAgentId,{role:payload.role})};
    if(action==='directory')return {ok:true,users:directory()};
    if(action==='variation_status')return {ok:true,variationStatus:null};
    if(action==='list_week_status')return {ok:true,weeks:await api.getWeekStatuses()};
    if(action==='save_week_status')return {ok:true,weeks:await api.saveWeekStatuses(payload.statuses)};
    throw new Error('Funzione non disponibile nella versione ibrida Firebase/PocketBase.');
  }

  async function pbListAll(collection,{fields='',filter='',sort=''}={}){
    const all=[];
    let page=1;
    while(true){
      const params=new URLSearchParams({page:String(page),perPage:'500'});
      if(fields)params.set('fields',fields);
      if(filter)params.set('filter',filter);
      if(sort)params.set('sort',sort);
      const result=await pbRequest(`/api/collections/${encodeURIComponent(collection)}/records?${params}`);
      const items=Array.isArray(result?.items)?result.items:[];
      all.push(...items);
      if(!items.length||page>=Number(result?.totalPages||page))break;
      page+=1;
    }
    return all;
  }

  function activeAgentId(){
    for(const key of ['navidiaria.activeAgent','naviturni_logged_agent']){
      const value=readJson(key);
      if(value?.id)return String(value.id);
    }
    return '';
  }

  async function getPocketBaseTurniSnapshot(){
    const id=activeAgentId();
    if(!id||!(await ensurePocketBaseSession(id)))return null;
    if(pbSnapshot&&Date.now()-pbSnapshotAt<PB_CACHE_MS)return pbSnapshot;
    try{
      const [agenti,turni]=await Promise.all([
        pbListAll('agenti',{fields:'id,legacy_id'}),
        pbListAll('turni',{fields:'id,agente,data,servizio,codice_turno,stato',sort:'data'})
      ]);
      const legacyByPbId=new Map(agenti.map(record=>[String(record.id),String(record.legacy_id||'')]));
      pbSnapshot={legacyByPbId,turni};
      pbSnapshotAt=Date.now();
      return pbSnapshot;
    }catch(error){
      // Un token scaduto può essere recuperato una volta dal PIN salvato localmente.
      if(error?.status===401&&validHash(localPinFor(id))){
        try{
          await authenticatePocketBase(id,localPinFor(id));
          const [agenti,turni]=await Promise.all([
            pbListAll('agenti',{fields:'id,legacy_id'}),
            pbListAll('turni',{fields:'id,agente,data,servizio,codice_turno,stato',sort:'data'})
          ]);
          const legacyByPbId=new Map(agenti.map(record=>[String(record.id),String(record.legacy_id||'')]));
          pbSnapshot={legacyByPbId,turni};
          pbSnapshotAt=Date.now();
          return pbSnapshot;
        }catch(_){}
      }
      throw error;
    }
  }

  function cloneSchedule(data){
    if(typeof structuredClone==='function')try{return structuredClone(data)}catch(_){}
    return JSON.parse(JSON.stringify(data));
  }

  async function overlayScheduleFromPocketBase(data){
    if(!data||typeof data!=='object')return data;
    let snapshot;
    try{snapshot=await getPocketBaseTurniSnapshot()}catch(error){
      pbOverlayActive=false;
      console.warn('[PocketBase] Turni non disponibili; uso Firebase.',error?.message||error);
      return data;
    }
    if(!snapshot)return data;
    const output=cloneSchedule(data);
    const targetByLegacyId=new Map();
    Object.values(output?.residenze||{}).forEach(list=>(list||[]).forEach(agent=>{
      const legacyId=String(agent?.id||'').trim();
      if(legacyId)targetByLegacyId.set(legacyId,agent);
    }));
    let applied=0;
    snapshot.turni.forEach(record=>{
      const legacyId=snapshot.legacyByPbId.get(String(record.agente||''));
      const target=targetByLegacyId.get(String(legacyId||''));
      const iso=String(record.data||'').slice(0,10);
      if(!target||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso))return;
      target.turni=target.turni||{};
      if(String(record.stato||'')==='annullato')delete target.turni[iso];
      else{
        const shift=String(record.servizio||record.codice_turno||'').trim();
        if(shift)target.turni[iso]=shift;
      }
      applied+=1;
    });
    pbOverlayActive=applied>0;
    if(pbOverlayActive)console.info(`[PocketBase] ${applied} turni applicati in lettura; Firebase resta fallback.`);
    return output;
  }

  function installTurniReadOverlay(){
    const shared=window.NaviSharedData;
    if(!shared||shared.__pocketBaseOverlayInstalled)return;
    shared.__pocketBaseOverlayInstalled=true;
    if(typeof shared.loadBase==='function'){
      const originalLoadBase=shared.loadBase.bind(shared);
      shared.loadBase=async function(...args){return overlayScheduleFromPocketBase(await originalLoadBase(...args))};
    }
    if(typeof shared.load==='function'){
      const originalLoad=shared.load.bind(shared);
      shared.load=async function(...args){return overlayScheduleFromPocketBase(await originalLoad(...args))};
    }
  }

  window.NaviFirebaseAuth={request,migrateStoredPin,directory:async()=>directory(),provider:'Firebase+PocketBase'};
  window.NaviPocketBase={
    url:PB_URL,
    authenticate:authenticatePocketBase,
    ensureSession:ensurePocketBaseSession,
    overlaySchedule:overlayScheduleFromPocketBase,
    logout:clearPbAuth,
    isTurniOverlayActive:()=>pbOverlayActive,
    user:pbUser,
  };

  installTurniReadOverlay();
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#logoutButton'))clearPbAuth();
  });

  if('serviceWorker' in navigator&&!window.__naviSwRegistrationPromise){
    window.__naviSwRegistrationPromise=navigator.serviceWorker.register('sw.js').then(registration=>{
      registration?.update?.().catch(()=>{});
      return registration;
    }).catch(()=>null);
  }
})();
