import React from "react";

export default class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Keep the on-screen recovery message clear and avoid exposing error details.
    console.error("The app stopped while rendering. Recovery screen shown.");
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main
          role="alert"
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "#f8fafc",
            color: "#0f172a",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "420px",
              padding: "24px",
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              background: "#fff",
              boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
            }}
          >
            <h1 style={{ margin: "0 0 12px", fontSize: "1.4rem" }}>This page didn’t load</h1>
            <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
              Reload the staff browser to try again. If this keeps happening, contact support.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                width: "100%",
                minHeight: "48px",
                border: 0,
                borderRadius: "8px",
                background: "#6d28d9",
                color: "#fff",
                font: "inherit",
                fontWeight: 600,
              }}
            >
              Reload staff browser
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
