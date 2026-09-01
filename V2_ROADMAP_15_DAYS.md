# NaviSuite V2 — 15 day cutover roadmap

Start: 2026-09-01
Target production cutover: 2026-09-16

## Day 1 — Freeze and core data model
- Freeze current Firebase-era NaviBeta branch.
- Create V2 branch.
- Add `turni_importati` and `turni_effective`.
- Add legacy Firebase sync tracking.
- Backup PocketBase before applying V2 migration.

Gate: migration applies cleanly; old collections/data unchanged.

## Day 2 — Effective bootstrap
- Build offline bootstrap from frozen Firebase export.
- Reproduce current effective shifts: base schedule + active schedule imports + ODS/manual variations + approved changes.
- Populate immutable imported schedule rows and `turni_effective`.
- Compare V2 effective output against current NaviBeta for all agents/dates from 2026-07-01.

Gate: zero unexplained effective-shift differences from 2026-07-01 onward.

## Day 3 — PocketBase-only login and shell
- New minimal V2 frontend shell.
- Agent selection + PIN auth directly against PocketBase.
- Session/token handling.
- New menu/navigation.
- No Firebase JS loaded anywhere in V2.

Gate: login works with provisioned users even when Firebase is unavailable.

## Day 4 — NaviTurni V2
- Query only `turni_effective` for required date window/residence.
- Mobile-first table.
- Admin visibility rules and special visibility.
- No schedule reconstruction in the browser.

Gate: expected table opens quickly and matches effective audit.

## Day 5 — Cambi V2
- Read candidates from `turni_effective`.
- Create/accept/reject requests.
- Server-side approval transaction updates both effective rows and historical records.

Gate: approved change immediately appears everywhere without page-side merges.

## Days 6-8 — NaviDiaria V2
- Read effective service for each day.
- Migrate/edit worked hours, overtime components, bank, allowance, tickets, overnight and other current rules.
- Keep worked hours independent from scheduled service duration.
- Weekly/monthly summaries and printable statement.

Gate: July/August test totals match expected legacy results; manual worked hours below service duration save correctly.

## Day 9 — Import Turno / ODS
- Import official/draft schedule into immutable source rows.
- Update `turni_effective` server-side.
- Import ODS/manual variations and update effective state in the same operation.
- Preview before commit and idempotent re-import.

Gate: importing a known source produces the expected effective shifts without duplicates.

## Day 10 — Documents / announcements
- PocketBase file storage.
- User-visible documents.
- Announcements and visibility rules.

## Day 11 — Agents / permissions
- Access administration.
- PIN reset/change.
- Roles and special permissions.
- Remove technical/legacy non-login records from user-facing lists without deleting historical agent references.

## Day 12 — Ships / remaining operations
- Ship schedules, crew requirements, assignments and required operational pages.
- Only migrate functionality still needed in V2.

## Day 13 — Firebase delta importer
- Accept a newer Firebase export during transition.
- Compare stable keys/content hashes against frozen/imported state.
- Dry-run summary first.
- Apply only new/changed Diaria, changes, ODS, schedule imports and required profiles.
- Log every delta run.

Gate: importing the same snapshot twice is idempotent.

## Day 14 — Full staging validation
- Mobile/iPhone tests.
- Role/permission tests.
- Tailscale/PocketBase availability tests.
- Compare counts and critical business results.
- Full PocketBase backup.

Gate: no Firebase runtime requests in browser network panel.

## Day 15 — Production cutover
- Final fresh Firebase delta import.
- Final audit from 2026-07-01 onward.
- Freeze writes on old NaviSuite during the short cutover window.
- Backup.
- Deploy NaviSuite V2.
- Keep old Firebase/NaviSuite available read-only as rollback reference until V2 is stable.

## Release principle

A page is considered migrated only when it has no runtime Firebase dependency. Do not carry hybrid browser logic into production V2.
