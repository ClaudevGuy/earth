import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message || "Something broke." };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="shell">
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", letterSpacing: "-0.04em" }}>Earth</h1>
          <p className="notice alert">{this.state.error}</p>
          <button type="button" className="primary" onClick={() => this.setState({ error: undefined })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
