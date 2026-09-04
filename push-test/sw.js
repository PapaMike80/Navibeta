const TEST_VERSION='navisuite-push-test-v4';

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Mantiene il test locale come diagnostica/fallback.
self.addEventListener('message',event=>{
  if(event.data?.type!=='NAVISUITE_DELAYED_NOTIFICATION_TEST')return;
  event.waitUntil((async()=>{
    await delay(8000);
    await self.registration.showNotification('NaviSuite · Test locale',{
      body:'Il Service Worker locale funziona correttamente ✅',
      icon:'../assets/images/icona_apple_180.png',
      badge:'../assets/images/icona_apple_180.png',
      tag:'navisuite-iphone-local-test-v4',
      data:{url:'./index.html'}
    });
  })());
});

// Vero Web Push remoto: questo evento viene risvegliato dal push service
// anche quando la PWA non è aperta.
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload={};
    if(event.data){
      try{payload=event.data.json();}
      catch(_){payload={body:event.data.text()};}
    }

    const title=payload.title||'NaviSuite';
    const options={
      body:payload.body||'Nuova notifica NaviSuite',
      icon:payload.icon||'../assets/images/icona_apple_180.png',
      badge:payload.badge||'../assets/images/icona_apple_180.png',
      tag:payload.tag||'navisuite-remote-push',
      renotify:payload.renotify!==false,
      data:{
        url:payload.url||'../oggi.html',
        ...(payload.data&&typeof payload.data==='object'?payload.data:{})
      }
    };

    await self.registration.showNotification(title,options);
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const relative=event.notification?.data?.url||'./index.html';
    const target=new URL(relative,self.registration.scope).href;
    const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clientsList){
      if('focus' in client){
        try{await client.navigate(target);}catch(_){ }
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
