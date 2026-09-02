# NaviSuite V2 — calendario personale iPhone / Google

La funzione calendario della V2 usa un feed iCalendar (`.ics`) dinamico generato da PocketBase.

## Cosa include

Ogni agente riceve un link personale che espone solo i propri eventi. Per ogni giorno il feed può includere:

- servizio effettivo da `turni_effective`;
- nave;
- equipaggio;
- ormeggio serale;
- rifornimento.

Le preferenze si gestiscono da `v2/impostazioni.html`.

Il link usa un token casuale di 56 caratteri. La rigenerazione invalida immediatamente il link precedente.

## Installazione PocketBase

1. Eseguire la migration:

```bash
./pocketbase migrate up --migrationsDir=/pb_migrations
```

2. Rendere disponibile al container PocketBase il file:

```text
pocketbase/pb_hooks/calendar.pb.js
```

nella directory configurata come `--hooksDir` (normalmente `/pb_hooks`).

3. Riavviare PocketBase se il volume/hooks non usa l'hot reload.

## URL pubblico e Google Calendar

iPhone può usare il feed attraverso un hostname raggiungibile dal dispositivo, incluso Tailscale quando la tailnet è attiva.

Google Calendar, invece, aggiorna i calendari in abbonamento dai server Google. Un hostname raggiungibile solo all'interno della tailnet non è sufficiente.

Per Google configurare un endpoint HTTPS pubblico e impostare nel container PocketBase:

```text
NAVISUITE_CALENDAR_PUBLIC_BASE_URL=https://calendario.example.it
```

Il valore deve essere il solo origin pubblico, senza slash finale. È consigliato pubblicare esclusivamente le route `/api/navisuite/v2/calendar/*.ics` e non l'intero pannello PocketBase.

## Endpoint

Autenticati:

- `GET /api/navisuite/v2/calendar/settings`
- `POST /api/navisuite/v2/calendar/settings`
- `POST /api/navisuite/v2/calendar/regenerate`

Tokenizzati:

- `GET /api/navisuite/v2/calendar/{token}.ics`
- `GET /api/navisuite/v2/calendar/{token}.ics?download=1`

Il feed usa UID stabili per `agente + data` e `SEQUENCE` derivata dalla versione di `turni_effective`, così i client possono aggiornare lo stesso evento quando cambia il turno.
