interface SpinnerProps {
  className?: string;
  label?: string;
}

export const Spinner = ({ className = "", label = "Loading" }: SpinnerProps) => (
  <div
    className={`inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    role="status"
    aria-label={label}
  />
);
