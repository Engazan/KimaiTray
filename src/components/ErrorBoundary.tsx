import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../utils/logger";
import i18n from "../shared/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(`Uncaught error: ${error.message}\n${info.componentStack}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: 14, color: "#ef4444", fontWeight: 600 }}>
            {i18n.t("common.somethingWentWrong")}
          </p>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "6px 20px",
              fontSize: 12,
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
            }}
          >
            {i18n.t("common.reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
