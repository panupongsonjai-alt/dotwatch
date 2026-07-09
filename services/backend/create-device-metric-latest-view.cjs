/*
  Deprecated compatibility wrapper.

  device_metric_latest must be a TABLE because ingest.controller.js writes to it
  with INSERT ... ON CONFLICT (device_id, metric_key). Do not recreate it as a VIEW.
*/

console.warn('Deprecated script name: create-device-metric-latest-view.cjs')
console.warn('Running safe TABLE repair instead: repair-device-metric-latest-table.cjs')
require('./repair-device-metric-latest-table.cjs')
