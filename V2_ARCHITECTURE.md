# NaviSuite V2 — PocketBase-only architecture

## Goal

NaviSuite V2 must have no Firebase runtime dependency. Firebase remains only a frozen legacy source during the transition and may be imported through explicit delta jobs.

Target cutover: 15 days from 2026-09-01.

## Core rule

Every operational page reads the already-resolved current shift from `turni_effective`.

The application must never rebuild the current shift at page load by merging base schedule + ODS + manual variations + approved swaps.

Historical/source collections remain append-only/auditable; `turni_effective` is the materialized operational truth.

## Shift model

### `importazioni_turni`
One record per imported official schedule / draft / source document.

### `turni_importati`
Immutable rows extracted from each imported schedule. Unique per `importazione + agente + data`.

Purpose:
- preserve exactly what an imported source said;
- allow comparison between successive schedules;
- allow rebuilding `turni_effective` if required.

### `turni_effective`
One record per `agente + data`.

This is the only normal read source for NaviTurni, NaviDiaria, Cambi and operational calculations.

It stores:
- resolved current service;
- original/base service;
- base imported row and import batch;
- latest source (`turno_importato`, `ods`, `cambio_turno`, `manuale`, `migrazione`);
- optional relation to the latest variation or approved swap;
- monotonically increasing version.

## Write flows

### Import schedule
1. create `importazioni_turni`;
2. create immutable `turni_importati` rows;
3. update/upsert `turni_effective` for the imported period;
4. do not delete history.

### ODS / manual variation
1. create/update historical `variazioni` record;
2. in the same server-side operation update `turni_effective`;
3. clients subsequently read only `turni_effective`.

### Approved swap
1. preserve request/history in `cambi_turno`;
2. approve the swap server-side;
3. atomically update the two affected `turni_effective` records;
4. pages immediately see the resulting shifts without any merge.

### Diaria
Diaria reads the service from `turni_effective`. Worked hours, overtime, bank, allowances and overrides remain fields of `diaria` and are not stored in `turni_effective`.

## Firebase transition

Firebase is not called by the V2 browser.

During the migration window:
- keep a frozen baseline export;
- accept newer Firebase exports (or explicit admin-side legacy reads);
- compare stable entity keys and content hashes;
- import only changed/new records into PocketBase;
- record every legacy import in `firebase_sync_runs` and `firebase_sync_state`;
- never copy plaintext legacy PINs.

The temporary importer must support at least:
- Diaria changes;
- change requests / approvals;
- ODS and manual variations;
- schedule imports;
- agent/profile changes required for access.

## Security

Normal clients do not directly write `turni_effective`.

Writes that affect effective shifts are performed through PocketBase server-side hooks/routes and transactions. API rules remain deny-by-default for direct writes. PocketBase API rules filter reads and PocketBase JS hooks can maintain the materialized state after validated operations.

## V2 delivery order

1. Login / session / menu — PocketBase only.
2. NaviTurni — reads only `turni_effective`.
3. Cambi — reads `turni_effective`, writes requests; approval updates effective state.
4. NaviDiaria — reads effective shift; writes only Diaria values.
5. ODS / import schedule — writes immutable source + effective rows.
6. Documents / announcements.
7. Agents / permissions.
8. Ship management and remaining admin pages.
9. Firebase delta importer and final reconciliation.
10. Production cutover to NaviSuite V2.

## Non-goals during V2 rebuild

- no browser-side Firebase fallback;
- no page-load schedule reconstruction;
- no destructive deletion of frozen Firebase/PocketBase history before final validation;
- no requirement to preserve old frontend implementation details if a simpler V2 implementation is faster and clearer.
