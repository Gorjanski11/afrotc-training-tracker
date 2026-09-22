import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

/** Uploads a memo PDF under `<folder>/<cadetId>/<timestamp>-<filename>` and returns its public download URL. */
export async function uploadMemoPdf(file: File, folder: "absenceMemos" | "deviationMemos", cadetId: string): Promise<{ url: string; fileName: string }> {
  const path = `${folder}/${cadetId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, fileName: file.name };
}
