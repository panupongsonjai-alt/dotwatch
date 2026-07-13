# dotWatch consistency, unused-file, and CSS audit

Date: 2026-07-13
Source: `dotwatch-clean-20260713-093614.zip`

## Result

The supplied archive already contained the main consistency/CSS cleanup. This
audit revalidated that work against the actual imported source, removed delivery
artifacts and an additional obsolete ESP32 preview toolchain, and verified the
remaining applications with production builds and structural checks.

## UI behavior consistency

- Dashboard destructive actions use typed confirmation with the exact keyword
  `Delete` for Device, Metric, Alarm Rule, history, alarm-event, and notification
  deletion.
- Device secret rotation uses the separate exact phrase `Reset Secret`.
- Admin Device Model deletion/deactivation uses typed `Delete` confirmation.
- ESP32 and ESP8266 destructive portal actions use typed `Delete` confirmation.
- Dashboard and Admin mount a shared popup/toast host at application root.
- API failures/timeouts and actionable success, warning, error, information, and
  critical alarm events are routed to popup notifications.
- No native `alert()`, `confirm()`, or `prompt()` calls were found in Dashboard or
  Admin source.

Inline status messages remain in some forms/pages for persistent context. They
are paired with popup notifications for actionable outcomes and are not treated
as duplicate implementation defects.

## Removed files and artifacts

- Old delivery/install README text files and patch installers.
- `payload/`, `dotwatch-clear-alarm-functional-fix-patch/`, and
  `patch_alarm_filter_button_fix/` delivery copies.
- Redundant Dashboard-local Prettier config (root config is canonical).
- Two obsolete Dashboard CSS fragments already consolidated into `shared-ui.css`.
- Legacy ESP32 preview entry files replaced by the modular `src/preview/`,
  `src/mocks/`, and `src/styles/` structure.
- Obsolete ESP32 `sync-portal-assets.mjs`, `src/firmware.js`, and `src/portal.css`.
- Obsolete PowerShell portal verifier and its stale structure document; the
  canonical verifier is `portal-preview/scripts/verify-structure.mjs`.
- Cleanup manifest/installer files that had no runtime role after import.

The ESP32 preview runner message was updated to point to the modular CSS folder.

## CSS audit

- Dashboard style audit passes.
- No exact same-file or always-loaded cross-file duplicate rule groups remain
  according to the project audit.
- Dashboard uses one global import chain rooted at `src/styles.css`.
- Leaflet CSS is loaded once from Dashboard `main.jsx`.
- Dashboard production global CSS: 241.51 kB before gzip, 35.21 kB gzip.
- Admin production CSS: 52.36 kB before gzip, 9.38 kB gzip.
- Non-identical cascade overrides were retained where they provide active layout
  or compatibility behavior; deleting them by selector name alone would change UI.

## Verification

- `npm run audit:dashboard-style`: passed.
- `npm run check:all`: passed.
- Dashboard production build: passed, 2,704 modules transformed.
- Admin production build: passed, 102 modules transformed.
- Admin ESLint: passed with no reported errors or warnings.
- Backend configured JavaScript syntax checks: passed.
- ESP32 modular portal build, sync, syntax, and structure check: passed.
- ESP8266 modular portal build, sync, syntax, and structure check: passed.

PlatformIO firmware compilation/upload and live production/database integration
tests were not run because they require hardware or external deployment state.

## Dependency observations

Fresh installs reported 2 Dashboard vulnerabilities (1 moderate, 1 high), no
Admin vulnerabilities, and 9 Backend vulnerabilities (8 moderate, 1 high).
Automatic forced upgrades were not applied because they may introduce breaking
dependency changes and are outside this consistency/CSS cleanup scope.
