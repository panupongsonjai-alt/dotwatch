import { useEffect, useMemo, useState } from "react";
import {
  getAlarmRules,
  createAlarmRule,
  updateAlarmRule,
  deleteAlarmRule,
  getDevices,
} from "../services/api";

const defaultForm = {
  device_id: "",
  metric: "temperature",
  operator: ">",
  threshold: 35,
  severity: "critical",
};

function getMetricLabel(metric) {
  if (metric === "temperature") return "Temperature";
  if (metric === "humidity") return "Humidity";
  if (metric === "rssi") return "RSSI";
  return metric;
}

function getUnit(metric) {
  if (metric === "temperature") return "°C";
  if (metric === "humidity") return "%";
  if (metric === "rssi") return "dBm";
  return "";
}

function AlarmRules() {
  const [rules, setRules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    try {
      setError("");

      const [rulesData, devicesData] = await Promise.all([
        getAlarmRules(),
        getDevices(),
      ]);

      setRules(Array.isArray(rulesData) ? rulesData : []);
      setDevices(Array.isArray(devicesData) ? devicesData : []);
    } catch (err) {
      console.error(err);
      setError("โหลดข้อมูล Alarm Rules ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateForm(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function getDeviceName(id) {
    const device = devices.find((d) => String(d.id) === String(id));
    return device?.name || `Device #${id}`;
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (!form.device_id) {
      setError("กรุณาเลือก Device ก่อนสร้าง Rule");
      return;
    }

    if (form.threshold === "" || Number.isNaN(Number(form.threshold))) {
      setError("กรุณาระบุ Threshold ให้ถูกต้อง");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      await createAlarmRule({
        device_id: Number(form.device_id),
        metric: form.metric,
        operator: form.operator,
        threshold: Number(form.threshold),
        severity: form.severity,
      });

      setForm(defaultForm);
      setMessage("เพิ่ม Alarm Rule สำเร็จแล้ว");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || "เพิ่ม Alarm Rule ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const confirmed = window.confirm("ต้องการลบ Rule นี้ใช่ไหม?");
    if (!confirmed) return;

    try {
      setActionLoading(String(id));
      setError("");
      setMessage("");

      await deleteAlarmRule(id);

      setMessage("ลบ Alarm Rule สำเร็จแล้ว");
      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || "ลบ Alarm Rule ไม่สำเร็จ");
    } finally {
      setActionLoading("");
    }
  }

  async function handleToggle(rule) {
    try {
      setActionLoading(String(rule.id));
      setError("");
      setMessage("");

      await updateAlarmRule(rule.id, {
        device_id: rule.device_id,
        metric: rule.metric,
        operator: rule.operator,
        threshold: Number(rule.threshold),
        severity: rule.severity,
        is_active: !rule.is_active,
      });

      setMessage(
        rule.is_active
          ? "ปิดใช้งาน Alarm Rule แล้ว"
          : "เปิดใช้งาน Alarm Rule แล้ว",
      );

      await loadData();
    } catch (err) {
      console.error(err);
      setError(err.message || "อัปเดต Alarm Rule ไม่สำเร็จ");
    } finally {
      setActionLoading("");
    }
  }

  const totalRules = rules.length;
  const activeRules = rules.filter((rule) => rule.is_active).length;
  const criticalRules = rules.filter(
    (rule) => rule.severity === "critical",
  ).length;
  const warningRules = rules.filter(
    (rule) => rule.severity === "warning",
  ).length;

  const filteredRules = useMemo(() => {
    if (filter === "all") return rules;
    if (filter === "active") return rules.filter((rule) => rule.is_active);
    if (filter === "disabled") return rules.filter((rule) => !rule.is_active);
    return rules.filter((rule) => rule.severity === filter);
  }, [rules, filter]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Alarm Rules</h1>
          <p>จัดการเงื่อนไขแจ้งเตือนของอุปกรณ์ทั้งหมด</p>
        </div>

        <button type="button" className="ghost-button" onClick={loadData}>
          Refresh
        </button>
      </div>

      <section className="alarm-summary-grid">
        <article className="summary-card">
          <span>Total Rules</span>
          <strong>{totalRules}</strong>
        </article>

        <article className="summary-card">
          <span>Active Rules</span>
          <strong>{activeRules}</strong>
        </article>

        <article className="summary-card">
          <span>Critical</span>
          <strong>{criticalRules}</strong>
        </article>

        <article className="summary-card">
          <span>Warning</span>
          <strong>{warningRules}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>Create Rule</h2>
          <p>กำหนดเงื่อนไข เช่น Temperature &gt; 35°C หรือ Humidity &gt; 80%</p>
        </div>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <form className="rule-form" onSubmit={handleCreate}>
          <label>
            Device
            <select
              value={form.device_id}
              onChange={(e) => updateForm("device_id", e.target.value)}
            >
              <option value="">เลือก Device</option>

              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name || device.device_code}
                </option>
              ))}
            </select>
          </label>

          <label>
            Metric
            <select
              value={form.metric}
              onChange={(e) => updateForm("metric", e.target.value)}
            >
              <option value="temperature">Temperature</option>
              <option value="humidity">Humidity</option>
              <option value="rssi">RSSI</option>
            </select>
          </label>

          <label>
            Operator
            <select
              value={form.operator}
              onChange={(e) => updateForm("operator", e.target.value)}
            >
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
          </label>

          <label>
            Threshold
            <input
              type="number"
              step="0.1"
              value={form.threshold}
              onChange={(e) => updateForm("threshold", e.target.value)}
            />
          </label>

          <label>
            Severity
            <select
              value={form.severity}
              onChange={(e) => updateForm("severity", e.target.value)}
            >
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Saving..." : "Add Rule"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="alarm-toolbar">
          <div>
            <h2>Rules List</h2>
            <p>รายการกฎแจ้งเตือนที่ตั้งค่าไว้</p>
          </div>

          <div className="alarm-filter-row">
            <button
              type="button"
              className={
                filter === "all" ? "filter-button active" : "filter-button"
              }
              onClick={() => setFilter("all")}
            >
              All
            </button>

            <button
              type="button"
              className={
                filter === "active" ? "filter-button active" : "filter-button"
              }
              onClick={() => setFilter("active")}
            >
              Active
            </button>

            <button
              type="button"
              className={
                filter === "disabled" ? "filter-button active" : "filter-button"
              }
              onClick={() => setFilter("disabled")}
            >
              Disabled
            </button>

            <button
              type="button"
              className={
                filter === "critical" ? "filter-button active" : "filter-button"
              }
              onClick={() => setFilter("critical")}
            >
              Critical
            </button>

            <button
              type="button"
              className={
                filter === "warning" ? "filter-button active" : "filter-button"
              }
              onClick={() => setFilter("warning")}
            >
              Warning
            </button>
          </div>
        </div>

        {loading && <div className="loading">Loading rules...</div>}

        {!loading && filteredRules.length === 0 && (
          <div className="empty-state">
            <h3>No rules found</h3>
            <p>ยังไม่มี Alarm Rule ในเงื่อนไขที่เลือก</p>
          </div>
        )}

        {!loading && filteredRules.length > 0 && (
          <div className="alarm-list">
            {filteredRules.map((rule) => {
              const severity = rule.severity || "warning";
              const isActive = Boolean(rule.is_active);

              return (
                <article
                  key={rule.id}
                  className={`alarm-card ${severity} ${
                    isActive ? "active" : "acknowledged"
                  }`}
                >
                  <div className="alarm-card-main">
                    <div className="alarm-title-row">
                      <div>
                        <h3>{getDeviceName(rule.device_id)}</h3>
                        <p>
                          {getMetricLabel(rule.metric)} {rule.operator}{" "}
                          {Number(rule.threshold).toFixed(1)}
                          {getUnit(rule.metric)}
                        </p>
                      </div>

                      <div className="alarm-badges">
                        <span className={`alarm-severity ${severity}`}>
                          {severity}
                        </span>

                        <span
                          className={
                            isActive
                              ? "alarm-status active"
                              : "alarm-status acknowledged"
                          }
                        >
                          {isActive ? "ACTIVE" : "DISABLED"}
                        </span>
                      </div>
                    </div>

                    <div className="alarm-detail-grid">
                      <div>
                        <label>Metric</label>
                        <strong>{getMetricLabel(rule.metric)}</strong>
                      </div>

                      <div>
                        <label>Operator</label>
                        <strong>{rule.operator}</strong>
                      </div>

                      <div>
                        <label>Threshold</label>
                        <strong>
                          {Number(rule.threshold).toFixed(1)}
                          {getUnit(rule.metric)}
                        </strong>
                      </div>

                      <div>
                        <label>Severity</label>
                        <strong>{severity}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rule-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={actionLoading === String(rule.id)}
                      onClick={() => handleToggle(rule)}
                    >
                      {isActive ? "Disable" : "Enable"}
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      disabled={actionLoading === String(rule.id)}
                      onClick={() => handleDelete(rule.id)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default AlarmRules;
