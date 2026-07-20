import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Keeps a render error in one view from blanking the whole window. A data-shape
 * hiccup (e.g. the daemon and frontend briefly out of sync during dev HMR)
 * shows a recoverable message instead of a black screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="view placeholder">
          <div style={{ maxWidth: 520, textAlign: "center" }}>
            <p style={{ color: "var(--ink)", fontFamily: "var(--font-sans)" }}>Something broke rendering this view.</p>
            <pre style={{ fontSize: 11, color: "var(--status-failed)", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)" }}>
              {this.state.error.message}
            </pre>
            <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
