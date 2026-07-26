import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Map, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IconPicker } from "@/components/atoms/IconPicker";
import { MasterDataIcon } from "@/components/atoms/MasterDataIcon";
import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ImageUploader } from "@/components/molecules/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteLocationPhoto,
  uploadLocationPhoto,
  useSignedLocationPhoto,
} from "@/hooks/useLocationPhoto";
import {
  checkLocationUsage,
  useCreateStorageLocation,
  useDeleteStorageLocation,
  useStorageLocations,
  useUpdateStorageLocation,
} from "@/hooks/useMasterData";
import { useToast } from "@/lib/toast-context";
import type { StorageLocation } from "@/types/item";

/** 保管場所ごとの収納写真アップロード（#574）。行ごとに独立した
 *  アップロード状態・signed URL 取得を持つため、専用の子コンポーネントに切り出す。 */
const LocationPhotoSection = ({ location }: { location: StorageLocation }) => {
  const { t } = useTranslation("settings");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const { data: photoUrl } = useSignedLocationPhoto(location.photo_path);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    try {
      await uploadLocationPhoto({
        locationId: location.id,
        file,
        oldPhotoPath: location.photo_path,
        queryClient: qc,
      });
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!location.photo_path) return;
    setIsUploading(true);
    try {
      await deleteLocationPhoto(location.id, location.photo_path, qc);
      toast(t("common:deleteSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t("locationPhoto")}</p>
      <ImageUploader
        previewUrl={photoUrl}
        isUploading={isUploading}
        onFile={(file) => void handleFile(file)}
        onDelete={location.photo_path ? () => void handleDelete() : undefined}
      />
    </div>
  );
};

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
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [photoOpenId, setPhotoOpenId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createLocation.mutateAsync({ name: newName.trim(), icon: newIcon });
      setNewName("");
      setNewIcon(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      // error is handled by the mutation's onError
    }
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await updateLocation.mutateAsync({ id: editId, name: editName.trim(), icon: editIcon });
      setEditId(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      // error is handled by the mutation's onError
    }
  };

  const handleDeleteClick = async (id: string) => {
    setCheckingId(id);
    try {
      const count = await checkLocationUsage(id);
      if (count > 0) {
        toast(t("locationInUse"), "error");
        return;
      }
      setDeleteId(id);
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteLocation.mutateAsync(deleteId);
      setDeleteId(null);
      toast(t("common:deleteSuccess"), "success");
    } catch {
      // error is handled by the mutation's onError
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("deleteLocation")}
        message={t("deleteLocationConfirm")}
        confirmLabel={tc("delete")}
        isConfirming={deleteLocation.isPending}
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
          maxLength={40}
          disabled={createLocation.isPending}
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
      <IconPicker value={newIcon} onChange={setNewIcon} />

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
            <li key={l.id} className="space-y-2 p-3">
              {editId === l.id ? (
                <>
                  <div className="flex items-center gap-3">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      maxLength={40}
                      disabled={updateLocation.isPending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleUpdate();
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        void handleUpdate();
                      }}
                      disabled={updateLocation.isPending || !editName.trim()}
                    >
                      {tc("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      {tc("cancel")}
                    </Button>
                  </div>
                  <IconPicker value={editIcon} onChange={setEditIcon} />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <MasterDataIcon icon={l.icon} />
                    <span className="flex-1">{l.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("locationPhoto")}
                      onClick={() => setPhotoOpenId(photoOpenId === l.id ? null : l.id)}
                    >
                      <Map className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={tc("edit")}
                      onClick={() => {
                        setEditId(l.id);
                        setEditName(l.name);
                        setEditIcon(l.icon ?? null);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={tc("delete")}
                      disabled={checkingId === l.id}
                      onClick={() => {
                        void handleDeleteClick(l.id);
                      }}
                    >
                      {checkingId === l.id ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {photoOpenId === l.id && (
                    <div className="space-y-2 pl-7">
                      <LocationPhotoSection location={l} />
                      {l.photo_path && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void navigate({
                              to: "/locations/$locationId",
                              params: { locationId: l.id },
                            })
                          }
                        >
                          <Map className="mr-1 h-4 w-4" />
                          {t("viewMap")}
                        </Button>
                      )}
                    </div>
                  )}
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
