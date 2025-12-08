import React from "react";
import { FolderOpen, ExternalLink } from "lucide-react";

export default function GoogleDriveFileBrowser({ folderUrl }) {
  if (!folderUrl) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No Google Drive folder linked</p>
        <p className="text-xs mt-1">Add a folder URL above to link your project files</p>
      </div>
    );
  }

  return (
    <div className="text-center py-8">
      <FolderOpen className="w-16 h-16 mx-auto mb-4 text-green-600" />
      <p className="text-base font-medium text-gray-800 mb-2">Google Drive Folder Linked</p>
      <p className="text-sm text-gray-600 mb-6">
        Click below to open and manage your project files in Google Drive
      </p>
      <a
        href={folderUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
      >
        <ExternalLink className="w-5 h-5" />
        Open Folder in Google Drive
      </a>
    </div>
  );
}