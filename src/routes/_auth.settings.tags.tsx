import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ColorPicker } from "@/components/atoms/ColorPicker";
import { Spinner } from "@/components/atoms/Spinner";
import { TagBadge } from "@/components/atoms/TagBadge";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "@/hooks/useTags";
import { useToast } from "@/lib/toast-context";

const TagsPage = () => {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { data: tags = [], isLoading } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTag.mutateAsync({ name: newName.trim(), color: newColor });
      setNewName("");
      setNewColor(null);
      toast(tc("saveSuccess"), "success");
    } catch {
      // error toast handled in hook
    }
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await updateTag.mutateAsync({ id: editId, name: editName.trim(), color: editColor });
      setEditId(null);
      toast(tc("saveSuccess"), "success");
    } catch {
      // error toast handled in hook
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTag.mutateAsync(deleteId);
      setDeleteId(null);
      toast(tc("deleteSuccess"), "success");
    } catch {
      // error toast handled in hook
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("deleteTag")}
        message={t("deleteTagConfirm")}
        confirmLabel={tc("delete")}
        isConfirming={deleteTag.isPending}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => void navigate({ to: "/settings" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("tags")}</h1>
      </div>

      {/* Add form */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("tagName")}
            disabled={createTag.isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <Button
            onClick={() => {
              void handleCreate();
            }}
            disabled={createTag.isPending || !newName.trim()}
            size="icon"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : tags.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("noTags")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tags.map((tag) => (
            <li key={tag.id} className="space-y-2 p-3">
              {editId === tag.id ? (
                <>
                  <div className="flex items-center gap-3">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      disabled={updateTag.isPending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleUpdate();
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        void handleUpdate();
                      }}
                      disabled={updateTag.isPending || !editName.trim()}
                    >
                      {tc("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      {tc("cancel")}
                    </Button>
                  </div>
                  <ColorPicker value={editColor} onChange={setEditColor} />
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <TagBadge name={tag.name} color={tag.color} />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tc("edit")}
                    onClick={() => {
                      setEditId(tag.id);
                      setEditName(tag.name);
                      setEditColor(tag.color ?? null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={tc("delete")}
                    onClick={() => setDeleteId(tag.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/tags")({
  component: TagsPage,
});
