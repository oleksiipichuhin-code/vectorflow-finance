import { StatusMessage } from "./Panel";

type ListLoadStateProps = {
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  onRetry: () => void;
  retryDisabled?: boolean;
  empty: boolean;
  emptyMessage: string;
};

export function ListLoadState({
  loading,
  loadingMessage,
  error,
  onRetry,
  retryDisabled = false,
  empty,
  emptyMessage
}: ListLoadStateProps) {
  if (loading) {
    return <StatusMessage>{loadingMessage}</StatusMessage>;
  }

  if (error) {
    return (
      <div className="state-actions" role="alert">
        <StatusMessage tone="error">{error}</StatusMessage>
        <button type="button" onClick={onRetry} disabled={retryDisabled}>
          Спробувати знову
        </button>
      </div>
    );
  }

  if (empty) {
    return <StatusMessage>{emptyMessage}</StatusMessage>;
  }

  return null;
}
