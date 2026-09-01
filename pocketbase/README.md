# PocketBase preparation

This directory prepares NaviBeta as the isolated test platform for the future NaviSuite PocketBase migration. It does not change the current application runtime, and it is not connected to production NaviSuite.

- `pb_migrations/1788134400_navisuite_initial_schema.js`: initial schema compatible with PocketBase 0.40.1.
- `pb_migrations/1788220800_optimize_navibeta_phase1.js`: non-destructive phase-1 optimization (indexes + auth identity preparation).
- `migrate-firebase/`: Firebase → PocketBase migration and audit utilities. Dry-run remains the default whenever a write-capable utility is used.
- `../POCKETBASE_MIGRATION.md`: architecture, mapping and TrueNAS procedures.

## Phase 1 optimization

The second migration does **not delete application records**. It:

1. adds `users.login_id` as a unique PocketBase auth identity;
2. makes email optional for the current NaviSuite agent/PIN flow;
3. adds `users.must_change_pin` to preserve the first-login PIN-change behavior;
4. keeps the current client-side SHA-256 PIN hash usable as the PocketBase password value;
5. adds secondary indexes for calendar, Diaria, changes, ODS variations, ships and user activity.

Before applying it, create the same PocketBase backup/snapshot used before the initial import. Apply it with PocketBase `migrate up` using the persistent `pb_migrations` directory.

## Audit after migration

From `pocketbase/migrate-firebase`, export the PocketBase environment variables and run:

```bash
npm run audit-pocketbase
```

Optional historical cutoff:

```bash
node src/audit-pocketbase.js --cutoff=2026-07-01
```

The audit is read-only and reports:

- record counts per collection;
- agents not yet linked to PocketBase auth users;
- orphan relations;
- date ranges and rows older than the cutoff;
- approximate space occupied by `legacy_payload` in hot collections.

Use this report before any phase-2 cleanup. In particular, do not remove `legacy_payload` or pre-cutoff historical rows until the report and the retained Firebase export have been verified.

## Auth provisioning preparation

After the phase-1 migration, the existing offline Firebase export can be used to prepare PocketBase auth users without exposing raw PINs. The legacy `pinHash` is already a 64-character SHA-256 value and is stored by PocketBase as the account password (PocketBase hashes it again internally).

Dry-run only:

```bash
npm run provision-auth
```

Explicit execution, only after checking the dry-run output:

```bash
npm run provision-auth:execute
```

The provisioning utility creates only missing PocketBase users, uses the stable agent id as `login_id`, preserves role/active/first-change metadata and links `agenti.user`. Existing PocketBase passwords are never overwritten by a rerun.

No command in this directory is invoked automatically by NaviBeta or NaviSuite.
