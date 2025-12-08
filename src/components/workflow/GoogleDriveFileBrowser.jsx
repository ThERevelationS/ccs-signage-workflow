import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, FolderOpen, FileText, Image as ImageIcon, File, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export default function GoogleDriveFileBrowser({ folderUrl }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (folderUrl) {
      loadFiles();
    } else {
      setFiles([]);
      setError(null);
    }
  }, [folderUrl]);

  const extractFolderId = (url) => {
    if (!url) return null;
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  const loadFiles = async () => {
    const folderId = extractFolderId(folderUrl);
    if (!folderId) {
      setError("Invalid Google Drive folder URL");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await base44.functions.invoke('googleDriveAuth', { 
        action: 'listFiles',
        folderId 
      });
      
      if (result.data.error) {
        setError(result.data.error);
      } else {
        setFiles(result.data.files || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load files from Google Drive");
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (mimeType) => {
    if (mimeType?.includes('folder')) return <FolderOpen className="w-5 h-5 text-blue-500" />;
    if (mimeType?.includes('image')) return <ImageIcon className="w-5 h-5 text-green-500" />;
    if (mimeType?.includes('document') || mimeType?.includes('text')) return <FileText className="w-5 h-5 text-blue-600" />;
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  if (!folderUrl) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No Google Drive folder linked</p>
        <p className="text-xs mt-1">Add a folder URL above to see your files</p>
      </div>
    );
  }

  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading files from Google Drive...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
        <div className="text-red-600 mb-4">
          <p className="font-medium">Error loading files</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <Button size="sm" onClick={loadFiles} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm text-gray-700">Files ({files.length})</h4>
        <Button size="sm" variant="ghost" onClick={loadFiles} className="h-7 px-2">
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No files found</p>
          <p className="text-xs mt-1">The folder may be empty or files may not be accessible</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100"
            >
              {file.thumbnailLink ? (
                <img src={file.thumbnailLink} alt={file.name} className="w-10 h-10 object-cover rounded flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                  {getFileIcon(file.mimeType)}
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {file.modifiedTime && (
                    <span>{format(new Date(file.modifiedTime), "MMM d, yyyy")}</span>
                  )}
                  {file.size && <span>{formatFileSize(parseInt(file.size))}</span>}
                </div>
              </div>

              <a
                href={file.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0"
              >
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <ExternalLink className="w-4 h-4 text-blue-600" />
                </Button>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}