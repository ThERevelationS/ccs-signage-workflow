import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, FolderOpen, FileText, Image as ImageIcon, File, ExternalLink, RefreshCw, Plus } from "lucide-react";
import { format } from "date-fns";

export default function GoogleDriveFileBrowser({ folderUrl, workOrderId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [driveUrl, setDriveUrl] = useState('');

  useEffect(() => {
    loadFiles();
  }, [workOrderId]);

  const loadFiles = async () => {
    if (!workOrderId) return;
    
    setLoading(true);
    setError(null);

    try {
      const result = await base44.functions.invoke('googleDriveAuth', {
        action: 'listFiles',
        workOrderId
      });

      if (result.data.error) {
        setError(result.data.error);
        setFiles([]);
      } else {
        setFiles(result.data.files || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load files");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const extractFileId = (url) => {
    const patterns = [
      /\/file\/d\/([^\/]+)/,
      /id=([^&]+)/,
      /folders\/([^\/\?]+)/,
      /^([a-zA-Z0-9_-]{25,})$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleAddFile = async () => {
    if (!driveUrl.trim()) return;
    
    const fileId = extractFileId(driveUrl.trim());
    if (!fileId) {
      setError('Invalid Google Drive URL or file ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await base44.functions.invoke('googleDriveAuth', {
        action: 'saveFileAccess',
        workOrderId,
        fileIds: [fileId]
      });

      await loadFiles();
      setDriveUrl('');
    } catch (err) {
      setError('Failed to add file: ' + err.message);
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



  if (loading && files.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading files...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm text-gray-700">Selected Files ({files.length})</h4>
        <div className="flex gap-2">
          {folderUrl && (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              Open Folder <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <Button size="sm" variant="ghost" onClick={loadFiles} className="h-7 px-2">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <Input
          placeholder="Paste Google Drive file URL or ID..."
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          className="flex-1 h-8 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleAddFile()}
        />
        <Button 
          size="sm" 
          onClick={handleAddFile} 
          disabled={loading || !driveUrl.trim()}
          className="h-8 px-3 bg-blue-600 text-white"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {files.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No files added</p>
          <p className="text-xs mt-1">Paste a Google Drive link above to add files</p>
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