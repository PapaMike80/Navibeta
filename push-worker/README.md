# NaviSuite Push Worker (TrueNAS)

Worker Web Push always-on per NaviBeta. Legge la stessa coda Firebase usata dalla PWA (`private/adminUpdates/pushQueue`) e invia le notifiche senza dipendere dal cron di GitHub Actions.

## Caratteristiche

- polling predefinito ogni 5 secondi;
- usa le sottoscrizioni già registrate dalla PWA;
- rispetta le preferenze `tomorrowSummary`, `shiftChanges`, `ods`;
- claim atomico Firebase tramite ETag per ridurre il rischio di doppi invii;
- rimuove automaticamente sottoscrizioni scadute (HTTP 404/410);
- recupera elementi rimasti in `processing` dopo un crash;
- mantiene la sessione Firebase in `/data/firebase-auth.json`;
- non espone nessuna porta: TrueNAS deve solo avere accesso Internet in uscita.

## Installazione su TrueNAS

```bash
mkdir -p /mnt/nas/navisuite-push
cd /mnt/nas/navisuite-push

git clone https://github.com/PapaMike80/Navibeta.git repo
cd repo/push-worker
cp .env.example .env
```

Modificare `.env` e inserire **localmente** `VAPID_PRIVATE_KEY` con la stessa chiave privata associata alla public key già usata da NaviBeta. Non pubblicare né committare `.env`.

Poi avviare:

```bash
docker compose up -d --build
```

Controllare:

```bash
docker ps --filter name=navisuite-push-worker
docker logs --tail 100 -f navisuite-push-worker
```

All'avvio deve comparire qualcosa come:

```text
[push-worker] NaviSuite Push Worker avviato · polling 5000 ms
[push-worker] attivo · polling 5000 ms
```

Quando viene messo un test in coda:

```text
[push-worker] 1 notifiche da processare
[push-worker] PUSH_... -> 92/iPhone: 201
```

## Aggiornamento

```bash
cd /mnt/nas/navisuite-push/repo
git pull
cd push-worker
docker compose up -d --build
```

## Nota GitHub Actions

Il workflow `.github/workflows/push-queue.yml` può restare temporaneamente come fallback durante i test. Dopo aver verificato il worker TrueNAS, conviene togliere il trigger `schedule` di GitHub e lasciare soltanto l'avvio manuale di emergenza, per evitare possibili gare tra due worker.
