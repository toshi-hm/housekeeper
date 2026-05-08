import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface QuickAddOption {
  value: string;
  label: string;
}

interface QuickAddSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: QuickAddOption[];
  placeholder?: string;
  onAdd: (name: string) => Promise<void>;
  onDelete?: (value: string) => Promise<void>;
  addLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  addErrorMessage?: string;
}

export const QuickAddSelect = ({
  id,
  value,
  onChange,
  options,
  placeholder = "選択",
  onAdd,
  onDelete,
  addLabel = "追加",
  confirmLabel = "確認",
  cancelLabel = "キャンセル",
  addErrorMessage = "追加に失敗しました",
}: QuickAddSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setDeleteError(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setDeleteError(null);
  };

  const handleOpenAdd = () => {
    setIsEditing(true);
    setInputValue("");
    setAddError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleCancelAdd = () => {
    setIsEditing(false);
    setInputValue("");
    setAddError(null);
  };

  const handleConfirmAdd = async () => {
    const name = inputValue.trim();
    if (!name || isAdding) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await onAdd(name);
      setIsEditing(false);
      setInputValue("");
      setIsOpen(false);
    } catch {
      setAddError(addErrorMessage);
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleConfirmAdd();
    } else if (e.key === "Escape") {
      handleCancelAdd();
    }
  };

  const handleDelete = async (e: React.MouseEvent, optionValue: string) => {
    e.stopPropagation();
    if (!onDelete || deletingId) return;
    setDeletingId(optionValue);
    setDeleteError(null);
    try {
      await onDelete(optionValue);
      if (value === optionValue) {
        onChange("");
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "削除できません");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        id={id}
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => {
          setIsOpen((v) => !v);
          setDeleteError(null);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selectedOption ? "text-foreground" : "text-muted-foreground"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {/* Empty/clear option */}
            <button
              type="button"
              className={`w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent ${!value ? "bg-accent/50 font-medium" : ""}`}
              onClick={() => handleSelect("")}
            >
              {placeholder}
            </button>

            {options.map((option) => (
              <div
                key={option.value}
                className={`flex items-center ${option.value === value ? "bg-accent/50" : "hover:bg-accent"}`}
              >
                <button
                  type="button"
                  className="flex-1 px-3 py-2 text-left text-sm"
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="mr-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    onClick={(e) => void handleDelete(e, option.value)}
                    disabled={!!deletingId}
                    aria-label="削除"
                  >
                    {deletingId === option.value ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Delete error */}
          {deleteError && (
            <p className="border-t px-3 py-1.5 text-xs text-destructive">{deleteError}</p>
          )}

          {/* Add section */}
          <div className="border-t p-2">
            {isEditing ? (
              <>
                <div className="flex gap-1.5">
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
                    onClick={() => void handleConfirmAdd()}
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
                    onClick={handleCancelAdd}
                    disabled={isAdding}
                    aria-label={cancelLabel}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {addError && <p className="mt-1 text-xs text-destructive">{addError}</p>}
              </>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleOpenAdd}
              >
                <Plus className="h-3.5 w-3.5" />
                {addLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
QuickAddSelect.displayName = "QuickAddSelect";
