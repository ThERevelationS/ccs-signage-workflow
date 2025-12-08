import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FolderOpen, ExternalLink } from "lucide-react";

export default function GoogleDriveFileBrowser({ folderUrl, workOrderId }) {

  if (!folderUrl) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No Google Drive folder linked</p>
        <p className="text-xs mt-1 mb-3">Add a folder URL above to link this work order</p>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
      <FolderOpen className="w-16 h-16 mx-auto mb-4 text-green-600" />
      <p className="text-sm text-gray-600 mb-4">
        Files for this work order are stored in Google Drive
      </p>
      <a
        href={folderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Open Folder in Google Drive
      </a>
      <p className="text-xs text-gray-400 mt-3">
        You can view, upload, and manage files directly in Google Drive
      </p>
    </div>
  );
}