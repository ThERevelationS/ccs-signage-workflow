import React from "react";
import { Button } from "@/components/ui/button";
import { Folder, ExternalLink } from "lucide-react";

export default function EmbeddedDriveFiles({ folderUrl }) {
  if (!folderUrl) {
    return (
      <div className="border rounded-lg p-6 text-center bg-gray-50/50">
        <Folder className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">No folder linked</p>
        <p className="text-xs text-gray-400 mt-1">Click "Link Folder" to connect a Google Drive folder</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6 text-center bg-gray-50/50">
      <Folder className="w-10 h-10 mx-auto mb-2 text-blue-400" />
      <p className="text-sm text-gray-600 mb-3">Google Drive folder linked</p>
      <Button
        onClick={() => window.open(folderUrl, '_blank')}
        className="gap-2"
      >
        <ExternalLink className="w-4 h-4" />
        Open in Drive
      </Button>
    </div>
  );
}