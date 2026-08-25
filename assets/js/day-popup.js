(function(){
  const DEFAULTS={D1:'13:00',D2:'11:25',D3:'13:20',D4:'13:15',T1:'13:35',T2:'12:29',M1:'13:30',R1:'13:15',R2:'13:15',R3:'12:20',R4:'12:40',CAR1:'12:10',P1:'12:45',P2:'13:05',P3:'12:55',CAP1:'12:55',CAP:'12:55',SR1:'12:15',BIS:'12:15',AGB:'10:25',POND:'09:25',DT:'09:25',PT:'09:30',AGM:'09:45',AGT:'11:10',PONM:'10:25',LD:'08:00','F.P.':'08:00',TERRA:'08:00',LAV:'08:00'};
  const ROWS=[
    {key:'worked',label:'Ore lavorate',kind:'time'}, {key:'delay',label:'Straordinario',kind:'minutes'},
    {key:'bank',label:'Banca ore',kind:'minutes'}, {key:'ticketPresence',label:'Buono',kind:'toggle'},
    {key:'allowanceRate',label:'Diaria',kind:'allowance'}, {key:'overnight40',label:'Pernotto',kind:'toggle'},
    {key:'holidayWorked',label:'Festività',kind:'toggle'}, {key:'secondMeal',label:'2° ticket',kind:'toggleNumber'},
    {key:'embark',label:'Imbarco',kind:'toggle'}, {key:'refuel',label:'Rifornimento',kind:'toggle'},
    {key:'hydrofoil',label:'Aliscafo',kind:'toggleNumber'}
  ];
  let state=null,scrollY=0;
  const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const minutes=value=>{const parts=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return parts?Number(parts[1])*60+Number(parts[2]):0};
  const clock=value=>`${String(Math.floor(Math.max(0,value)/60)).padStart(2,'0')}:${String(Math.max(0,value)%60).padStart(2,'0')}`;
  const isWorking=shift=>!['','RIP','RIPOSO','MALATTIA'].includes(String(shift||'').trim().toUpperCase());
  function modal(){
    let root=document.getElementById('sharedDayPopup');
    if(root)return root;
    root=document.createElement('div');root.id='sharedDayPopup';root.className='weekly-edit-overlay shared-day-popup';root.hidden=true;
    root.innerHTML='<section class="weekly-edit-dialog monthly-bubble-dialog" role="dialog" aria-modal="true" aria-labelledby="sharedDayTitle"><button type="button" class="weekly-edit-close" data-close aria-label="Chiudi">✕</button><small>GIORNATA</small><h3 id="sharedDayTitle"></h3><div data-content><div class="shared-day-loading"><i></i><span>Caricamento giornata…</span></div></div><div class="monthly-bubble-actions"><button type="button" class="weekly-edit-cancel" data-close>Chiudi</button></div></section>';
    root.addEventListener('click',event=>{if(event.target===root||event.target.closest('[data-close]'))close();const button=event.target.closest('[data-day-field]');if(button&&!button.disabled)edit(button.dataset.dayField)});
    document.body.appendChild(root);return root;
  }
  function serviceConfiguration(configs,residence,shift){
    const code=String(shift||'').trim(),upper=code.toUpperCase(),saved=configs?.[String(residence||'').toUpperCase()]?.[code]||configs?.[String(residence||'').toUpperCase()]?.[upper]||{};
    const fallback=DEFAULTS[upper]||'';
    const hours=Number(saved.hours);return {...saved,duration:Number.isFinite(hours)&&hours>0?clock(Math.round(hours*60)):fallback};
  }
  function value(row,e){
    if(row.key==='worked'){const v=Number.isFinite(Number(e.workedMinutes))?Number(e.workedMinutes):Math.max(0,state.serviceMinutes+(Number(e.delay)||0));return isWorking(e.shift)?clock(v):''}
    if(row.kind==='minutes')return Number(e[row.key])?`+${clock(Number(e[row.key]))}`:'';
    if(row.kind==='allowance')return Number(e.allowanceRate)?`${Number(e.allowanceRate)}%`:'';
    if(row.kind==='toggleNumber')return Number(e[row.key])>0?'Sì':'';
    return e[row.key]?'Sì':'';
  }
  function render(){
    if(!state?.entry)return;
    const e=state.entry,ship=String(state.ship||'').trim(),duration=state.duration||'',title=[e.shift||state.shift,ship].filter(Boolean).join(' · ');
    modal().querySelector('[data-content]').innerHTML=`<button type="button" class="weekly-service has-service" style="--shift-color:#2dd4bf" disabled><strong>${esc(title)}</strong>${duration?`<small>${esc(duration)}</small>`:''}</button><div class="weekly-bubble-grid">${ROWS.map(row=>{const v=value(row,e);return `<button type="button" class="weekly-bubble${v?' has-value':' is-empty'}" data-day-field="${row.key}"><span>${esc(row.label)}</span><strong>${esc(v||'—')}</strong></button>`}).join('')}</div>`;
  }
  async function load(){
    try{
      await window.NaviAdminFirebase.ready;
      const [archive,configs]=await Promise.all([NaviAdminFirebase.loadDiaria(state.agentId),NaviAdminFirebase.getServiceConfigurations?.()||{}]);
      if(!state||state.closed)return;
      state.entries=Array.isArray(archive.entries)?archive.entries:[];
      const existing=state.entries.find(item=>String(item.date).slice(0,10)===state.date);
      const competence=serviceConfiguration(configs,state.residence,state.shift);state.duration=competence.duration||state.duration;state.serviceMinutes=minutes(state.duration);
      state.entry=existing?{...existing}:{id:crypto.randomUUID(),date:state.date,shift:state.shift,serviceMinutes:state.serviceMinutes,delay:0,bank:0,allowanceRate:competence.allowance?Number(competence.allowanceRate||24):null,overnight40:false,holidayWorked:false,ticketPresence:!!competence.meal,mealUsed:!!competence.meal,secondMeal:0,embark:!!competence.embark,hydrofoil:0,refuel:false,manualOverride:false,imported:true};
      state.isNew=!existing;render();
    }catch(error){if(state&&!state.closed)modal().querySelector('[data-content]').innerHTML='<div class="shared-day-error">Giornata non disponibile. Riprova.</div>';console.warn('Scheda giornata non disponibile',error)}
  }
  async function save(){
    if(!state?.entry)return;const content=modal().querySelector('[data-content]');content.classList.add('is-saving');
    try{
      const draft={...state.entry,imported:false};
      if(state.isNew)state.entries.push(draft);else Object.assign(state.entries.find(item=>item.id===draft.id)||state.entries.find(item=>item.date===draft.date),draft);
      await NaviAdminFirebase.saveDiaria(state.agentId,state.entries);state.entry=draft;state.isNew=false;
    }catch(error){alert('La modifica non è stata salvata. Riprova.');console.warn(error)}finally{content.classList.remove('is-saving')}
  }
  function edit(key){
    const row=ROWS.find(item=>item.key===key),e=state?.entry;if(!row||!e)return;
    if(row.kind==='toggle'){e[key]=!e[key];if(key==='ticketPresence')e.mealUsed=e[key];render();save();return}
    if(row.kind==='toggleNumber'){e[key]=Number(e[key])>0?0:1;render();save();return}
    if(row.kind==='allowance'){const next=prompt('Diaria (0, 9, 24 o 50%)',String(Number(e.allowanceRate)||0));if(next===null)return;const rate=Number(next);if(![0,9,24,50].includes(rate))return alert('Inserisci 0, 9, 24 o 50.');e.allowanceRate=rate||null;render();save();return}
    if(row.kind==='time'){const current=value(row,e)||state.duration||'00:00',next=prompt('Ore lavorate (hh:mm)',current);if(next===null)return;const worked=minutes(next);if(!/^\d{1,2}:\d{2}$/.test(next)||Number(next.split(':')[1])>59)return alert('Inserisci le ore nel formato hh:mm.');e.workedMinutes=worked;e.delay=worked-state.serviceMinutes;render();save();return}
    const next=prompt(`${row.label} in minuti`,String(Number(e[key])||0));if(next===null)return;const amount=Math.max(0,Math.round(Number(next)||0));e[key]=amount;if(key==='delay')e.workedMinutes=state.serviceMinutes+amount;render();save();
  }
  function open(options){
    close();scrollY=window.scrollY;state={...options,date:String(options.date||'').slice(0,10),shift:String(options.shift||''),closed:false,entry:null,entries:[],serviceMinutes:minutes(options.duration)};
    const root=modal();root.querySelector('h3').textContent=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${state.date}T12:00:00`));root.querySelector('[data-content]').innerHTML='<div class="shared-day-loading"><i></i><span>Caricamento giornata…</span></div>';root.hidden=false;
    document.body.classList.add('weekly-dialog-open');document.body.style.top=`-${scrollY}px`;document.body.style.position='fixed';document.body.style.width='100%';load();
  }
  function close(){if(state)state.closed=true;const root=document.getElementById('sharedDayPopup');if(root)root.hidden=true;document.body.classList.remove('weekly-dialog-open');document.body.style.position='';document.body.style.top='';document.body.style.width='';if(scrollY)window.scrollTo(0,scrollY)}
  window.NaviDayPopup={open,close};
})();
