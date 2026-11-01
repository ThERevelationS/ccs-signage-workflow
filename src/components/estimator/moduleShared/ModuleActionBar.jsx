import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, LayoutTemplate, BookmarkPlus, Link2, Loader2 } from "lucide-react";
import { createEstimateReadOnlyShareLink } from "./moduleProjectActions";

// Shared per-module estimator affordances (#78 save-as-copy, #79 templates,
// #88 read-only share link). Mounts next to an existing save control; each
// button is rendered only when its handler/feature applies — the share link
// needs a live estimate id, so standalone drafts simply do not offer it.
export default function ModuleActionBar({
  onTemplates,
  onSaveAsTemplate,
  onSaveAsCopy,
  estimateId,
  saving,
  size = "sm",
}) {
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (!estimateId || sharing) return;
    setSharing(true);
    try {
      const url = await createEstimateReadOnlyShareLink({ estimateId });
      await navigator.clipboard.writeText(url);
      alert("Read-only link copied to clipboard:\n" + url);
    } catch (e) {
      console.error(e);
      alert("Share link failed: " + (e?.message || e));
    } finally {
      setSharing(false);
    }
  };

  const disabled = Boolean(saving);
  return (
    <>
      {onTemplates ? (
        <Button type="button" variant="outline" size={size} onClick={onTemplates} disabled={disabled}>
          <LayoutTemplate className="w-4 h-4 mr-1" aria-hidden="true" /> Templates
        </Button>
      ) : null}
      {onSaveAsTemplate ? (
        <Button type="button" variant="outline" size={size} onClick={onSaveAsTemplate} disabled={disabled}>
          <BookmarkPlus className="w-4 h-4 mr-1" aria-hidden="true" /> Save as Template
        </Button>
      ) : null}
      {onSaveAsCopy ? (
        <Button type="button" variant="outline" size={size} onClick={onSaveAsCopy} disabled={disabled}>
          <Copy className="w-4 h-4 mr-1" aria-hidden="true" /> Save As Copy
        </Button>
      ) : null}
      {estimateId ? (
        <Button type="button" variant="outline" size={size} onClick={share} disabled={disabled || sharing} title="Copy a read-only link to this estimate">
          {sharing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" /> : <Link2 className="w-4 h-4 mr-1" aria-hidden="true" />} Share Link
        </Button>
      ) : null}
    </>
  );
}