# Phase 11D — Admin Sidebar Analysis

## User-observed issue

The collapsed Admin sidebar did not visually line up with the Dashboard sidebar. The Dashboard sidebar groups icons into clear visual sections, while Admin had too many small groups and hidden labels still affected collapsed spacing.

## Root cause

1. Admin navigation was grouped by every admin domain: Control Center, Management, Product, Commercial, Security, System.
2. Dashboard groups are broader: first group has three items, second group has three items, then smaller system/account groups.
3. In Admin collapsed state, labels were hidden with opacity/width instead of display behavior, so hidden section labels could still create uneven spacing.
4. Admin active indicator used a red/orange admin-specific gradient while Dashboard uses the common active indicator geometry.

## Fix strategy

Use Dashboard-like structure and spacing without sharing Dashboard code directly. This avoids coupling Admin permissions and Admin routes to the Dashboard app.

## Safety scope

No backend, database, Firebase, Admin API, Dashboard app, or firmware changes were made.
