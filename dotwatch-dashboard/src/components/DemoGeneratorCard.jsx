import { useEffect, useState } from "react";
import {
  getDemoGeneratorConfig,
  saveDemoGeneratorConfig,
} from "../services/api";

function DemoGeneratorCard({ onDone }) {
  const [config, setConfig] = useState({
    enabled: false,
    interval_seconds: 30,
    generate_alarms: true,
    simulate_offline: true,
    temperature_drift: true,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadConfig() {
    try {
      const data = await getDemoGeneratorConfig();
      setConfig({
        enabled: Boolean(data.enabled),
        interval_seconds: Number(data.interval_seconds || 30),
        generate_alarms: Boolean(data.generate_alarms),
        simulate_offline: Boolean(data.simulate_offline),
        temperature_drift: Boolean(data.temperature_drift),
      });
    } catch (err) {
      console.error(err);
      setError("โหลดการตั้งค่า Demo Generator ไม่สำเร็จ");
    }
  }

  useEffect(() => {
    loadConfig();
  }, []);

  function updateField(field, value) {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");
      setError("");

      await saveDemoGeneratorConfig(config);

      setMessage("บันทึกการตั้งค่า Demo Generator สำเร็จ");
      onDone?.();
    } catch (err) {
      console.error(err);
      setError("บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="demo-generator-card">
      <div className="demo-panel-header">
        <div>
          <h2>Demo Generator</h2>
          <p>จำลองข้อมูล Sensor แบบต่อเนื่อง เหมือนมี ESP ส่งค่าจริง</p>
        </div>

        <span className={config.enabled ? "status online" : "status offline"}>
          {config.enabled ? "Running" : "Stopped"}
        </span>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <div className="demo-generator-options">
        <label className="demo-switch-row">
          <span>
            <strong>Enable Generator</strong>
            <small>เปิดให้ระบบสร้างข้อมูลใหม่ทุกช่วงเวลา</small>
          </span>

          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => updateField("enabled", e.target.checked)}
          />
        </label>

        <label className="demo-field">
          Interval
          <select
            value={config.interval_seconds}
            onChange={(e) =>
              updateField("interval_seconds", Number(e.target.value))
            }
          >
            <option value={30}>30 seconds</option>
            <option value={60}>60 seconds</option>
            <option value={300}>5 minutes</option>
          </select>
        </label>

        <label className="demo-switch-row">
          <span>
            <strong>Generate Alarms</strong>
            <small>สร้าง Alarm เมื่อค่าเกิน Threshold</small>
          </span>

          <input
            type="checkbox"
            checked={config.generate_alarms}
            onChange={(e) => updateField("generate_alarms", e.target.checked)}
          />
        </label>

        <label className="demo-switch-row">
          <span>
            <strong>Simulate Offline</strong>
            <small>สุ่มให้อุปกรณ์บางตัว offline เพื่อโชว์สถานะ</small>
          </span>

          <input
            type="checkbox"
            checked={config.simulate_offline}
            onChange={(e) => updateField("simulate_offline", e.target.checked)}
          />
        </label>

        <label className="demo-switch-row">
          <span>
            <strong>Temperature Drift</strong>
            <small>จำลองค่าอุณหภูมิแกว่งขึ้นลงแบบธรรมชาติ</small>
          </span>

          <input
            type="checkbox"
            checked={config.temperature_drift}
            onChange={(e) => updateField("temperature_drift", e.target.checked)}
          />
        </label>
      </div>

      <button
        type="button"
        className="primary-button full"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : "Save Demo Generator"}
      </button>
    </section>
  );
}

export default DemoGeneratorCard;
