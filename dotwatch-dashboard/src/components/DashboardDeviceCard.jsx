import React from "react";
import { Droplets, Thermometer, Wifi } from "lucide-react";

function DashboardDeviceCard({ device, health }) {
  const statusClass =
    device.status === "online"
      ? "status online"
      : device.status === "warning"
        ? "status warning"
        : "status offline";

  return (
    <article className="dashboard-device-card">
      <div className="device-header">
        <div>
          <h3>{device.name || "Unnamed Device"}</h3>
          <small>{device.deviceId}</small>
        </div>

        <div className="device-header-right">
          <span className={statusClass}>{device.status || "offline"}</span>

          <span className={`health-badge ${health?.className || "healthy"}`}>
            {health?.label || "Healthy"}
          </span>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric">
          <Thermometer size={18} />

          <span>
            {device.temperature != null
              ? Number(device.temperature).toFixed(1)
              : "--"}
            °C
          </span>

          <small>Temperature</small>
        </div>

        <div className="metric">
          <Droplets size={18} />

          <span>
            {device.humidity != null
              ? Number(device.humidity).toFixed(1)
              : "--"}
            %
          </span>

          <small>Humidity</small>
        </div>

        <div className="metric">
          <Wifi size={18} />

          <span>{device.rssi != null ? `${device.rssi} dBm` : "--"}</span>

          <small>RSSI</small>
        </div>
      </div>

      <div className="device-footer">
        <small>
          Last Seen:{" "}
          {device.lastSeen
            ? new Date(device.lastSeen).toLocaleString("th-TH")
            : "--"}
        </small>

        {health?.reason && (
          <small className="health-reason">{health.reason}</small>
        )}
      </div>
    </article>
  );
}

export default DashboardDeviceCard;
