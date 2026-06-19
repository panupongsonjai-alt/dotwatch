import { useEffect, useState } from 'react'
import {
  getDemoTemplates,
  createDemoTemplate,
  deleteDemoData,
} from '../services/api'

function DemoTemplatesPanel({ onDone }) {
  const [templates, setTemplates] = useState([])
  const [loadingKey, setLoadingKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadTemplates() {
    try {
      const data = await getDemoTemplates()
      setTemplates(data)
    } catch (err) {
      console.error(err)
      setError('โหลด Demo Templates ไม่สำเร็จ')
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  async function handleCreate(templateKey) {
    try {
      setLoadingKey(templateKey)
      setError('')
      setMessage('')

      await createDemoTemplate(templateKey)

      setMessage('เพิ่ม Demo Template สำเร็จแล้ว')
      onDone?.()
    } catch (err) {
      console.error(err)
      setError('เพิ่ม Demo Template ไม่สำเร็จ')
    } finally {
      setLoadingKey('')
    }
  }

  async function handleDeleteDemo() {
    const confirmed = window.confirm(
      'ต้องการลบ Demo Devices ทั้งหมดใช่ไหม?'
    )

    if (!confirmed) return

    try {
      setLoadingKey('clear')
      setError('')
      setMessage('')

      await deleteDemoData()

      setMessage('ลบ Demo Devices สำเร็จแล้ว')
      onDone?.()
    } catch (err) {
      console.error(err)
      setError('ลบ Demo Devices ไม่สำเร็จ')
    } finally {
      setLoadingKey('')
    }
  }

  return (
    <section className="demo-panel">
      <div className="demo-panel-header">
        <div>
          <h2>Demo Templates</h2>
          <p>เลือกเพิ่มชุด Demo ทีละประเภทตาม Use Case ที่ต้องการ</p>
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={handleDeleteDemo}
          disabled={Boolean(loadingKey)}
        >
          {loadingKey === 'clear' ? 'Clearing...' : 'Clear Demo'}
        </button>
      </div>

      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <div className="demo-template-list">
        {templates.map((template) => (
          <article key={template.key} className="demo-template-row">
            <div className="demo-template-main">
              <h3>{template.name}</h3>
              <p>{template.groupName}</p>

              <div className="demo-template-devices">
                {template.devices.map((device) => (
                  <span key={device.name}>
                    {device.name}
                    <small>{device.status}</small>
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="primary-button demo-template-add"
              onClick={() => handleCreate(template.key)}
              disabled={Boolean(loadingKey)}
            >
              {loadingKey === template.key ? 'Adding...' : 'Add Template'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default DemoTemplatesPanel