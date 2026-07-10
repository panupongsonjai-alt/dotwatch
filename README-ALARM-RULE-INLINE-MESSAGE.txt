dotWatch - Alarm Rule Inline Editor + Notification Message
===========================================================

Changes
-------
1. Removes the visible "metric_" prefix in the Selected Device > Alarms tab.
   Example: metric_1 • °C is displayed as 1 • °C.
   The real metric key remains metric_1 internally, so ingest/API behavior is unchanged.

2. Desktop alarm rule layout is now one control row:
   Condition | Threshold | Trigger | Notification message | Active | Save
   The Warning/Critical severity header remains above the control row.
   Narrow panels and mobile screens switch to a safe responsive layout.

3. Adds a notification message field (maximum 300 characters).
   The value is stored in alarm_rules.notification_message and copied to
   alarm_events.notification_message when an alarm is generated.

4. The custom message is used by:
   - Realtime critical browser alert
   - Alarm toast
   - Notification Center
   - Latest Active Alarms
   - Activity log description

5. Creating a new alarm rule now respects the selected Active/Paused state.

Database migration
------------------
The existing backend migration command adds the columns safely with
ADD COLUMN IF NOT EXISTS:

  npm run backend:migrate

Verification completed
----------------------
- Dashboard production build: PASSED
- Backend changed-file JavaScript syntax checks: PASSED
- Backend built-in syntax check: PASSED
- ESLint was not runnable because the current dashboard package does not
  include eslint as a dependency. This was already a project configuration issue.
- The migration was not executed against the user's live Render database.

Install patch into repository root
----------------------------------
Extract this ZIP directly into:

  D:\IoT Project\dotwatch

and allow overwrite of the included files.
