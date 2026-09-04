const TEST_VERSION='navisuite-push-test-v3';

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

self.addEventListener('message',event=>{
  if(event.data?.type!=='NAVISUITE_DELAYED_NOTIFICATION_TEST')return;
  event.waitUntil((async()=>{
    await delay(8000);
    await self.registration.showNotification('Domani · D3',{
      body:'07:00–19:20 · Equipaggio: Tibiletti, Costamagna, Paiola, Chiminelli, Pedroni',
      icon:'../assets/images/icona_apple_180.png',
      badge:'../assets/images/icona_apple_180.png',
      tag:'navisuite-iphone-background-test-v3',
      data:{url:'./index.html'}
    });
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL('./index.html',self.registration.scope).href;
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
