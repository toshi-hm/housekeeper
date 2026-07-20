import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const ErrorFallback = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation("common");
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-muted-foreground">{t("unknownError")}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // oxlint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
    reportError(error);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <ErrorFallback onRetry={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}
