# NaviSuite — architettura PocketBase

Stato: **preparazione su NaviBeta, nessuno switch eseguito**. Schema verificato per PocketBase **v0.40.1**. NaviSuite di produzione è esclusa da questa sperimentazione.

## 1. Decisioni architetturali

- Le entità giornaliere usano un record per agente e data (`turni`, `diaria`).
- Le durate sono minuti interi: `09:25 = 565`, `08:00 = 480`, `00:30 = 30`.
- `ore_lavorate_minuti` è indipendente da `ore_servizio_minuti`: può essere inferiore e non esiste un vincolo contrario.
- Ritardo, cambio e sentine restano campi della `diaria`: il codice attuale ha esattamente tre componenti, quindi una relazione uno-a-molti sarebbe complessità inutile.
- Totali settimanali/mensili, straordinario complessivo, ticket da liquidare e simili sono calcolabili e non vengono duplicati.
- I valori manuali necessari sono conservati tramite campi dedicati e `override_manuale`.
- I file dei documenti usano il campo `file` nativo PocketBase; i Data URL Firebase saranno decodificati solo nella futura migrazione reale.
- Ogni dato migrabile mantiene `legacy_id`; i payload eterogenei più delicati mantengono anche `legacy_payload` per audit temporaneo.
- Le API Rules sono chiuse per impostazione predefinita. Le credenziali Superuser sono esclusivamente variabili d’ambiente del migratore.

```text
users (AUTH)
  └── agenti
       ├── turni ─────── importazioni_turni
       ├── diaria             └── variazioni
       ├── cambi_turno
       ├── attivita_utenti
       └── segnalazioni

navi
  ├── requisiti_equipaggio_nave
  └── turni_navi
       └── equipaggi_turno_nave

documenti   annunci   configurazione
periodi_bozza   stati_settimana   correzioni_quiz
log_migrazione
```

## 2. Inventario Firebase verificato nel repository

Sono stati individuati **26 nodi logici** (i path con `{id}` sono famiglie dinamiche). Le chiamate sono concentrate in `assets/js/admin-firebase-rest.js`, con implementazione parallela più piccola in `assets/js/firebase-data.js`; `assets/js/shared-data.js` legge il calendario pubblico.

| Path | Struttura/uso | Lettura | Scrittura | Natura e destinazione |
|---|---|---|---|---|
| `public/schedule` | calendario, date, residenze, agenti e settimane | `shared-data.js:load` | non nel repository | Corrente; `agenti`, `turni` |
| `private/changeRequests/{id}` | richiesta cambio | `listChangeRequests` | `saveChangeRequest`, `deleteChangeRequest` | Storico; `cambi_turno` |
| `private/adminUpdates/ownerUid` | UID anonimo proprietario legacy | `getAdminUpdates` | `saveAdminUpdates` | Legacy, non migrare |
| `private/adminUpdates/updatedAt` | timestamp aggregato | `getAdminUpdates` | molte scritture admin | Duplicato; sostituito da timestamp record |
| `private/adminUpdates/odsVariations` | array variazioni ODS | `getAdminUpdates` | `saveAdminUpdates` | Storico; `variazioni` |
| `private/adminUpdates/manualVariations` | array variazioni manuali | `getAdminUpdates` | `saveAdminUpdates` | Storico; `variazioni` |
| `private/adminUpdates/baristas` | turni/variazioni baristi | `getBaristaUpdates` | `saveBaristaUpdates` | Corrente; `turni`/`variazioni` secondo payload |
| `private/adminUpdates/approvedChangeRequests` | copie/marker approvazioni | `getAdminUpdates` | `saveAdminUpdates` | Duplicato; stato `approved` in `cambi_turno` |
| `private/adminUpdates/deletedChangeRequests/{id}` | tombstone cancellazioni | `listChangeRequests` | fallback di `deleteChangeRequest` | Legacy; stato `cancelled` |
| `private/adminUpdates/dismissedOdsApprovals` | marker proposte ignorate | `getAdminUpdates` | `saveAdminUpdates` | Stato di `variazioni` |
| `private/adminUpdates/scheduleImports` | metadati import | `getAdminUpdates` | `saveAdminUpdates` | Storico; `importazioni_turni` |
| `private/adminUpdates/turniNavi` | array assegnazioni nave | `getAdminUpdates` | `saveAdminUpdates` | Corrente; `turni_navi` |
| `private/adminUpdates/agentProfiles/{id}` | override nome/ruolo/grado/residenza | `getAdminUpdates`, `getAgentAdminData` | `saveAgentProfile` | Configurazione; `agenti` |
| `private/adminUpdates/shipConfigurations` | grande JSON configurazione navi | `getShipConfigurations` | `saveShipConfigurations` | Configurazione; `navi`, `requisiti_equipaggio_nave` |
| `private/adminUpdates/gestioneNaviConfig` | fallback legacy navi | `getShipConfigurations` | fallback `saveShipConfigurations` | Legacy; stesso mapping sopra |
| `private/adminUpdates/announcements` | mappa annunci | `getAnnouncements` | `saveAnnouncements` | Corrente/storico; `annunci` |
| `private/adminUpdates/draftPeriod` | `{start,end,updatedAt,ownerUid}` | `getDraftPeriod` | save/reset | Configurazione; `periodi_bozza` |
| `private/adminUpdates/documentsMeta/{id}` | metadati documento | `getAdminDocuments` | save/delete | Corrente; `documenti` |
| `private/adminUpdates/documentsFiles/{id}` | `{dataUrl}` Base64 | `getAdminDocumentFile` | save/delete | Corrente ma inefficiente; file PocketBase |
| `private/adminUpdates/userRegistry/{id}` | anagrafica accessi e ultima pagina | `recordUserAccess`, liste admin | put/delete/import | Duplicato parziale; `agenti`, `attivita_utenti` |
| `private/adminUpdates/userAuth/{id}` | hash PIN e PIN iniziale | `firebase-auth.js` | save/reset | Credenziali legacy; **non copiare come password PB** |
| `private/adminUpdates/weekStatuses/{date}` | bozza/ufficiale | `getWeekStatuses` | `saveWeekStatuses` | Configurazione; `stati_settimana` |
| `private/adminUpdates/userPresence/{agent}/{uid}` | heartbeat dispositivi | `listUserPresence` | `touchUserPresence` frequente | Effimero; collassare in `attivita_utenti` |
| `private/adminUpdates/quizCorrections` | mappa risposte e audit | `getQuizCorrections` | `saveQuizCorrections` | Configurazione; `correzioni_quiz` |
| `private/adminUpdates/feedbackTickets/{id}` | segnalazioni utenti | lista | create/update/delete | Storico; `segnalazioni` |
| `private/adminUpdates/diaria/{agent}` | archivio `entries[]`, checksum, versione | load singolo/tutti | `saveDiaria` | Storico critico; un record `diaria` per entry |
| `private/adminUpdates/diariaBackups/{agent}/{id}` | copie fino a 35 versioni | `keepDiariaBackup` | create/prune | Backup legacy; non dati correnti, esportare separatamente se richiesto |
| `private/adminUpdates/legacyUsersImportedAt` | marker import legacy | `getAgentAdminData` | `importLegacyUsers` | Legacy; non migrare |

Nota: il totale tabellare supera 26 righe perché alcuni nodi fallback/marker sono documentati separatamente; le aree funzionali censite sono 26.

## 3. Collection e campi

La definizione eseguibile campo-per-campo è `pocketbase/pb_migrations/1788134400_navisuite_initial_schema.js`. Sintesi:

| Collection | Chiave/relazioni | Campi funzionali principali |
|---|---|---|
| `users` (auth) | email nativa | nome visualizzato, ruolo, attivo |
| `agenti` | `user`, unique `legacy_id` | nome/cognome/completo, matricola, grado, residenza, ruolo, attivo, permessi speciali |
| `turni` | unique `agente+data`; importazione | servizio, codice, nave, residenza, origine, stato, variazione, precedente, trasferta, note |
| `diaria` | unique `agente+data`; turno | servizio, minuti servizio/lavorati, override, 3 componenti straordinario, banca, indennità e flag |
| `cambi_turno` | unique `legacy_id`; richiedente/collega | date/turni, stato unico, timestamp del ciclo di vita, approvatore |
| `importazioni_turni` | unique hash | file/tipo/stato/periodo, contatori, metadati |
| `variazioni` | agente/importazione/cambio | data, da/a servizio, origine, stato |
| `navi` | unique nome | residenza, attiva, note |
| `requisiti_equipaggio_nave` | nave | servizio, grado, quantità, ordine |
| `turni_navi` | unique nave+data+servizio | ormeggio, rifornimento, importazione |
| `equipaggi_turno_nave` | turno nave+agente | grado assegnato, sostituzione |
| `documenti` | autore | titolo, descrizione, categoria, file nativo, pubblicazione, visibilità |
| `annunci` | autore | titolo, testo, pubblicazione/scadenza, priorità, visibilità |
| `configurazione` | unique chiave | valore JSON piccolo, descrizione, audit |
| `periodi_bozza` | un solo attivo | inizio/fine, audit |
| `attivita_utenti` | unique agente | ultimo accesso, ultima pagina, ultimo contatto; nessuno storico infinito |
| `segnalazioni` | autore | categoria, area, titolo, descrizione, stato, nota admin, date |
| `stati_settimana` | unique data inizio | stato, audit |
| `correzioni_quiz` | unique quiz | risposte JSON, audit |
| `log_migrazione` | esecuzione | fase, collection, legacy ID, esito, messaggio, dettagli |

### Dati persistiti e calcolabili della Diaria

Persistiti: servizio acquisito/override, minuti servizio, minuti lavorati, flag override, ritardo/cambio/sentine, banca ore, diaria, pernotto, festività, ticket, imbarco, aliscafo, presenza, trasferta, rifornimento, Par. 139, maneggio denaro e note.

Calcolabili: straordinario totale (`ritardo+cambio+sentine`), ore teoriche del servizio se disponibili dalla configurazione, totali settimana/mese, superamento 39 ore, conteggi ticket e indennità. Non sono memorizzati per evitare divergenze.

## 4. Sicurezza e autenticazione

- `null` significa accesso negato. Il Superuser PocketBase bypassa le rules e resta solo lato server.
- Gli agenti autenticati leggono il calendario condiviso (`agenti`, `turni`, navi) perché questa visibilità è richiesta dall’app attuale.
- La Diaria è visibile/modificabile solo al proprietario (`agente.user`) e agli admin.
- Un cambio è visibile ai due agenti coinvolti e agli admin.
- Segnalazioni e attività personali sono limitate al proprietario; l’elenco completo è admin.
- Configurazioni, import, navi e pubblicazioni sono scrivibili solo da admin/super user.
- La creazione di account `users` è negata via API pubblica. Il provisioning futuro richiederà flusso amministrativo lato server.
- Il cambio del campo `role` è impedito all’utente ordinario; non è possibile auto-promuoversi.
- Gli hash PIN Firebase e soprattutto `initialPin` non vanno convertiti in password PocketBase. Gli utenti riceveranno credenziali tramite una procedura separata.

Le rules coprono lo schema futuro; prima dello switch vanno testate con account reali agente/admin e con l’eccezione Hiba ricavata in `permessi_speciali`.

## 5. Installazione migration su TrueNAS

1. Eseguire il backup consistente descritto sotto.
2. Copiare `pocketbase/pb_migrations/1788134400_navisuite_initial_schema.js` nella directory `pb_migrations` usata dal container. Se il volume monta solo `/pb_data`, montare anche una directory persistente per `/pb_migrations`, oppure copiare il file nel filesystem del container prima dell’avvio.
3. Arrestare temporaneamente il container PocketBase se si applica manualmente la migration.
4. Eseguire, nella directory dell’eseguibile: `./pocketbase migrate up --migrationsDir=/pb_migrations`.
5. Riavviare PocketBase e controllare dal pannello che siano presenti le 20 collection NaviSuite.
6. Non configurare ancora NaviSuite con l’URL PocketBase.

PocketBase applica automaticamente le migration non eseguite anche al comando `serve`; l’esecuzione manuale rende però più leggibile questa prima installazione.

## 6. Backup consistente

Il volume dati resta `/mnt/nas/pocketbase-data` e non viene modificato dagli script.

Procedura prudente:

1. fermare il container PocketBase per evitare una copia SQLite incoerente;
2. creare uno snapshot ZFS del dataset che contiene `/mnt/nas/pocketbase-data` (scelta consigliata su TrueNAS), oppure copiarne integralmente il contenuto in una destinazione datata;
3. verificare che il backup contenga almeno il database in `pb_data` e la directory dei file;
4. riavviare il container;
5. annotare snapshot e data nel verbale di migrazione.

Non usare una copia del solo file SQLite mentre PocketBase sta scrivendo. Se si usa la funzione backup nativa dal pannello/API, verificare il completamento prima di applicare le migration.

## 7. Migratore Firebase → PocketBase

Il migratore si trova in `pocketbase/migrate-firebase`. Firebase viene solo letto tramite:

- un export JSON offline (`FIREBASE_EXPORT_FILE`, consigliato); oppure
- una richiesta HTTP `GET` alla radice con URL/token forniti dall’operatore.

Non esiste codice `PUT`, `PATCH`, `POST` o `DELETE` verso Firebase. Il target PocketBase viene scritto solo con il flag esplicito `--execute`; senza flag il comportamento è dry-run.

Preparazione:

```bash
cd pocketbase/migrate-firebase
cp .env.example .env.local
# esportare le variabili con lo strumento preferito; il programma non carica .env automaticamente
node src/cli.js --dry-run
```

Il dry-run legge e trasforma, poi stampa i conteggi per collection senza autenticarsi a PocketBase. Attualmente il trasformatore eseguibile copre le aree più critiche e verificabili (`agenti`, `diaria`, `cambi_turno`, `segnalazioni`); il mapping delle altre aree è definito nello schema e va completato/testato su un export reale prima dell’importazione autorizzata.

Solo dopo verifica separata:

```bash
node src/cli.js --execute
```

L’esecuzione usa `legacy_id` per upsert, risolve le relazioni agente, salva un checkpoint dopo ogni record e può riprendere senza duplicare i record già completati. Gli errori vengono registrati nel checkpoint e interrompono la fase per evitare una migrazione silenziosamente parziale.

## 8. Verifica, rollback e criteri di accettazione

Prima di uno switch futuro:

1. confrontare conteggi per agente/data e intervallo temporale;
2. controllare duplicati sugli indici univoci;
3. campionare RIP, LAV, MAL, terra, corse e variazioni;
4. verificare Diaria DT 565 minuti con 480 lavorati;
5. confrontare somme delle tre componenti straordinario;
6. aprire file documento migrati e confrontare hash/dimensioni;
7. provare rules con agente, admin e utente speciale;
8. mantenere Firebase read-only come fonte e non cancellarlo.

Rollback dello schema vuoto: `./pocketbase migrate down 1 --migrationsDir=/pb_migrations`. Se sono già stati importati dati, fermare PocketBase e ripristinare lo snapshot/backup completo. Il rollback applicativo futuro consisterà nel lasciare la configurazione frontend su Firebase; questa fase non l’ha modificata.

## 9. Conferme di perimetro

- NaviBeta continua a utilizzare Firebase finché i test PocketBase non saranno conclusi.
- NaviSuite di produzione non è stata modificata.
- Nessun file runtime HTML/JS/CSS di NaviBeta è stato modificato in questa fase.
- Firebase non è stato scritto o cancellato.
- Nessun dato è stato importato in PocketBase.
- Login e autenticazione NaviSuite non sono stati modificati.
- Nessun endpoint PocketBase è stato hardcodato nel frontend.
- Nessuna credenziale Superuser è presente nel repository.

## 10. Riferimenti di compatibilità

La migration segue la sintassi JS ufficiale PocketBase 0.40.1: directory `pb_migrations`, callback `migrate(up, down)`, `new Collection(...)`, indici SQL e applicazione con `migrate up`. Riferimenti: documentazione ufficiale PocketBase “JS Migrations” e “JS Collection operations”.
