import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";
import {
  getHouseholdDestinationPath,
  type PathColumn,
  type StorageReference,
} from "./householdStoragePaths";

type ItemImage = {
  id: string;
  user_id: string;
  household_id: string;
  image_path: string | null;
};

type LocationPhoto = {
  id: string;
  user_id: string;
  household_id: string;
  photo_path: string | null;
};

type ReferenceTable = "items" | "storage_locations";
type Bucket = "item-images" | "location-photos";

const PAGE_SIZE = 250;
const APPLY = process.argv.includes("--apply");

const requireEnvironment = (name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabase = createClient<Database>(
  requireEnvironment("SUPABASE_URL"),
  requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const hashBlob = async (blob: Blob): Promise<string> =>
  createHash("sha256")
    .update(new Uint8Array(await blob.arrayBuffer()))
    .digest("hex");

const updateItemReference = async (row: ItemImage, oldPath: string, newPath: string) => {
  const { data, error } = await supabase
    .from("items")
    .update({ image_path: newPath })
    .eq("id", row.id)
    .eq("household_id", row.household_id)
    .eq("image_path", oldPath)
    .select("id")
    .maybeSingle();
  return !error && !!data;
};

const updateLocationReference = async (row: LocationPhoto, oldPath: string, newPath: string) => {
  const { data, error } = await supabase
    .from("storage_locations")
    .update({ photo_path: newPath })
    .eq("id", row.id)
    .eq("household_id", row.household_id)
    .eq("photo_path", oldPath)
    .select("id")
    .maybeSingle();
  return !error && !!data;
};

const removeIfUnreferenced = async (
  table: ReferenceTable,
  column: PathColumn,
  bucket: Bucket,
  oldPath: string,
): Promise<void> => {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, oldPath);
  if (error)
    throw new Error(`Could not check references for ${bucket}/${oldPath}: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.info(`Keep still-referenced source: ${bucket}/${oldPath}`);
    return;
  }

  const { error: removeError } = await supabase.storage.from(bucket).remove([oldPath]);
  if (removeError) throw new Error(`Could not remove ${bucket}/${oldPath}: ${removeError.message}`);
  console.info(`Removed unreferenced source: ${bucket}/${oldPath}`);
};

const migrateReference = async <Row extends StorageReference>(
  row: Row,
  column: PathColumn,
  bucket: Bucket,
  table: ReferenceTable,
  updateReference: (row: Row, oldPath: string, newPath: string) => Promise<boolean>,
): Promise<void> => {
  const oldPath = row[column];
  const newPath = getHouseholdDestinationPath(row, column);
  if (!oldPath || !newPath) {
    if (oldPath && oldPath.startsWith(`${row.household_id}/`)) return;
    console.warn(`Skip unrecognized path on ${table}/${row.id}: ${oldPath ?? "<null>"}`);
    return;
  }

  if (!APPLY) {
    console.info(`Would migrate ${bucket}/${oldPath} -> ${bucket}/${newPath}`);
    return;
  }

  const storage = supabase.storage.from(bucket);
  const { data: source, error: sourceError } = await storage.download(oldPath);
  if (sourceError || !source) {
    console.warn(`Keep reference; source is unavailable: ${bucket}/${oldPath}`);
    return;
  }

  let { data: destination, error: destinationError } = await storage.download(newPath);
  if (destinationError || !destination) {
    const { error: copyError } = await storage.copy(oldPath, newPath);
    if (copyError) {
      console.warn(`Keep source; copy failed: ${bucket}/${oldPath}: ${copyError.message}`);
      return;
    }
    const downloaded = await storage.download(newPath);
    destination = downloaded.data;
    destinationError = downloaded.error;
  }

  if (
    destinationError ||
    !destination ||
    (await hashBlob(source)) !== (await hashBlob(destination))
  ) {
    console.warn(`Keep source; copy verification failed: ${bucket}/${newPath}`);
    return;
  }

  if (!(await updateReference(row, oldPath, newPath))) {
    console.warn(`Keep source; reference changed or update failed: ${table}/${row.id}`);
    return;
  }

  console.info(`Updated ${table}/${row.id}: ${oldPath} -> ${newPath}`);
  await removeIfUnreferenced(table, column, bucket, oldPath);
};

const migrateItemImages = async (): Promise<void> => {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("items")
      .select("id,user_id,household_id,image_path")
      .not("image_path", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read item image references: ${error.message}`);

    for (const row of (data ?? []) as ItemImage[]) {
      await migrateReference(row, "image_path", "item-images", "items", updateItemReference);
    }
    if (!data || data.length < PAGE_SIZE) return;
  }
};

const migrateLocationPhotos = async (): Promise<void> => {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("storage_locations")
      .select("id,user_id,household_id,photo_path")
      .not("photo_path", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read location photo references: ${error.message}`);

    for (const row of (data ?? []) as LocationPhoto[]) {
      await migrateReference(
        row,
        "photo_path",
        "location-photos",
        "storage_locations",
        updateLocationReference,
      );
    }
    if (!data || data.length < PAGE_SIZE) return;
  }
};

const main = async (): Promise<void> => {
  if (!APPLY) {
    console.info(
      "Dry run. Pass --apply to copy, verify, update references, then remove unreferenced sources.",
    );
  }
  await migrateItemImages();
  await migrateLocationPhotos();
};

if (import.meta.main) {
  await main();
}
