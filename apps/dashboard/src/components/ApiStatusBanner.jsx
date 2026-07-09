import { useEffect, useRef, useState } from 'react'

function getBannerCopy(eventName, detail = {}) {
  if (eventName === 'dotwatchApiTimeout') {
    return {
      type: 'warning',
      title: 'Backend response is slow',
      message:
        detail.message ||
        'Backend ตอบช้ากว่าที่กำหนด กรุณาตรวจสอบ Render/backend หรือกด Refresh อีกครั้ง',
    }
  }

  if (eventName === 'dotwatchApiAuthError') {
    return {
      type: detail.status === 403 ? 'error' : 'warning',
      title: detail.status === 403 ? 'Permission denied' : 'Session needs refresh',
      message:
        detail.message ||
        'สิทธิ์การใช้งานไม่ถูกต้องหรือ token หมดอายุ กรุณา refresh หรือล็อกอินใหม่',
    }
  }

  return null
}

function ApiStatusBanner() {
  const [banner, setBanner] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    function showBanner(event) {
      const nextBanner = getBannerCopy(event.type, event.detail)

      if (!nextBanner) return

      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }

      setBanner({
        ...nextBanner,
        id: `${event.type}-${Date.now()}`,
      })

      timerRef.current = window.setTimeout(() => {
        setBanner(null)
        timerRef.current = null
      }, 8000)
    }

    window.addEventListener('dotwatchApiTimeout', showBanner)
    window.addEventListener('dotwatchApiAuthError', showBanner)

    return () => {
      window.removeEventListener('dotwatchApiTimeout', showBanner)
      window.removeEventListener('dotwatchApiAuthError', showBanner)

      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  if (!banner) return null

  return (
    <div className={`dw-api-status-banner ${banner.type}`} role="status">
      <div>
        <strong>{banner.title}</strong>
        <span>{banner.message}</span>
      </div>

      <button type="button" onClick={() => setBanner(null)}>
        Dismiss
      </button>
    </div>
  )
}

export default ApiStatusBanner
