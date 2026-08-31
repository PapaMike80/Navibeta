# PocketBase preparation

This directory prepares NaviBeta as the isolated test platform for the future NaviSuite PocketBase migration. It does not change the current application runtime, and it is not connected to production NaviSuite.

- `pb_migrations/`: schema migrations compatible with PocketBase 0.40.1.
- `migrate-firebase/`: read-only Firebase extractor/transformer; dry-run is the default.
- `../POCKETBASE_MIGRATION.md`: architecture, mapping and TrueNAS procedures.

No command in this directory is invoked by NaviSuite.
