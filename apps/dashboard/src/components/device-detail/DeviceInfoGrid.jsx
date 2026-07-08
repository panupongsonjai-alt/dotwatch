import { formatDate } from './deviceDetailUtils'
import { getEsp32DefaultPinHint, isEsp32Dht3Device } from '../../utils/esp32Dht3Utils.js'

function DeviceInfoGrid({ device }) {
  return (
    <div className="device-info-grid-ds">
      <div>
        <label>Device Code</label>
        <p>{device.device_code}</p>
      </div>
      <div>
        <label>Model</label>
        <p>{device.model_name || '--'}</p>
      </div>
      <div>
        <label>Group</label>
        <p>{device.group_name || 'Default'}</p>
      </div>
      <div>
        <label>Firmware</label>
        <p>{device.firmware_version || '--'}</p>
      </div>

      {isEsp32Dht3Device(device) && (
        <>
          <div>
            <label>Local Admin URL</label>
            <p>à¸”à¸¹ IP à¸ˆà¸²à¸ Serial Monitor à¹à¸¥à¹‰à¸§à¹€à¸›à¸´à¸” http://ESP32_IP/</p>
          </div>
          <div>
            <label>Default PIN</label>
            <p>{getEsp32DefaultPinHint(device)}</p>
          </div>
        </>
      )}
      <div>
        <label>Latitude</label>
        <p>
          {device.latitude != null ? Number(device.latitude).toFixed(6) : '--'}
        </p>
      </div>
      <div>
        <label>Longitude</label>
        <p>
          {device.longitude != null
            ? Number(device.longitude).toFixed(6)
            : '--'}
        </p>
      </div>
      <div>
        <label>Latest Reading</label>
        <p>{formatDate(device.latest_time)}</p>
      </div>
      <div>
        <label>Last Ingest</label>
        <p>{formatDate(device.last_ingest_at)}</p>
      </div>
    </div>
  )
}

export default DeviceInfoGrid


