import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Cpu,
  KeyRound,
  MapPin,
  ShieldCheck,
  X,
} from 'lucide-react'
import LocationPicker from '../LocationPicker.jsx'

function formatLocation(latitude, longitude) {
  if (latitude == null || longitude == null) return 'Not selected'

  return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`
}

function StepItem({ number, title, description, active, done }) {
  return (
    <div className={`wizard-v2-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span>{done ? <CheckCircle2 size={15} /> : number}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
    </div>
  )
}

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

  const displayName = createForm.name.trim() || `dotWatch ${devices.length + 1}`

  function goNext() {
    setCreateStep((step) => Math.min(step + 1, 4))
  }

  function goBack() {
    setCreateStep((step) => Math.max(step - 1, 1))
  }

  return (
    <div className="modal-backdrop wizard-v2-backdrop">
      <div className="wizard-v2-modal">
        <aside className="wizard-v2-sidebar">
          <div className="wizard-v2-brand">
            <div className="wizard-v2-brand-icon">
              <Cpu size={22} />
            </div>
            <div>
              <span className="page-eyebrow">Device Setup</span>
              <h3>Create Device</h3>
              <p>เพิ่มอุปกรณ์ใหม่เข้าสู่ระบบ dotWatch</p>
            </div>
          </div>

          <div className="wizard-v2-steps">
            <StepItem
              number="1"
              title="Information"
              description="Name, model and credentials"
              active={createStep === 1}
              done={createStep > 1}
            />
            <StepItem
              number="2"
              title="Location"
              description="Map position for monitoring"
              active={createStep === 2}
              done={createStep > 2}
            />
            <StepItem
              number="3"
              title="Review"
              description="Confirm before creating"
              active={createStep === 3}
              done={createStep > 3}
            />
            <StepItem
              number="4"
              title="Finish"
              description="Copy device secret"
              active={createStep === 4}
              done={false}
            />
          </div>

          <div className="wizard-v2-note">
            <ShieldCheck size={18} />
            <p>
              Device Secret จะแสดงหลังสร้างสำเร็จเท่านั้น กรุณา Copy เก็บไว้ทันที
            </p>
          </div>
        </aside>

        <section className="wizard-v2-main">
          <div className="wizard-v2-header">
            <div>
              <span className="page-eyebrow">Step {createStep} of 4</span>
              <h2>
                {createStep === 1 && 'Device Information'}
                {createStep === 2 && 'Device Location'}
                {createStep === 3 && 'Review Device'}
                {createStep === 4 && 'Device Created'}
              </h2>
              <p>
                {createStep === 1 && 'ตั้งชื่อ เลือกรุ่น และเตรียมข้อมูลสำหรับ Firmware'}
                {createStep === 2 && 'เลือกตำแหน่งอุปกรณ์เพื่อใช้กับแผนที่และ Monitoring'}
                {createStep === 3 && 'ตรวจสอบข้อมูลก่อนสร้าง Device'}
                {createStep === 4 && 'Copy Device Code และ Secret ไปใส่ในอุปกรณ์'}
              </p>
            </div>

            <button
              type="button"
              className="wizard-v2-close"
              onClick={onClose}
              disabled={saving}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="wizard-v2-content">
            {createStep === 1 && (
              <div className="wizard-v2-section-grid">
                <div className="wizard-v2-form-card">
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

                  <div className="wizard-v2-model-section">
                    <div className="wizard-v2-field-title">
                      <strong>Device Model</strong>
                      <span>เลือกรุ่นอุปกรณ์ให้ตรงกับจำนวน Channel</span>
                    </div>

                    <div className="wizard-v2-model-grid">
                      {deviceModelOptions.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          className={`wizard-v2-model-card ${
                            Number(model.id) === Number(createForm.modelId)
                              ? 'active'
                              : ''
                          }`}
                          onClick={() =>
                            setCreateForm((prev) => ({
                              ...prev,
                              modelId: Number(model.id),
                            }))
                          }
                        >
                          <Cpu size={20} />
                          <strong>{model.name}</strong>
                          <span>{model.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="wizard-v2-copy-grid wizard-v2-copy-grid-single">
                    <label>
                      Device Code
                      <div className="copy-input">
                        <input value={createForm.deviceCode} disabled />
                        <button
                          type="button"
                          onClick={() => onCopy(createForm.deviceCode)}
                          aria-label="Copy device code"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="wizard-v2-secret-note">
                    <KeyRound size={17} />
                    <span>
                      Device Secret จะถูกสร้างและแสดงในขั้นตอนสุดท้ายหลังบันทึกสำเร็จเท่านั้น
                    </span>
                  </div>
                </div>

                <div className="wizard-v2-preview-card">
                  <span className="wizard-v2-preview-label">Preview</span>
                  <h3>{displayName}</h3>
                  <p>{createForm.deviceCode}</p>

                  <div className="wizard-v2-preview-meta">
                    <div>
                      <span>Model</span>
                      <strong>{selectedModel?.name || '--'}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>Waiting setup</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {createStep === 2 && (
              <div className="wizard-v2-location-layout">
                <div className="wizard-v2-location-card">
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

                <div className="wizard-v2-help-card">
                  <MapPin size={24} />
                  <h4>Location is optional</h4>
                  <p>
                    สามารถข้ามได้ และกลับไปตั้งค่า Location ได้อีกครั้งในหน้า Devices
                  </p>
                </div>
              </div>
            )}

            {createStep === 3 && (
              <div className="wizard-v2-review-card">
                <h3>Confirm Device</h3>
                <p>ตรวจสอบข้อมูลก่อนสร้าง Device จริงในระบบ</p>

                <div className="wizard-v2-review-grid">
                  <div>
                    <span>Name</span>
                    <strong>{displayName}</strong>
                  </div>
                  <div>
                    <span>Model</span>
                    <strong>{selectedModel?.name || '--'}</strong>
                  </div>
                  <div>
                    <span>Device Code</span>
                    <strong>{createForm.deviceCode}</strong>
                  </div>
                  <div>
                    <span>Location</span>
                    <strong>
                      {formatLocation(createForm.latitude, createForm.longitude)}
                    </strong>
                  </div>
                </div>

                <div className="confirm-warning wizard-v2-warning">
                  <KeyRound size={18} />
                  Device Secret จะแสดงหลังสร้างสำเร็จ กรุณา Copy เก็บไว้ทันที
                </div>
              </div>
            )}

            {createStep === 4 && createdDevice && (
              <div className="wizard-v2-success-card">
                <div className="wizard-v2-success-icon">
                  <CheckCircle2 size={44} />
                </div>

                <h3>Device Created Successfully</h3>
                <p>นำ Device Code และ Device Secret ไปตั้งค่าใน Firmware</p>

                <div className="secret-result-box wizard-v2-secret-box">
                  <div className="wizard-v2-copy-all-row">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() =>
                        onCopy(
                          `DEVICE_CODE=${createdDevice.deviceCode}\nDEVICE_SECRET=${createdDevice.deviceSecret}`
                        )
                      }
                    >
                      <Copy size={16} />
                      Copy Code + Secret
                    </button>
                  </div>

                  <label>
                    Device Code
                    <div className="copy-input">
                      <input value={createdDevice.deviceCode} disabled />
                      <button
                        type="button"
                        onClick={() => onCopy(createdDevice.deviceCode)}
                        aria-label="Copy device code"
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
                        aria-label="Copy device secret"
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
                          value={formatLocation(
                            createdDevice.latitude,
                            createdDevice.longitude
                          )}
                          disabled
                        />
                      </label>
                    )}
                </div>
              </div>
            )}
          </div>

          <div className="wizard-v2-actions">
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
                    onClick={goBack}
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
                    onClick={goNext}
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
        </section>
      </div>
    </div>
  )
}

export default CreateDeviceWizard
