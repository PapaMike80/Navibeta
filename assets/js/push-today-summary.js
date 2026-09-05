(function(){
  'use strict';
  if(!/(?:^|\/)impostazioni\.html$/i.test(location.pathname))return;

  const todayRome=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'});
  const addDays=(iso,days)=>{const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days,12)).toISOString().slice(0,10);};

  function apply(){
    const pref=document.getElementById('push-pref-tomorrow');
    if(pref){
      const copy=pref.closest('.switch-row')?.querySelector('.switch-copy');
      const strong=copy?.querySelector('strong');
      const span=copy?.querySelector('span');
      if(strong)strong.textContent='Riepilogo giornata di oggi';
      if(span)span.textContent='Servizio, nave, equipaggio, ormeggio e rifornimento della giornata corrente.';
    }

    const input=document.getElementById('push-admin-date');
    if(!input)return false;
    if(input.dataset.todayDefaultApplied==='1')return true;

    const today=todayRome();
    const tomorrow=addDays(today,1);
    if(!input.value||input.value===tomorrow){
      input.value=today;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    input.dataset.todayDefaultApplied='1';
    return true;
  }

  async function install(){
    for(let i=0;i<100;i++){
      if(apply())return;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
