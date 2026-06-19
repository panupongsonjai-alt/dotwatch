import React from "react";
import { useState, useEffect } from "react";

function Settings() {
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    const savedName = localStorage.getItem("projectName") || "dotWatch";

    setProjectName(savedName);
  }, []);

  const handleSave = () => {
    localStorage.setItem("projectName", projectName);

    alert("บันทึกชื่อโปรเจกต์เรียบร้อย");
  };

  return (
    <div className="page">
      <section className="panel settings-panel">
        <div className="section-title">
          <h2>Settings</h2>
          <p>ตั้งค่าระบบและข้อมูลโปรเจกต์</p>
        </div>

        <div className="form-grid">
          <label>
            Project Name
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="dotWatch"
            />
          </label>

          <label>
            Refresh Interval
            <select defaultValue="5000">
              <option value="3000">3 seconds</option>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds</option>
            </select>
          </label>
        </div>

        <button className="primary-button" onClick={handleSave}>
          Save Settings
        </button>
      </section>
    </div>
  );
}

export default Settings;
