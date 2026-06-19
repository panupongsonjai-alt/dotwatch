import { useEffect, useState } from "react";
import DemoTemplatesPanel from "../components/DemoTemplatesPanel";
import DemoGeneratorCard from "../components/DemoGeneratorCard";
import { getDemoStatistics } from "../services/api";
import DemoActionsCard from "../components/DemoActionsCard";

function DemoCenter() {
  const [stats, setStats] = useState({
    demo_devices: 0,
    generated_readings: 0,
    generated_alarms: 0,
    last_run_at: null,
  });

  async function loadStatistics() {
    try {
      const data = await getDemoStatistics();
      setStats(data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadStatistics();

    const timer = setInterval(loadStatistics, 10000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Demo Center</h1>
          <p>จัดการข้อมูล Demo สำหรับทดสอบ และพรีเซนต์ลูกค้า</p>
        </div>
      </div>

      <section className="stats-grid">
        <article className="stat-card">
          <h3>Demo Devices</h3>
          <strong>{stats.demo_devices}</strong>
        </article>

        <article className="stat-card">
          <h3>Generated Readings</h3>
          <strong>
            {Number(stats.generated_readings || 0).toLocaleString()}
          </strong>
        </article>

        <article className="stat-card">
          <h3>Generated Alarms</h3>
          <strong>
            {Number(stats.generated_alarms || 0).toLocaleString()}
          </strong>
        </article>

        <article className="stat-card">
          <h3>Last Run</h3>
          <strong>
            {stats.last_run_at
              ? new Date(stats.last_run_at).toLocaleTimeString()
              : "--"}
          </strong>
        </article>
      </section>

      <DemoGeneratorCard onDone={loadStatistics} />

      <DemoActionsCard onDone={loadStatistics} />

      <DemoTemplatesPanel onDone={loadStatistics} />
    </div>
  );
}

export default DemoCenter;
