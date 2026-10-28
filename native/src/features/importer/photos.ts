import type { Repository } from "../../data/repository";
/** Called by a photo viewer only. Import itself never fetches photo bytes. */
export async function downloadImportedPhoto(
  repo: Repository,
  id: string,
  download: (path: string) => Promise<Blob>,
): Promise<Blob> {
  const row = repo.get("photos", id),
    path = row?.data.file_name;
  if (
    !row ||
    row.deleted_at !== null ||
    typeof path !== "string" ||
    !path.startsWith(repo.owner + "/") ||
    path.includes("..") ||
    path.includes("://")
  )
    throw new Error("Photo unavailable.");
  return download(path);
}
