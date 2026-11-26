import type { FileDownload } from "@/api/client";

/** Saves a file through a temporary object URL, so authenticated downloads work without exposing the token in a link. */
export function saveFile({ filename, blob }: FileDownload): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
