import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateStorageLocation,
  useDeleteStorageLocation,
  useStorageLocations,
  useUpdateStorageLocation,
} from "@/hooks/useMasterData";
import { useToast } from "@/lib/toast";

const LocationsPage = () => {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { data: locations = [], isLoading } = useStorageLocations();
  const createLocation = useCreateStorageLocation();
  const updateLocation = useUpdateStorageLocation();
  const deleteLocation = useDeleteStorageLocation();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createLocation.mutateAsync(newName.trim());
      setNewName("");
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await updateLocation.mutateAsync({ id: editId, name: editName.trim() });
      setEditId(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteLocation.mutateAsync(deleteId);
      setDeleteId(null);
      toast(t("common:deleteSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("deleteLocation")}
        message={t("deleteLocationConfirm")}
        confirmLabel={tc("delete")}
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
        <h1 className="text-xl font-bold">{t("storageLocations")}</h1>
      </div>

      {/* Add form */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("locationName")}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <Button
          onClick={() => {
            void handleCreate();
          }}
          disabled={createLocation.isPending || !newName.trim()}
          size="icon"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : locations.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("noLocations")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {locations.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3">
              {editId === l.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleUpdate();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      void handleUpdate();
                    }}
                  >
                    {tc("save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    {tc("cancel")}
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1">{l.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditId(l.id);
                      setEditName(l.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteId(l.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/locations")({
  component: LocationsPage,
});
