import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MasterDataIcon } from "@/components/atoms/MasterDataIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QuickAddOption {
  value: string;
  label: string;
  /** lucide icon name (categories/storage_locations.icon), rendered before the label */
  icon?: string | null;
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
  /** Whether to show the "no selection" option at the top of the dropdown.
   *  Defaults to true. Set to false for fields that must always hold a value
   *  (e.g. content_unit), so the user can't clear it to empty. */
  allowClear?: boolean;
}

export const QuickAddSelect = ({
  id,
  value,
  onChange,
  options,
  placeholder,
  onAdd,
  onDelete,
  addLabel,
  confirmLabel,
  cancelLabel,
  addErrorMessage,
  allowClear = true,
}: QuickAddSelectProps) => {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("common:select");
  const resolvedAddLabel = addLabel ?? t("common:add");
  const resolvedConfirmLabel = confirmLabel ?? t("common:confirm");
  const resolvedCancelLabel = cancelLabel ?? t("common:cancel");
  const resolvedAddErrorMessage = addErrorMessage ?? t("items:addError");
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // When allowClear, index 0 is the "no selection" option and index 1..n map
  // to `options`; otherwise index 0..n-1 map directly to `options`.
  const allOptions = allowClear ? [{ value: "", label: placeholder }, ...options] : options;
  const optionIndexOffset = allowClear ? 1 : 0;
  const selectedOption = options.find((o) => o.value === value);
  const listboxId = id ? `${id}-listbox` : undefined;

  const openDropdown = (initialFocusIndex?: number) => {
    setDeleteError(null);
    setIsOpen(true);
    const idx =
      initialFocusIndex ??
      Math.max(
        0,
        allOptions.findIndex((o) => o.value === value),
      );
    setTimeout(() => optionRefs.current[idx]?.focus(), 0);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setDeleteError(null);
    triggerRef.current?.focus();
  };

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
    closeDropdown();
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
      closeDropdown();
    } catch {
      setAddError(resolvedAddErrorMessage);
    } finally {
      setIsAdding(false);
    }
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleConfirmAdd();
    } else if (e.key === "Escape") {
      handleCancelAdd();
    }
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openDropdown(isOpen ? undefined : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openDropdown(isOpen ? undefined : allOptions.length - 1);
    } else if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      closeDropdown();
    } else if (e.key === " ") {
      // prevent page scroll; click event fires naturally
      e.preventDefault();
      if (!isOpen) openDropdown();
      else closeDropdown();
    }
  };

  const handleOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = index + 1;
      if (next < allOptions.length) optionRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index === 0) closeDropdown();
      else optionRefs.current[index - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
    } else if (e.key === "Tab") {
      closeDropdown();
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
      setDeleteError(err instanceof Error ? err.message : t("common:unknownError"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => {
          if (isOpen) closeDropdown();
          else openDropdown();
        }}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
      >
        <span
          className={`flex items-center gap-1.5 ${selectedOption ? "text-foreground" : "text-muted-foreground"}`}
        >
          {selectedOption && <MasterDataIcon icon={selectedOption.icon} className="h-3.5 w-3.5" />}
          {selectedOption?.label ?? resolvedPlaceholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          {/* Options list */}
          <div
            id={listboxId}
            role="listbox"
            aria-label={placeholder}
            className="max-h-52 overflow-y-auto"
          >
            {/* Empty/clear option */}
            {allowClear && (
              <button
                ref={(el) => {
                  optionRefs.current[0] = el;
                }}
                type="button"
                role="option"
                aria-selected={!value}
                className={`w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${!value ? "bg-accent/50 font-medium" : ""}`}
                onClick={() => handleSelect("")}
                onKeyDown={(e) => handleOptionKeyDown(e, 0)}
              >
                {resolvedPlaceholder}
              </button>
            )}

            {options.map((option, idx) => (
              <div
                key={option.value}
                className={`flex items-center ${option.value === value ? "bg-accent/50" : "hover:bg-accent"}`}
              >
                <button
                  ref={(el) => {
                    optionRefs.current[idx + optionIndexOffset] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className="flex flex-1 items-center justify-between px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => handleSelect(option.value)}
                  onKeyDown={(e) => handleOptionKeyDown(e, idx + optionIndexOffset)}
                >
                  <span className="flex items-center gap-1.5">
                    <MasterDataIcon icon={option.icon} className="h-3.5 w-3.5" />
                    {option.label}
                  </span>
                  {option.value === value && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
                {onDelete && (
                  <button
                    type="button"
                    className="mr-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    onClick={(e) => void handleDelete(e, option.value)}
                    disabled={!!deletingId}
                    aria-label={t("common:delete")}
                    tabIndex={-1}
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
                    onKeyDown={handleInputKeyDown}
                    placeholder={resolvedAddLabel}
                    className="h-8 flex-1 text-base sm:text-sm"
                    disabled={isAdding}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => void handleConfirmAdd()}
                    disabled={isAdding || !inputValue.trim()}
                    aria-label={resolvedConfirmLabel}
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
                    aria-label={resolvedCancelLabel}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {addError && <p className="mt-1 text-xs text-destructive">{addError}</p>}
              </>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={handleOpenAdd}
              >
                <Plus className="h-3.5 w-3.5" />
                {resolvedAddLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
QuickAddSelect.displayName = "QuickAddSelect";
