import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | undefined;
  info: ErrorInfo | undefined;
}

// Deliberately styled with plain inline CSS, not Fluent components -- if the crash
// originates inside Fluent UI itself, the fallback still has to render.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: undefined, info: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error("AFROTC SOB Tracker crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "#a4262c" }}>
          <h2 style={{ fontFamily: "sans-serif" }}>Something crashed</h2>
          <p style={{ fontFamily: "sans-serif" }}>
            Open the browser console (F12) for the full stack trace. The message below is a summary.
          </p>
          <div>{this.state.error.message}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#605e5c" }}>{this.state.error.stack}</div>
          {this.state.info && <div style={{ marginTop: 16, fontSize: 12, color: "#605e5c" }}>{this.state.info.componentStack}</div>}
        </div>
      );
    }
    return this.props.children;
  }
}
