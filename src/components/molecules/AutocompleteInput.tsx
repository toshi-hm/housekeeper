import { type ComponentProps, type KeyboardEvent, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { filterSuggestions } from "@/lib/autocomplete";
import { cn } from "@/lib/utils";

interface AutocompleteInputProps extends Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "role"
> {
  value: string;
  onValueChange: (value: string) => void;
  /** 候補の全体集合。入力に応じてこの中から絞り込んで表示する。 */
  suggestions: readonly string[];
  /** 候補を選んだときに呼ばれる（onValueChange の後）。 */
  onSuggestionSelect?: (value: string) => void;
  maxSuggestions?: number;
}

/**
 * 入力中に候補を絞り込んで表示するテキスト入力（ARIA combobox パターン）。
 * 自由入力は常に許可し、候補は補助。ネイティブ datalist と違いモバイルでも
 * 同じ見た目・挙動で、かな/カナ差も吸収して絞り込む。
 */
export const AutocompleteInput = ({
  value,
  onValueChange,
  suggestions,
  onSuggestionSelect,
  maxSuggestions,
  onKeyDown,
  onFocus,
  onBlur,
  className,
  id,
  ...inputProps
}: AutocompleteInputProps) => {
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = filterSuggestions(suggestions, value, maxSuggestions);
  const expanded = open && matches.length > 0;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const select = (candidate: string) => {
    onValueChange(candidate);
    onSuggestionSelect?.(candidate);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (expanded) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? matches.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        // 候補の確定。フォームの送信や親の Enter ハンドラ（追加など）には渡さない。
        e.preventDefault();
        e.stopPropagation();
        select(matches[activeIndex] ?? value);
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        setActiveIndex(-1);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        {...inputProps}
        id={id}
        value={value}
        className={className}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          setActiveIndex(-1);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
      />
      {expanded && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
        >
          {matches.map((candidate, index) => (
            <li
              key={candidate}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "flex min-h-11 cursor-pointer items-center px-3 text-sm",
                index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
              // blur でリストが閉じる前に選択できるよう、フォーカス移動を止める
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(candidate)}
            >
              {candidate}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
