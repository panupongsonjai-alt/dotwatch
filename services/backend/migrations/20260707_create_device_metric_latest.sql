-- dotWatch migration: ensure device_metric_latest is a TABLE
--
-- The backend ingest path writes to public.device_metric_latest with:
--   INSERT ... ON CONFLICT (device_id, metric_key)
-- Therefore this relation must be a normal table, not a view.

DO $$
DECLARE
  existing_relkind "char";
BEGIN
  SELECT c.relkind
  INTO existing_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'device_metric_latest'
  LIMIT 1;

  IF existing_relkind = 'v' THEN
    DROP VIEW public.device_metric_latest CASCADE;
  ELSIF existing_relkind = 'm' THEN
    DROP MATERIALIZED VIEW public.device_metric_latest CASCADE;
  ELSIF existing_relkind IS NOT NULL AND existing_relkind <> 'r' THEN
    RAISE EXCEPTION 'Unsupported public.device_metric_latest relation type: %', existing_relkind;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.device_metric_latest (
  device_id BIGINT NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  time TIMESTAMPTZ NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_device_metric_latest_time
ON public.device_metric_latest (time DESC);

-- Backfill from dynamic metric history when the table exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'device_metric_readings'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.device_metric_latest (
        device_id,
        metric_key,
        time,
        value,
        updated_at
      )
      SELECT DISTINCT ON (device_id, metric_key)
        device_id,
        metric_key,
        time,
        value,
        NOW()
      FROM public.device_metric_readings
      WHERE device_id IS NOT NULL
        AND metric_key IS NOT NULL
        AND time IS NOT NULL
        AND value IS NOT NULL
      ORDER BY device_id, metric_key, time DESC
      ON CONFLICT (device_id, metric_key)
      DO UPDATE SET
        time = EXCLUDED.time,
        value = EXCLUDED.value,
        updated_at = NOW()
      WHERE EXCLUDED.time >= public.device_metric_latest.time
    $sql$;
  END IF;
END $$;

-- Backfill legacy sensor readings as metric_1/metric_2/metric_3 when available.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sensor_readings'
  ) THEN
    EXECUTE $sql$
      WITH legacy_rows AS (
        SELECT device_id, 'metric_1'::text AS metric_key, time, temperature::double precision AS value
        FROM public.sensor_readings
        WHERE temperature IS NOT NULL
        UNION ALL
        SELECT device_id, 'metric_2'::text AS metric_key, time, humidity::double precision AS value
        FROM public.sensor_readings
        WHERE humidity IS NOT NULL
        UNION ALL
        SELECT device_id, 'metric_3'::text AS metric_key, time, rssi::double precision AS value
        FROM public.sensor_readings
        WHERE rssi IS NOT NULL
      ), latest_rows AS (
        SELECT DISTINCT ON (device_id, metric_key)
          device_id,
          metric_key,
          time,
          value
        FROM legacy_rows
        WHERE device_id IS NOT NULL
          AND time IS NOT NULL
          AND value IS NOT NULL
        ORDER BY device_id, metric_key, time DESC
      )
      INSERT INTO public.device_metric_latest (
        device_id,
        metric_key,
        time,
        value,
        updated_at
      )
      SELECT device_id, metric_key, time, value, NOW()
      FROM latest_rows
      ON CONFLICT (device_id, metric_key)
      DO UPDATE SET
        time = EXCLUDED.time,
        value = EXCLUDED.value,
        updated_at = NOW()
      WHERE EXCLUDED.time >= public.device_metric_latest.time
    $sql$;
  END IF;
END $$;
