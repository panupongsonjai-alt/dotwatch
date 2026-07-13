import { useAlarm } from "../context/AlarmContext";
import { formatMetricValue } from "../utils/metricDisplayConfig";

function AlarmPanel() {
  const { alarms } = useAlarm();

  if (alarms.length === 0) {
    return null;
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h2>Active Alarms</h2>
      </div>

      <div className="alarm-list">
        {alarms.map((alarm) => (
          <div key={alarm.id} className={`alarm-card ${alarm.severity}`}>
            <strong>{alarm.metric}</strong>

            <p>
              {formatMetricValue(alarm.value, alarm.unit, alarm.decimal_places)}{' '}
              {alarm.operator}{' '}
              {formatMetricValue(alarm.threshold, alarm.unit, alarm.decimal_places)}
            </p>

            <small>{alarm.severity}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export default AlarmPanel;
