import React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function GoogleDriveFileBrowser({ folderUrl }) {
  if (!folderUrl) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        No Google Drive folder linked
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-2">
      <a
        href={folderUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button className="bg-blue-600 hover:bg-blue-700 text-white">
          <ExternalLink className="w-4 h-4 mr-2" />
          Open Customer Files
        </Button>
      </a>
    </div>
  );
}