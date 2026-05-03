export const Spinner = ({ className = "" }: { className?: string }) => (
  <div
    className={`inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    role="status"
    aria-label="読み込み中"
  />
);
