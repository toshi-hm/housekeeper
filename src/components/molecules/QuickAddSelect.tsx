import { Check, Loader2, Plus, X } from "lucide-react";
import { forwardRef, type KeyboardEvent, type SelectHTMLAttributes, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface QuickAddSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  onAdd: (name: string) => Promise<void>;
  addLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  errorMessage?: string;
}

export const QuickAddSelect = forwardRef<HTMLSelectElement, QuickAddSelectProps>(
  (
    {
      onAdd,
      addLabel = "追加",
      confirmLabel = "確認",
      cancelLabel = "キャンセル",
      errorMessage = "追加に失敗しました",
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleOpen = () => {
      setIsEditing(true);
      setInputValue("");
      setAddError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    };

    const handleCancel = () => {
      setIsEditing(false);
      setInputValue("");
      setAddError(null);
    };

    const handleConfirm = async () => {
      const name = inputValue.trim();
      if (!name || isAdding) return;
      setIsAdding(true);
      setAddError(null);
      try {
        await onAdd(name);
        setIsEditing(false);
        setInputValue("");
      } catch {
        setAddError(errorMessage);
      } finally {
        setIsAdding(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleConfirm();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    };

    return (
      <div>
        <div className="flex gap-2">
          <Select ref={ref} {...props} className={cn("flex-1", className)}>
            {children}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleOpen}
            disabled={isEditing || isAdding}
            title={addLabel}
            aria-label={addLabel}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {isEditing && (
          <div className="mt-1.5 flex gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={addLabel}
              className="h-8 flex-1 text-sm"
              disabled={isAdding}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => void handleConfirm()}
              disabled={isAdding || !inputValue.trim()}
              aria-label={confirmLabel}
            >
              {isAdding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCancel}
              disabled={isAdding}
              aria-label={cancelLabel}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {addError && <p className="mt-1 text-xs text-destructive">{addError}</p>}
      </div>
    );
  },
);
QuickAddSelect.displayName = "QuickAddSelect";
