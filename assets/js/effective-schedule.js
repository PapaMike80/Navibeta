(function(){
  'use strict';

  const DATABASE_URL='https://navisuite-f116f-default-rtdb.europe-west1.firebasedatabase.app';
  const AUTH_KEY='navisuite.adminFirebaseAuth.v1';
  const NODE='private/adminUpdates/effectiveSchedule';
  const CACHE_KEY='navibeta.effectiveSchedule.v1';
  const CUTOFF='2026-07-01';
  const SCHEMA_VERSION=1;
  let pendingRead=null;
  let pendingRebuild=null;
  let installed=false;

  const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  const norm=value=>String(value||'').trim().toLocaleUpperCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
  const normalizeShift=value=>{
    const raw=String(value??'').trim().toUpperCase().replace(/[‐‑–—]/g,'-');
    if(!raw||/^(?:RIP(?:\.|-*)?|RIPOSO|-{2,}|={2,})$/.test(raw))return 'RIP';
    if(/^(?:CONG?\.?|CON;|CONC\.?|C\.)$/.test(raw))return 'CON';
    if(/^(?:LAV\.?|TERRA)$/.test(raw))return 'TERRA';
    if(/^F\.?P\.?-*$/.test(raw))return 'F.P.';
    return raw.replace(/\.{2,}$/g,'.').replace(/-+$/g,'');
  };
  const safeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||'').slice(0,10))?String(value).slice(0,10):'';
  const priority=item=>String(item?.tipo||'').toUpperCase()==='MANUALE'
    ?(item?.requestId?-1:1000000)
    :Number.parseInt(String(item?.ods||'').match(/\d+/)?.[0]||'0',10);
  const originFor=item=>String(item?.tipo||'').toUpperCase()==='MANUALE'
    ?(item?.requestId?'cambio_turno':'manuale')
    :'ods';

  function readLocal(){
    try{
      const value=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      return value?.data&&value?.meta?value:null;
    }catch(_){return null;}
  }
  function writeLocal(snapshot){
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(snapshot));}catch(error){console.warn('Turno effettivo: cache locale non disponibile',error);}
    return snapshot;
  }
  function auth(){
    try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null');}catch(_){return null;}
  }
  async function token(){
    try{await window.NaviAdminFirebase?.ready;}catch(_){ }
    const value=auth();
    if(!value?.idToken)throw new Error('Autenticazione Firebase non disponibile');
    return value.idToken;
  }
  async function request(method,path,body){
    const idToken=await token();
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(`${DATABASE_URL}/${path}.json?auth=${encodeURIComponent(idToken)}`,{
        method,signal:controller.signal,cache:'no-store',headers:{'Content-Type':'application/json'},
        body:body===undefined?undefined:JSON.stringify(body)
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error||`Firebase HTTP ${response.status}`);
      return data;
    }finally{clearTimeout(timeout);}
  }

  function agentIndex(data){
    const byId=new Map(),byName=new Map();
    Object.values(data?.residenze||{}).forEach(list=>(list||[]).forEach(agent=>{
      if(agent?.id!==undefined&&agent?.id!==null)byId.set(String(agent.id),agent);
      const name=norm(agent?.agente||agent?.name);if(name)byName.set(name,agent);
    }));
    return {byId,byName};
  }

  function materialize(source,previous=null,reason='sync'){
    const data=clone(source||{});
    const {byId,byName}=agentIndex(data);
    const effectiveMeta={};
    const baseByCell=new Map();

    Object.values(data.residenze||{}).forEach(list=>(list||[]).forEach(agent=>{
      agent.turni=agent.turni||{};
      Object.keys(agent.turni).forEach(date=>{
        if(date<CUTOFF){delete agent.turni[date];return;}
        agent.turni[date]=normalizeShift(agent.turni[date]);
        baseByCell.set(`${String(agent.id||agent.agent_uid||norm(agent.agente))}|${date}`,agent.turni[date]);
      });
      if(agent.turni_settimanali)delete agent.turni_settimanali;
    }));

    const variations=(Array.isArray(data.variazioni_ods)?data.variazioni_ods:Object.values(data.variazioni_ods||{}))
      .filter(item=>item&&item.attiva!==false&&safeDate(item.data)>=CUTOFF)
      .sort((a,b)=>priority(a)-priority(b));

    variations.forEach(item=>{
      const id=String(item?.id_agente||item?.agentId||'');
      const name=norm(item?.agente||item?.nome||item?.agentName);
      const agent=(id&&byId.get(id))||(name&&byName.get(name));
      const date=safeDate(item?.data);
      const next=normalizeShift(item?.turno_nuovo??item?.turno??item?.dopo);
      if(!agent||!date||!next)return;
      const agentKey=String(agent.id||agent.agent_uid||norm(agent.agente));
      const cellKey=`${agentKey}|${date}`;
      const before=agent.turni?.[date]||'RIP';
      agent.turni[date]=next;
      effectiveMeta[cellKey]={
        agentId:String(agent.id||''),agentUid:String(agent.agent_uid||''),agentName:String(agent.agente||agent.name||''),
        date,baseService:baseByCell.get(cellKey)||before,service:next,origin:originFor(item),
        source:{tipo:String(item.tipo||''),ods:String(item.ods||''),requestId:String(item.requestId||''),note:String(item.note||'')}
      };
    });

    data.date=(Array.isArray(data.date)?data.date:Object.values(data.date||{})).filter(item=>safeDate(item?.iso)>=CUTOFF);
    data.turni_navi=(Array.isArray(data.turni_navi)?data.turni_navi:Object.values(data.turni_navi||{})).filter(item=>!safeDate(item?.data)||safeDate(item.data)>=CUTOFF);
    data.bariste=(Array.isArray(data.bariste)?data.bariste:Object.values(data.bariste||{})).filter(item=>!safeDate(item?.data)||safeDate(item.data)>=CUTOFF);
    data.variazioni_ods=[];
    data.effective_meta=effectiveMeta;
    data.effective_schedule=true;

    const previousData=previous?.data||null;
    const changes=diff(previousData,data);
    const version=Math.max(1,Number(previous?.meta?.version||0)+1);
    return {
      meta:{
        schemaVersion:SCHEMA_VERSION,version,updatedAt:new Date().toISOString(),reason,
        cutoff:CUTOFF,changeCount:changes.length,lastChangeSet:changes.slice(0,250)
      },
      data
    };
  }

  function cellMap(data){
    const out=new Map();
    Object.values(data?.residenze||{}).forEach(list=>(list||[]).forEach(agent=>{
      const agentId=String(agent.id||agent.agent_uid||norm(agent.agente));
      Object.entries(agent.turni||{}).forEach(([date,service])=>{
        if(date>=CUTOFF)out.set(`${agentId}|${date}`,{agentId,agentName:String(agent.agente||agent.name||''),date,service:normalizeShift(service)});
      });
    }));
    return out;
  }
  function diff(before,after){
    if(!before)return [];
    const a=cellMap(before),b=cellMap(after),keys=new Set([...a.keys(),...b.keys()]),changes=[];
    keys.forEach(key=>{
      const oldValue=a.get(key),newValue=b.get(key);
      const from=oldValue?.service||'';const to=newValue?.service||'';
      if(from===to)return;
      changes.push({
        agentId:newValue?.agentId||oldValue?.agentId||'',agentName:newValue?.agentName||oldValue?.agentName||'',
        date:newValue?.date||oldValue?.date||'',from,to,
        origin:after?.effective_meta?.[key]?.origin||'turno_importato'
      });
    });
    return changes.sort((x,y)=>x.date.localeCompare(y.date)||x.agentName.localeCompare(y.agentName,'it'));
  }

  async function readServer(force=false){
    if(!force){const local=readLocal();if(local)return local;}
    if(pendingRead)return pendingRead;
    pendingRead=request('GET',NODE).then(value=>value?.data&&value?.meta?writeLocal(value):null).finally(()=>{pendingRead=null;});
    return pendingRead;
  }
  async function saveServer(snapshot){
    await request('PUT',NODE,snapshot);
    writeLocal(snapshot);
    window.dispatchEvent(new CustomEvent('navisuite:effective-schedule-updated',{detail:snapshot.meta}));
    return snapshot;
  }

  let originalLoad=null;
  let originalLoadBase=null;
  let originalSaveAdminUpdates=null;

  async function rebuild(reason='admin-save'){
    if(pendingRebuild)return pendingRebuild;
    pendingRebuild=(async()=>{
      if(!originalLoad)throw new Error('NaviSharedData non disponibile');
      const previous=await readServer(true).catch(()=>readLocal());
      const source=await originalLoad('',{force:true});
      const snapshot=materialize(source,previous,reason);
      await saveServer(snapshot);
      return snapshot;
    })().finally(()=>{pendingRebuild=null;});
    return pendingRebuild;
  }

  async function effectiveLoad(url='',options={}){
    const force=Boolean(options?.force);
    try{
      const snapshot=await readServer(force);
      if(snapshot?.data)return clone(snapshot.data);
    }catch(error){console.warn('Turno effettivo: lettura server non disponibile',error);}
    const local=readLocal();
    if(local?.data)return clone(local.data);
    if(!originalLoad)throw new Error('Dati turni non disponibili');
    return originalLoad(url,options);
  }

  function install(){
    if(installed)return true;
    if(!window.NaviSharedData?.load)return false;
    originalLoad=window.NaviSharedData.load.bind(window.NaviSharedData);
    originalLoadBase=(window.NaviSharedData.loadBase||window.NaviSharedData.load).bind(window.NaviSharedData);
    window.NaviSharedData.load=effectiveLoad;
    window.NaviSharedData.loadBase=effectiveLoad;
    window.NaviSharedData.effective=()=>readLocal()?.meta||null;
    window.NaviSharedData.rebuildEffective=rebuild;

    if(window.NaviAdminFirebase?.saveAdminUpdates){
      originalSaveAdminUpdates=window.NaviAdminFirebase.saveAdminUpdates.bind(window.NaviAdminFirebase);
      window.NaviAdminFirebase.saveAdminUpdates=async payload=>{
        const result=await originalSaveAdminUpdates(payload);
        try{await rebuild('admin-save');}
        catch(error){console.error('Turno effettivo: rigenerazione dopo salvataggio non riuscita',error);throw error;}
        return result;
      };
    }
    installed=true;
    return true;
  }

  window.NaviEffectiveSchedule={
    install,rebuild,load:effectiveLoad,read:readServer,materialize,diff,
    cache:readLocal,cutoff:CUTOFF,schemaVersion:SCHEMA_VERSION
  };

  if(!install()){
    let tries=0;const timer=setInterval(()=>{tries+=1;if(install()||tries>100)clearInterval(timer);},25);
  }
})();
