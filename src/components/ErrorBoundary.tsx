import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

const ErrorFallback: React.FC<{ message?: string }> = ({ message }) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="nova-card p-8 max-w-md text-center">
        <div className="w-16 h-16 rounded-xl bg-destructive/15 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="nova-heading text-lg text-foreground mb-2">{t('common.appError')}</h2>
        <p className="text-sm text-muted-foreground mb-6">{message || t('common.unknownError')}</p>
        <button
          onClick={() => window.location.reload()}
          className="nova-btn-primary px-6 py-2.5"
        >
          {t('common.reload')}
        </button>
      </div>
    </div>
  );
};

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Legwan Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback message={this.state.error?.message} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
