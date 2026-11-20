import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="pin-screen">
          <div className="pin-card">
            <h2>Something went wrong</h2>
            <p style={{ fontSize: 12, wordBreak: 'break-word' }}>{this.state.error.message}</p>
            <button className="primary-button" type="button" onClick={() => location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
