import { pool } from "../db/pool.js";

function randomValue(base, range) {
  return Number((base + (Math.random() - 0.5) * range).toFixed(1));
}

function getBaseValue(deviceCode) {
  if (deviceCode.includes("COLD")) {
    return { temp: 4, humidity: 68 };
  }

  if (deviceCode.includes("SERVER")) {
    return { temp: 29, humidity: 50 };
  }

  if (deviceCode.includes("FACTORY")) {
    return { temp: 32, humidity: 60 };
  }

  if (deviceCode.includes("FARM")) {
    return { temp: 28, humidity: 78 };
  }

  return { temp: 28, humidity: 60 };
}

export async function runDemoGeneratorTick() {
  const client = await pool.connect();

  try {
    const usersResult = await client.query(
      `
      SELECT *
      FROM demo_generators
      WHERE enabled = true
      `,
    );

    for (const generator of usersResult.rows) {
      let readingsCreated = 0;
      let alarmsCreated = 0;

      const devicesResult = await client.query(
        `
        SELECT id, device_code, status
        FROM devices
        WHERE user_id = $1
          AND (
            device_code LIKE 'DW-COLD-%'
            OR device_code LIKE 'DW-SERVER-%'
            OR device_code LIKE 'DW-FACTORY-%'
            OR device_code LIKE 'DW-FARM-%'
          )
        `,
        [generator.user_id],
      );

      for (const device of devicesResult.rows) {
        const shouldOffline =
          generator.simulate_offline && Math.random() < 0.08;

        if (shouldOffline) {
          await client.query(
            `
            UPDATE devices
            SET
              status = 'offline',
              last_seen_at = NOW() - INTERVAL '2 minutes'
            WHERE id = $1
            `,
            [device.id],
          );

          continue;
        }

        const base = getBaseValue(device.device_code);

        const temperature = generator.temperature_drift
          ? randomValue(base.temp, 5)
          : base.temp;

        const humidity = randomValue(base.humidity, 8);

        await client.query(
          `
          INSERT INTO sensor_readings (
            time,
            device_id,
            temperature,
            humidity,
            rssi
          )
          VALUES (
            NOW(),
            $1,
            $2,
            $3,
            $4
          )
          `,
          [
            device.id,
            temperature,
            humidity,
            -50 - Math.floor(Math.random() * 20),
          ],
        );

        readingsCreated += 1;

        await client.query(
          `
          UPDATE devices
          SET
            status = CASE
              WHEN $2 >= 35 THEN 'warning'
              ELSE 'online'
            END,
            last_seen_at = NOW(),
            last_ingest_at = NOW()
          WHERE id = $1
          `,
          [device.id, temperature],
        );

        if (generator.generate_alarms && temperature >= 35) {
          await client.query(
            `
            INSERT INTO alarm_events (
              user_id,
              device_id,
              metric,
              operator,
              threshold,
              value,
              severity,
              status,
              triggered_at
            )
            VALUES (
              $1,
              $2,
              'temperature',
              '>',
              35,
              $3,
              'warning',
              'active',
              NOW()
            )
            `,
            [generator.user_id, device.id, temperature],
          );

          alarmsCreated += 1;
        }
      }

      await client.query(
        `
        INSERT INTO demo_statistics (
          user_id,
          generated_readings,
          generated_alarms,
          last_run_at
        )
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          generated_readings =
            demo_statistics.generated_readings + EXCLUDED.generated_readings,
          generated_alarms =
            demo_statistics.generated_alarms + EXCLUDED.generated_alarms,
          last_run_at = NOW()
        `,
        [generator.user_id, readingsCreated, alarmsCreated],
      );
    }
  } finally {
    client.release();
  }
}
