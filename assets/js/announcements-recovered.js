(function(){
  const path=location.pathname;
  const effectivePage=/(?:^|\/)(?:naviturni|cambi_turno|aggiornamenti)\.html$/i.test(path);

  // In Beta Turni/Cambi/Aggiornamenti usano la vista materializzata "turno effettivo".
  // Durante il parsing la carichiamo in modo sincrono, così NaviTurni non parte
  // prima con il calendario base per poi ridisegnarsi con ODS/bozza/manuali.
  if(effectivePage&&!window.NaviEffectiveSchedule){
    if(document.readyState==='loading'){
      document.write('<script src="assets/js/effective-schedule.js?v=20260905-1"><\/script>');
    }else{
      const effective=document.createElement('script');
      effective.src='assets/js/effective-schedule.js?v=20260905-1';
      effective.async=false;
      document.head.appendChild(effective);
    }
  }

  // Compatibilità: se il materiale effettivo non esiste ancora, NaviTurni
  // continua ad avere come fallback il dataset completo e mai il solo base.
  if(/(?:^|\/)naviturni\.html$/i.test(path)&&window.NaviSharedData?.loadBase&&window.NaviSharedData?.load&&!window.NaviSharedData.__naviturniCompleteFirst){
    const loadComplete=window.NaviSharedData.load.bind(window.NaviSharedData);
    window.NaviSharedData.loadBase=(url,options={})=>loadComplete(url,options);
    window.NaviSharedData.__naviturniCompleteFirst=true;
  }

  const load=(src,onload)=>{
    const script=document.createElement('script');
    script.src=src;
    script.async=false;
    if(onload)script.addEventListener('load',onload,{once:true});
    document.head.appendChild(script);
  };
  load('assets/js/announcements-core-20260903.js?v=1');
  load('assets/js/turn-pdf-import-repair-v2.js?v=20260903-2');
  load('assets/js/ods-navi-pdf-repair.js?v=20260904-1');

  // Bootstrap controllato: appena un amministratore apre Aggiornamenti,
  // se il turno effettivo non è ancora stato creato lo generiamo dai dati
  // correnti. I salvataggi successivi lo rigenerano automaticamente.
  if(/(?:^|\/)aggiornamenti\.html$/i.test(path)){
    setTimeout(async()=>{
      try{
        const profile=JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');
        const admin=['91','92'].includes(String(profile?.id||''))||String(profile?.role||'').toLowerCase()==='admin';
        if(!admin||!window.NaviEffectiveSchedule)return;
        const current=await window.NaviEffectiveSchedule.read(true).catch(()=>null);
        if(!current)await window.NaviEffectiveSchedule.rebuild('bootstrap');
      }catch(error){console.warn('Bootstrap turno effettivo non completato',error);}
    },250);
  }

  // Le notifiche reali vengono caricate solo nelle Impostazioni, così le altre
  // pagine NaviSuite non ricevono codice o richieste di rete aggiuntive.
  if(/(?:^|\/)impostazioni\.html$/i.test(path)){
    load('assets/js/push-notifications.js?v=20260905-1');
    load('assets/js/push-settings.js?v=20260905-1');
  }
})();
