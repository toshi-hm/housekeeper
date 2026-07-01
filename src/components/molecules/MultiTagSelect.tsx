import { Plus } from "lucide-react";
import { useState } from "react";

import { TagBadge } from "@/components/atoms/TagBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tag } from "@/types/item";

interface MultiTagSelectProps {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** 新規タグを作成する（作成後に返る Tag を選択状態へ追加する） */
  onCreate?: (name: string) => Promise<Tag>;
  labels: {
    placeholder: string;
    addLabel: string;
    removeLabel: string;
    empty: string;
  };
}

/** 複数選択可能なタグ入力。クリックでトグル、任意で新規作成も可能。 */
export const MultiTagSelect = ({
  tags,
  selectedIds,
  onChange,
  onCreate,
  labels,
}: MultiTagSelectProps) => {
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const selected = new Set(selectedIds);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !onCreate) return;
    setIsCreating(true);
    try {
      const tag = await onCreate(name);
      onChange([...selected, tag.id]);
      setNewName("");
    } finally {
      setIsCreating(false);
    }
  };

  const selectedTags = tags.filter((tag) => selected.has(tag.id));
  const availableTags = tags.filter((tag) => !selected.has(tag.id));

  return (
    <div className="space-y-2">
      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              name={tag.name}
              color={tag.color}
              onRemove={() => toggle(tag.id)}
              removeLabel={labels.removeLabel}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{labels.empty}</p>
      )}

      {availableTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <TagBadge name={tag.name} color={tag.color} />
            </button>
          ))}
        </div>
      )}

      {onCreate && (
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={labels.placeholder}
            disabled={isCreating}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void handleCreate()}
            disabled={isCreating || !newName.trim()}
            aria-label={labels.addLabel}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
