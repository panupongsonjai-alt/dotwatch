import { getDeviceUsagePercent } from '../../utils/formatters'

function UsageBar({ user }) {
  const percent = getDeviceUsagePercent(user)

  return (
    <div className="usage-bar-wrap">
      <div className="usage-bar-label">
        <span>
          {user.deviceCount}/{user.deviceLimit}
        </span>
        <span>{percent.toFixed(0)}%</span>
      </div>

      <div className="usage-bar">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default UsageBar
