import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";

const templates = {
  "cold-storage": {
    name: "Cold Storage Monitoring",
    groupName: "Cold Storage Demo",
    devices: [
      {
        code: "DW-COLD-001",
        name: "Cold Room A",
        status: "online",
        baseTemp: 4,
        baseHumidity: 68,
        rssi: -51,
      },
      {
        code: "DW-COLD-002",
        name: "Freezer Room",
        status: "warning",
        baseTemp: -16,
        baseHumidity: 55,
        rssi: -57,
      },
      {
        code: "DW-COLD-003",
        name: "Loading Area",
        status: "online",
        baseTemp: 10,
        baseHumidity: 72,
        rssi: -63,
      },
    ],
    alarm: {
      metric: "temperature",
      operator: ">",
      threshold: 8,
      value: 10.5,
      severity: "warning",
    },
  },

  "server-room": {
    name: "Server Room Monitoring",
    groupName: "Server Room Demo",
    devices: [
      {
        code: "DW-SERVER-001",
        name: "Rack A",
        status: "online",
        baseTemp: 25,
        baseHumidity: 48,
        rssi: -49,
      },
      {
        code: "DW-SERVER-002",
        name: "Rack B",
        status: "warning",
        baseTemp: 33,
        baseHumidity: 52,
        rssi: -56,
      },
      {
        code: "DW-SERVER-003",
        name: "UPS Room",
        status: "online",
        baseTemp: 29,
        baseHumidity: 46,
        rssi: -61,
      },
    ],
    alarm: {
      metric: "temperature",
      operator: ">",
      threshold: 30,
      value: 33.2,
      severity: "critical",
    },
  },

  factory: {
    name: "Factory Monitoring",
    groupName: "Factory Demo",
    devices: [
      {
        code: "DW-FACTORY-001",
        name: "Production Line 1",
        status: "online",
        baseTemp: 31,
        baseHumidity: 62,
        rssi: -58,
      },
      {
        code: "DW-FACTORY-002",
        name: "Production Line 2",
        status: "online",
        baseTemp: 30,
        baseHumidity: 60,
        rssi: -60,
      },
      {
        code: "DW-FACTORY-003",
        name: "Boiler Area",
        status: "warning",
        baseTemp: 38,
        baseHumidity: 54,
        rssi: -67,
      },
    ],
    alarm: {
      metric: "temperature",
      operator: ">",
      threshold: 35,
      value: 38.4,
      severity: "warning",
    },
  },

  "smart-farm": {
    name: "Smart Farm Monitoring",
    groupName: "Smart Farm Demo",
    devices: [
      {
        code: "DW-FARM-001",
        name: "Greenhouse A",
        status: "online",
        baseTemp: 28,
        baseHumidity: 76,
        rssi: -54,
      },
      {
        code: "DW-FARM-002",
        name: "Greenhouse B",
        status: "online",
        baseTemp: 29,
        baseHumidity: 79,
        rssi: -59,
      },
      {
        code: "DW-FARM-003",
        name: "Water Tank Area",
        status: "offline",
        baseTemp: 27,
        baseHumidity: 82,
        rssi: -72,
      },
    ],
    alarm: {
      metric: "humidity",
      operator: ">",
      threshold: 80,
      value: 82,
      severity: "warning",
    },
  },
};

function randomValue(base, range) {
  return Number((base + (Math.random() - 0.5) * range).toFixed(1));
}

function buildReadings(deviceId, baseTemp, baseHumidity, rssi) {
  const readings = [];
  const now = new Date();

  // 24 ชั่วโมงย้อนหลัง ทุก 5 นาที = 288 จุด
  for (let i = 0; i < 288; i += 1) {
    const time = new Date(now.getTime() - (287 - i) * 5 * 60 * 1000);

    readings.push({
      time,
      deviceId,
      temperature: randomValue(baseTemp, 4),
      humidity: randomValue(baseHumidity, 10),
      rssi,
    });
  }

  return readings;
}

export async function listDemoTemplates(req, res) {
  res.json(
    Object.entries(templates).map(([key, template]) => ({
      key,
      name: template.name,
      groupName: template.groupName,
      devices: template.devices.map((device) => ({
        name: device.name,
        status: device.status,
      })),
    })),
  );
}

export async function createDemoTemplate(req, res) {
  const user = req.dbUser;
  const { templateKey } = req.params;
  const template = templates[templateKey];

  if (!template) {
    return res.status(404).json({
      message: "Demo template not found",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const createdDevices = [];

    for (const demoDevice of template.devices) {
      const deviceSecret = crypto.randomBytes(18).toString("hex");
      const secretHash = await bcrypt.hash(deviceSecret, 10);

      const deviceCode = `${demoDevice.code}-U${user.id}`;

      const isOffline = demoDevice.status === "offline";
      const nowValue = isOffline ? `NOW() - INTERVAL '15 minutes'` : "NOW()";

      const deviceResult = await client.query(
        `
        INSERT INTO devices (
          user_id,
          device_code,
          name,
          group_name,
          status,
          secret_hash,
          last_seen_at,
          last_ingest_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          ${nowValue},
          ${nowValue}
        )
        ON CONFLICT (device_code)
        DO UPDATE SET
          name = EXCLUDED.name,
          group_name = EXCLUDED.group_name,
          status = EXCLUDED.status,
          secret_hash = EXCLUDED.secret_hash,
          last_seen_at = EXCLUDED.last_seen_at,
          last_ingest_at = EXCLUDED.last_ingest_at
        RETURNING id, device_code, name, group_name, status, last_seen_at
        `,
        [
          user.id,
          deviceCode,
          demoDevice.name,
          template.groupName,
          demoDevice.status,
          secretHash,
        ],
      );

      const device = deviceResult.rows[0];

      await client.query(
        `
        DELETE FROM sensor_readings
        WHERE device_id = $1
        `,
        [device.id],
      );

      const readings = buildReadings(
        device.id,
        demoDevice.baseTemp,
        demoDevice.baseHumidity,
        demoDevice.rssi,
      );

      for (const reading of readings) {
        await client.query(
          `
          INSERT INTO sensor_readings (
            time,
            device_id,
            temperature,
            humidity,
            rssi
          )
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            reading.time,
            reading.deviceId,
            reading.temperature,
            reading.humidity,
            reading.rssi,
          ],
        );
      }

      createdDevices.push({
        ...device,
        deviceSecret,
      });
    }

    const alarmDevice =
      createdDevices.find((device) => device.status === "warning") ||
      createdDevices[0];

    await client.query(
      `
      DELETE FROM alarm_events
      WHERE user_id = $1
        AND device_id = $2
        AND metric = $3
      `,
      [user.id, alarmDevice.id, template.alarm.metric],
    );

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
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
      `,
      [
        user.id,
        alarmDevice.id,
        template.alarm.metric,
        template.alarm.operator,
        template.alarm.threshold,
        template.alarm.value,
        template.alarm.severity,
      ],
    );

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      template: template.name,
      devices: createdDevices,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteDemoData(req, res) {
  const user = req.dbUser;

  const result = await pool.query(
    `
    DELETE FROM devices
    WHERE user_id = $1
      AND (
        device_code LIKE 'DW-COLD-%'
        OR device_code LIKE 'DW-SERVER-%'
        OR device_code LIKE 'DW-FACTORY-%'
        OR device_code LIKE 'DW-FARM-%'
      )
    RETURNING id
    `,
    [user.id],
  );

  res.json({
    ok: true,
    deletedDevices: result.rowCount,
  });
}

export async function getDemoStatistics(req, res) {
  const user = req.dbUser;

  const result = await pool.query(
    `
    SELECT
      COUNT(d.id)::int AS demo_devices,
      COALESCE(MAX(ds.generated_readings), 0)::bigint AS generated_readings,
      COALESCE(MAX(ds.generated_alarms), 0)::bigint AS generated_alarms,
      MAX(ds.last_run_at) AS last_run_at
    FROM users u
    LEFT JOIN devices d
      ON d.user_id = u.id
      AND (
        d.device_code LIKE 'DW-COLD-%'
        OR d.device_code LIKE 'DW-SERVER-%'
        OR d.device_code LIKE 'DW-FACTORY-%'
        OR d.device_code LIKE 'DW-FARM-%'
      )
    LEFT JOIN demo_statistics ds
      ON ds.user_id = u.id
    WHERE u.id = $1
    `,
    [user.id],
  );

  res.json(
    result.rows[0] || {
      demo_devices: 0,
      generated_readings: 0,
      generated_alarms: 0,
      last_run_at: null,
    },
  );
}

export async function generateDemoAlarmNow(req, res) {
  const user = req.dbUser;

  const deviceResult = await pool.query(
    `
    SELECT id
    FROM devices
    WHERE user_id = $1
      AND (
        device_code LIKE 'DW-COLD-%'
        OR device_code LIKE 'DW-SERVER-%'
        OR device_code LIKE 'DW-FACTORY-%'
        OR device_code LIKE 'DW-FARM-%'
      )
    ORDER BY RANDOM()
    LIMIT 1
    `,
    [user.id],
  );

  if (!deviceResult.rows.length) {
    return res.status(404).json({
      message: "No demo device found",
    });
  }

  const deviceId = deviceResult.rows[0].id;
  const value = Number((35 + Math.random() * 5).toFixed(1));

  await pool.query(
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
    VALUES ($1, $2, 'temperature', '>', 35, $3, 'warning', 'active', NOW())
    `,
    [user.id, deviceId, value],
  );

  await pool.query(
    `
    INSERT INTO demo_statistics (
      user_id,
      generated_readings,
      generated_alarms,
      last_run_at
    )
    VALUES ($1, 0, 1, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      generated_alarms = demo_statistics.generated_alarms + 1,
      last_run_at = NOW()
    `,
    [user.id],
  );

  res.json({
    ok: true,
    message: "Demo alarm generated",
  });
}

export async function generateDemoOfflineNow(req, res) {
  const user = req.dbUser;

  const result = await pool.query(
    `
    UPDATE devices
    SET
      status = 'offline',
      last_seen_at = NOW() - INTERVAL '5 minutes',
      last_ingest_at = NOW() - INTERVAL '5 minutes'
    WHERE id = (
      SELECT id
      FROM devices
      WHERE user_id = $1
        AND (
          device_code LIKE 'DW-COLD-%'
          OR device_code LIKE 'DW-SERVER-%'
          OR device_code LIKE 'DW-FACTORY-%'
          OR device_code LIKE 'DW-FARM-%'
        )
      ORDER BY RANDOM()
      LIMIT 1
    )
    RETURNING id, device_code, name, status
    `,
    [user.id],
  );

  if (!result.rows.length) {
    return res.status(404).json({
      message: "No demo device found",
    });
  }

  res.json({
    ok: true,
    device: result.rows[0],
  });
}

export async function generateDemoHistoryNow(req, res) {
  const user = req.dbUser;

  const devicesResult = await pool.query(
    `
    SELECT id, device_code
    FROM devices
    WHERE user_id = $1
      AND (
        device_code LIKE 'DW-COLD-%'
        OR device_code LIKE 'DW-SERVER-%'
        OR device_code LIKE 'DW-FACTORY-%'
        OR device_code LIKE 'DW-FARM-%'
      )
    `,
    [user.id],
  );

  if (!devicesResult.rows.length) {
    return res.status(404).json({
      message: "No demo device found",
    });
  }

  let created = 0;
  const now = new Date();

  for (const device of devicesResult.rows) {
    for (let i = 0; i < 288; i += 1) {
      const time = new Date(now.getTime() - (287 - i) * 5 * 60 * 1000);

      const isServer = device.device_code.includes("SERVER");
      const isCold = device.device_code.includes("COLD");
      const isFarm = device.device_code.includes("FARM");
      const baseTemp = isCold ? 4 : isServer ? 29 : isFarm ? 28 : 32;
      const baseHumidity = isCold ? 68 : isServer ? 50 : isFarm ? 78 : 60;

      const temperature = Number(
        (baseTemp + (Math.random() - 0.5) * 5).toFixed(1),
      );

      const humidity = Number(
        (baseHumidity + (Math.random() - 0.5) * 8).toFixed(1),
      );

      await pool.query(
        `
        INSERT INTO sensor_readings (
          time,
          device_id,
          temperature,
          humidity,
          rssi
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          time,
          device.id,
          temperature,
          humidity,
          -50 - Math.floor(Math.random() * 20),
        ],
      );

      created += 1;
    }
  }

  await pool.query(
    `
    INSERT INTO demo_statistics (
      user_id,
      generated_readings,
      generated_alarms,
      last_run_at
    )
    VALUES ($1, $2, 0, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      generated_readings =
        demo_statistics.generated_readings + EXCLUDED.generated_readings,
      last_run_at = NOW()
    `,
    [user.id, created],
  );

  res.json({
    ok: true,
    generatedReadings: created,
  });
}
