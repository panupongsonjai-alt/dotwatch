import { Component } from 'react'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)

    this.state = {
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })

    if (import.meta.env.DEV) {
      console.error('dotWatch UI error boundary:', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null })

    if (typeof this.props.onReset === 'function') {
      this.props.onReset()
    }
  }

  render() {
    const { children, title = 'Workspace error' } = this.props
    const { error, errorInfo } = this.state

    if (!error) return children

    return (
      <section className="dw-error-boundary" role="alert">
        <div className="dw-error-boundary-icon">!</div>

        <div className="dw-error-boundary-copy">
          <span className="page-eyebrow">dotWatch UI Guard</span>
          <h2>{title}</h2>
          <p>
            หน้านี้โหลดไม่สำเร็จจาก error ฝั่ง UI แต่ระบบยังไม่ logout และยังสามารถกลับไปหน้า Dashboard เพื่อทำงานต่อได้
          </p>

          {import.meta.env.DEV && (
            <details>
              <summary>Developer details</summary>
              <pre>{String(error?.message || error)}</pre>
              {errorInfo?.componentStack && <pre>{errorInfo.componentStack}</pre>}
            </details>
          )}

          <div className="dw-error-boundary-actions">
            <button type="button" className="primary-button" onClick={this.handleReset}>
              Back to Dashboard
            </button>
            <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
              Reload App
            </button>
          </div>
        </div>
      </section>
    )
  }
}

export default AppErrorBoundary
