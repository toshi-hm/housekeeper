export interface StorageReference {
  id: string;
  user_id: string;
  household_id: string;
  image_path?: string | null;
  photo_path?: string | null;
}

export type PathColumn = "image_path" | "photo_path";

export const getHouseholdDestinationPath = (
  row: StorageReference,
  column: PathColumn,
): string | null => {
  const oldPath = row[column];
  if (!oldPath) return null;

  const [ownerId, filename, ...rest] = oldPath.split("/");
  if (
    ownerId !== row.user_id ||
    !filename?.startsWith(`${row.id}.`) ||
    filename.length <= row.id.length + 1 ||
    rest.length > 0 ||
    ownerId === row.household_id
  ) {
    return null;
  }

  return `${row.household_id}/${filename}`;
};
