import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  KeyRound,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'

function CreateDeviceWizard({
  show,
  saving,
  devices,
  createStep,
  setCreateStep,
  createForm,
  setCreateForm,
  createdDevice,
  deviceModelOptions,
  onClose,
  onCopy,
  onConfirmCreate,
}) {
  if (!show) return null

  const selectedModel = deviceModelOptions.find(
    (model) => Number(model.id) === Number(createForm.modelId)
  )

  return (
    <div className="modal-backdrop">
      <div className="device-create-modal clean-device-modal pro-device-modal">
        <div className="modal-header pro-modal-header">
          <div>
            <span className="page-eyebrow">Device Setup</span>
            <h3>Create Device</h3>
            <p>สร้างอุปกรณ์ใหม่สำหรับใช้งานกับ dotWatch</p>
          </div>

          <button type="button" onClick={onClose} disabled={saving}>
            ×
          </button>
        </div>

        <div className="pro-stepper four-step">
          <div className={createStep >= 1 ? 'active' : ''}>
            <span>1</span>
            <strong>Information</strong>
          </div>

          <div className={createStep >= 2 ? 'active' : ''}>
            <span>2</span>
            <strong>Location</strong>
          </div>

          <div className={createStep >= 3 ? 'active' : ''}>
            <span>3</span>
            <strong>Review</strong>
          </div>

          <div className={createStep >= 4 ? 'active' : ''}>
            <span>4</span>
            <strong>Success</strong>
            <small>Copy Secret</small>
          </div>
        </div>

        <div className="pro-wizard-content">
          {createStep === 1 && (
            <div className="pro-device-details">
              <div className="pro-form-card">
                <label>
                  Device Name
                  <input
                    value={createForm.name}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="เช่น AHU-01, PI Gateway, Main Meter"
                  />
                </label>

                <label>
                  Device Model
                  <select
                    value={createForm.modelId}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        modelId: Number(event.target.value),
                      }))
                    }
                  >
                    {deviceModelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} - {model.description}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Device Code
                  <div className="copy-input">
                    <input value={createForm.deviceCode} disabled />
                    <button
                      type="button"
                      onClick={() => onCopy(createForm.deviceCode)}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </label>

                <label>
                  Device Secret
                  <div className="copy-input">
                    <input value={createForm.deviceSecret} disabled />
                    <button
                      type="button"
                      onClick={() => onCopy(createForm.deviceSecret)}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </label>
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="pro-device-details">
              <div className="pro-location-card">
                <div className="device-location-header">
                  <strong>
                    <MapPin size={16} />
                    Device Location
                  </strong>
                  <span>เลือกตำแหน่งอุปกรณ์ตั้งแต่ขั้นตอนสร้าง Device</span>
                </div>

                <LocationPicker
                  latitude={createForm.latitude}
                  longitude={createForm.longitude}
                  onChange={(location) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      latitude: location.latitude,
                      longitude: location.longitude,
                    }))
                  }
                />

                <div className="create-location-values">
                  <span>
                    Lat:{' '}
                    {createForm.latitude != null
                      ? Number(createForm.latitude).toFixed(6)
                      : '--'}
                  </span>

                  <span>
                    Lng:{' '}
                    {createForm.longitude != null
                      ? Number(createForm.longitude).toFixed(6)
                      : '--'}
                  </span>
                </div>
              </div>

              <div className="pro-info-card">
                <ShieldCheck size={28} />
                <h4>Device Secret</h4>
                <p>
                  ระบบจะสร้าง Device Secret อัตโนมัติ และจะแสดงหลังสร้างสำเร็จ
                  กรุณา Copy เก็บไว้ทันที
                </p>
              </div>
            </div>
          )}

          {createStep === 3 && (
            <div className="pro-confirm-layout">
              <div className="confirm-summary-card">
                <h4>Confirm Device</h4>

                <div className="confirm-row">
                  <span>Name</span>
                  <strong>
                    {createForm.name.trim() || `dotWatch ${devices.length + 1}`}
                  </strong>
                </div>

                <div className="confirm-row">
                  <span>Model</span>
                  <strong>{selectedModel?.name || '--'}</strong>
                </div>

                <div className="confirm-row">
                  <span>Device Code</span>
                  <strong>{createForm.deviceCode}</strong>
                </div>

                <div className="confirm-row">
                  <span>Location</span>
                  <strong>
                    {createForm.latitude != null && createForm.longitude != null
                      ? `${Number(createForm.latitude).toFixed(6)}, ${Number(
                          createForm.longitude
                        ).toFixed(6)}`
                      : 'Not selected'}
                  </strong>
                </div>

                <div className="confirm-warning">
                  <KeyRound size={18} />
                  Device Secret จะแสดงหลังสร้างสำเร็จ กรุณา Copy เก็บไว้ทันที
                </div>
              </div>
            </div>
          )}

          {createStep === 4 && createdDevice && (
            <div className="device-success-card">
              <CheckCircle2 size={44} />
              <h4>Device Created Successfully</h4>
              <p>กรุณา Copy Device Secret เก็บไว้ทันที</p>

              <div className="secret-result-box">
                <label>
                  Device Code
                  <div className="copy-input">
                    <input value={createdDevice.deviceCode} disabled />
                    <button
                      type="button"
                      onClick={() => onCopy(createdDevice.deviceCode)}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </label>

                <label>
                  Device Secret
                  <div className="copy-input">
                    <input value={createdDevice.deviceSecret} disabled />
                    <button
                      type="button"
                      onClick={() => onCopy(createdDevice.deviceSecret)}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </label>

                {createdDevice.latitude != null &&
                  createdDevice.longitude != null && (
                    <label>
                      Location
                      <input
                        value={`${Number(createdDevice.latitude).toFixed(
                          6
                        )}, ${Number(createdDevice.longitude).toFixed(6)}`}
                        disabled
                      />
                    </label>
                  )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions pro-modal-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            disabled={saving}
          >
            {createStep === 4 ? 'Done' : 'Cancel'}
          </button>

          {createStep < 4 && (
            <div>
              {createStep > 1 && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setCreateStep((step) => step - 1)}
                  disabled={saving}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}

              {createStep < 3 ? (
                <button
                  type="button"
                  className="primary-button modal-next-button"
                  onClick={() => setCreateStep((step) => step + 1)}
                  disabled={saving}
                >
                  Next
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button modal-next-button"
                  onClick={onConfirmCreate}
                  disabled={saving}
                >
                  {saving ? 'Creating...' : 'Confirm Create'}
                  <CheckCircle2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateDeviceWizard
