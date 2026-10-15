import { deleteObject, getDownloadURL, getMetadata, listAll, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

/**
 * The single choke point every memo PDF upload goes through (Submit Absence/Deviation Memo's 4 upload
 * flows) -- every `<input type="file" accept="application/pdf">` only ever hints the OS file picker to
 * pre-filter, it does not actually block a non-PDF someone picks via "All Files" or drag-and-drop, which
 * is how a Word doc (e.g. a .docx deviation memo) has slipped through before. Real enforcement lives here.
 */
export function assertIsPdf(file: File): void {
  const looksLikePdf = file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) throw new Error(`"${file.name}" isn't a PDF. Please convert it to PDF before uploading.`);
}

/** Uploads a memo PDF under `<folder>/<cadetId>/<timestamp>-<filename>` and returns its public download URL. */
export async function uploadMemoPdf(file: File, folder: "absenceMemos" | "deviationMemos", cadetId: string): Promise<{ url: string; fileName: string }> {
  assertIsPdf(file);
  const path = `${folder}/${cadetId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, fileName: file.name };
}

export interface StoredMemoPdf {
  folder: "absenceMemos" | "deviationMemos";
  cadetId: string;
  path: string;
  fileName: string;
  url: string;
  size: number;
  uploadedAt: string;
}

/** Section 6 (Data Management) -- lists every PDF under both memo folders, one cadet-id subfolder at a time (Storage's `listAll` only lists one level of children). */
export async function listAllMemoPdfs(): Promise<StoredMemoPdf[]> {
  const results: StoredMemoPdf[] = [];
  for (const folder of ["absenceMemos", "deviationMemos"] as const) {
    const top = await listAll(ref(storage, folder));
    for (const cadetPrefix of top.prefixes) {
      const cadetId = cadetPrefix.name;
      const files = await listAll(cadetPrefix);
      for (const item of files.items) {
        const [metadata, url] = await Promise.all([getMetadata(item), getDownloadURL(item)]);
        results.push({
          folder,
          cadetId,
          path: item.fullPath,
          fileName: item.name.replace(/^\d+-/, ""),
          url,
          size: metadata.size,
          uploadedAt: metadata.timeCreated,
        });
      }
    }
  }
  return results.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** Only ever called from Data Management, gated to Cortes Garay with a password re-check (Section 6). */
export async function deleteMemoPdf(path: string): Promise<void> {
  await deleteObject(ref(storage, path));
}

export interface MemorandumTemplate {
  path: string;
  fileName: string;
  url: string;
}

/** Static reference templates under `memorandumTemplates/` (Memo Submission's "Memorandum Templates" tab) -- view/download only, no in-app upload or edit UI. */
export async function listMemorandumTemplates(): Promise<MemorandumTemplate[]> {
  const top = await listAll(ref(storage, "memorandumTemplates"));
  const results = await Promise.all(
    top.items.map(async (item) => ({ path: item.fullPath, fileName: item.name, url: await getDownloadURL(item) }))
  );
  return results.sort((a, b) => a.fileName.localeCompare(b.fileName));
}
