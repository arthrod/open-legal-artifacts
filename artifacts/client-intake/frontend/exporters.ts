// Export/Print for a submitted intake. The pure record→markdown mapper lives in
// ../shared/intake_client.ts (unit-tested); here we only wire it to a download.
import { intakeToMarkdown } from "../shared/intake_client.ts";
import type { IntakeRecord } from "../shared/types.ts";

function slugRef(record: IntakeRecord): string {
  const base = (record.reference || "intake").replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return base || "intake";
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Firefox needs the anchor in the document for the click to fire; revoking
  // synchronously can cancel the download, so defer it a tick.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadMarkdown(record: IntakeRecord) {
  const blob = new Blob([intakeToMarkdown(record)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${slugRef(record)}.md`);
}

export { downloadMarkdown, slugRef };
