import { Component } from 'react'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)

    this.state = {
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('dotWatch admin page error:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <section className="admin-error-state" role="alert">
        <div>
          <span className="page-eyebrow">Admin page error</span>
          <h2>{this.props.title || 'This admin page failed to load'}</h2>
          <p>
            The admin console caught a rendering error before it could break the
            whole workspace. Please reset the page and try again.
          </p>
          <small>{this.state.error?.message || 'Unknown error'}</small>
        </div>

        <button type="button" className="primary-button" onClick={this.handleReset}>
          Reset page
        </button>
      </section>
    )
  }
}

export default AppErrorBoundary
