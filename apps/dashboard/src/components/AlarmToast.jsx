import { useAlarm } from "../context/AlarmContext";
import { formatMetricValue } from "../utils/metricDisplayConfig";

function AlarmToast() {
  const { alarms, removeAlarm } = useAlarm();

  const activeAlarms = alarms
    .filter((alarm) => alarm.status !== "acknowledged")
    .slice(0, 3);

  if (activeAlarms.length === 0) return null;

  return (
    <div className="alarm-toast-wrap">
      {activeAlarms.map((alarm) => (
        <div key={alarm.id} className={`alarm-toast ${alarm.severity}`}>
          <button
            className="alarm-toast-close"
            onClick={() => removeAlarm(alarm.id)}
          >
            ×
          </button>

          <strong>
            {alarm.severity === "critical" ? "Critical Alarm" : "Warning Alarm"}
          </strong>

          <p>
            {alarm.notification_message ||
              `${alarm.metric}: ${formatMetricValue(alarm.value, alarm.unit, alarm.decimal_places)} ${alarm.operator} ${formatMetricValue(alarm.threshold, alarm.unit, alarm.decimal_places)}`}
          </p>

          <small>
            {alarm.time
              ? new Date(alarm.time).toLocaleString("th-TH")
              : new Date().toLocaleString("th-TH")}
          </small>
        </div>
      ))}
    </div>
  );
}

export default AlarmToast;
