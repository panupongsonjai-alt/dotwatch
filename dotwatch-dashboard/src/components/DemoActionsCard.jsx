import { useState } from "react";
import {
  generateDemoAlarmNow,
  generateDemoOfflineNow,
  generateDemoHistoryNow,
  deleteDemoData,
} from "../services/api";

function DemoActionsCard({ onDone }) {
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function runAction(actionName, actionFn, successMessage) {
    try {
      setLoading(actionName);
      setMessage("");
      setError("");

      await actionFn();

      setMessage(successMessage);
      onDone?.();
    } catch (err) {
      console.error(err);
      setError("ทำรายการไม่สำเร็จ กรุณาสร้าง Demo Template ก่อน");
    } finally {
      setLoading("");
    }
  }

  async function handleClearDemo() {
    const confirmed = window.confirm(
      "ต้องการลบ Demo Devices และข้อมูล Demo ทั้งหมดใช่ไหม?",
    );

    if (!confirmed) return;

    await runAction("clear", deleteDemoData, "ลบข้อมูล Demo สำเร็จแล้ว");
  }

  return (
    <section className="demo-actions-card">
      <div className="demo-panel-header">
        <div>
          <h2>Demo Actions</h2>
          <p>สั่งจำลองเหตุการณ์ทันที สำหรับใช้พรีเซนต์ลูกค้า</p>
        </div>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <div className="demo-actions-grid">
        <button
          type="button"
          className="primary-button"
          disabled={Boolean(loading)}
          onClick={() =>
            runAction(
              "alarm",
              generateDemoAlarmNow,
              "สร้าง Alarm ตัวอย่างสำเร็จแล้ว",
            )
          }
        >
          {loading === "alarm" ? "Generating..." : "Generate Alarm Now"}
        </button>

        <button
          type="button"
          className="primary-button"
          disabled={Boolean(loading)}
          onClick={() =>
            runAction(
              "offline",
              generateDemoOfflineNow,
              "จำลอง Device Offline สำเร็จแล้ว",
            )
          }
        >
          {loading === "offline" ? "Generating..." : "Generate Offline Device"}
        </button>

        <button
          type="button"
          className="primary-button"
          disabled={Boolean(loading)}
          onClick={() =>
            runAction(
              "history",
              generateDemoHistoryNow,
              "สร้างข้อมูลย้อนหลัง 24 ชั่วโมงสำเร็จแล้ว",
            )
          }
        >
          {loading === "history" ? "Generating..." : "Generate 24h History"}
        </button>

        <button
          type="button"
          className="ghost-button"
          disabled={Boolean(loading)}
          onClick={handleClearDemo}
        >
          {loading === "clear" ? "Clearing..." : "Clear Demo Data"}
        </button>
      </div>
    </section>
  );
}

export default DemoActionsCard;
