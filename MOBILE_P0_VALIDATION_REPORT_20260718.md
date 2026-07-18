# dotWatch Mobile P0 Validation Report

Date: 2026-07-18
Baseline: dotwatch-clean-20260718-172145.zip

## Implemented

- Firebase Auth persistence with AsyncStorage on Android/iOS
- Runtime environment validation and readable configuration error screen
- Dynamic Device Values and selectable dynamic History
- Push Token cleanup before logout and query-cache cleanup
- Mobile Push migration integrated into the main backend migration runner
- Active Expo Push Token uniqueness across accounts
- Local eas-cli removed; app version aligned to 0.2.0
- Mobile README and operations documentation updated

## Validation

- Mobile TypeScript: PASS
- Mobile release structure/environment check with non-secret test values: PASS
- Android Expo export: PASS (1386 modules)
- Web Expo export: PASS (1002 modules)
- Backend syntax check: PASS
- npm ci from package-lock: PASS
- Production dependency audit: 18 moderate, 0 high, 0 critical
- Expo Doctor: 16/18; two checks could not reach Expo API due network/DNS in the validation environment
- Changed-file secret scan: PASS

## Not executed

- Production database migration was not executed because no production DATABASE_URL was used.
- Firebase login, cold-start persistence and Push Notification were not tested on a physical Android device because real Firebase/EAS credentials and hardware were not used.

## Changed files

- `apps/mobile/README.md`
- `apps/mobile/app.json`
- `apps/mobile/app/(app)/devices/[id].tsx`
- `apps/mobile/app/(app)/notifications.tsx`
- `apps/mobile/app/(app)/settings.tsx`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/package-lock.json`
- `apps/mobile/package.json`
- `apps/mobile/scripts/check-release.mjs`
- `apps/mobile/src/api/history.ts`
- `apps/mobile/src/api/metrics.ts`
- `apps/mobile/src/components/HistoryChart.tsx`
- `apps/mobile/src/components/MetricCard.tsx`
- `apps/mobile/src/config/env.ts`
- `apps/mobile/src/config/firebase.ts`
- `apps/mobile/src/config/validateEnv.ts`
- `apps/mobile/src/services/pushRegistration.ts`
- `apps/mobile/src/types/metric.ts`
- `apps/mobile/src/utils/metric.ts`
- `docs/MOBILE_P0_STABILIZATION_20260718.md`
- `package.json`
- `services/backend/migrations/025_mobile_push_tokens.sql`
- `services/backend/migrations/run.js`
- `services/backend/package.json`
- `services/backend/scripts/mobile-push-migrate.mjs`
- `services/backend/src/controllers/mobilePush.controller.js`

Removed files: 0
