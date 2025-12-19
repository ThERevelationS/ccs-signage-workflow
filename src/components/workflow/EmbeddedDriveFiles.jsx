import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Folder,
  File,
  Upload,
  Download,
  FolderPlus,
  Trash2,
  ExternalLink,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Image,
  FileText,
  FileSpreadsheet,
  Film,
  Music,
  Archive
} from "lucide-react";
import { googleDriveOperations } from "@/functions/googleDriveOperations";

const getFileIcon = (mimeType) => {
  if (!mimeType) return File;
  if (mimeType.includes('folder')) return Folder;
  if (mimeType.includes('image')) return Image;
  if (mimeType.includes('video')) return Film;
  if (mimeType.includes('audio')) return Music;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) return Archive;
  return File;
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
};

export default function EmbeddedDriveFiles({ folderUrl, workOrderId, onUpdate }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const fileInputRef = useRef(null);

  // Extract folder ID from URL
  const extractFolderId = (url) => {
    if (!url) return null;
    const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  useEffect(() => {
    const folderId = extractFolderId(folderUrl);
    setCurrentFolderId(folderId);
    setFolderHistory([]);
    if (folderId) {
      loadFiles(folderId);
    } else {
      setFiles([]);
    }
  }, [folderUrl]);

  const loadFiles = async (targetFolderId) => {
    if (!targetFolderId) {
      setFiles([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const response = await googleDriveOperations({
        action: 'listFiles',
        folderId: targetFolderId
      });
      
      if (response.data.error) {
        setError(response.data.error);
        setFiles([]);
      } else {
        setFiles(response.data.files || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load files');
      setFiles([]);
    }
    setLoading(false);
  };

  const handleFolderClick = (folder) => {
    setFolderHistory([...folderHistory, { id: currentFolderId, name: folder.name }]);
    setCurrentFolderId(folder.id);
    loadFiles(folder.id);
  };

  const handleBack = () => {
    if (folderHistory.length > 0) {
      const newHistory = [...folderHistory];
      const previous = newHistory.pop();
      setFolderHistory(newHistory);
      const targetId = previous?.id || extractFolderId(folderUrl);
      setCurrentFolderId(targetId);
      loadFiles(targetId);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result.split(',')[1];
        
        const response = await googleDriveOperations({
          action: 'uploadFile',
          fileName: file.name,
          fileContent: base64,
          fileType: file.type,
          folderId: currentFolderId
        });

        if (response.data.error) {
          setError(response.data.error);
        } else {
          loadFiles(currentFolderId);
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
    
    e.target.value = "";
  };

  const handleDownload = async (file) => {
    setDownloadingId(file.id);
    try {
      const response = await googleDriveOperations({
        action: 'getDownloadUrl',
        fileId: file.id
      });

      if (response.data.error) {
        setError(response.data.error);
      } else if (response.data.type === 'view') {
        window.open(response.data.url, '_blank');
      } else {
        const downloadResponse = await fetch(response.data.url, {
          headers: {
            'Authorization': `Bearer ${response.data.accessToken}`
          }
        });
        
        if (downloadResponse.ok) {
          const blob = await downloadResponse.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = response.data.fileName || file.name;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
        } else {
          setError('Failed to download file');
        }
      }
    } catch (err) {
      setError(err.message);
    }
    setDownloadingId(null);
  };

  const handleDelete = async (file) => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    
    setLoading(true);
    try {
      const response = await googleDriveOperations({
        action: 'deleteFile',
        fileId: file.id
      });

      if (response.data.error) {
        setError(response.data.error);
      } else {
        loadFiles(currentFolderId);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleViewFile = (file) => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank');
    }
  };

  const isFolder = (file) => file.mimeType === 'application/vnd.google-apps.folder';

  if (!folderUrl) {
    return (
      <div className="border rounded-lg p-6 text-center bg-gray-50/50" style={{ minHeight: '200px' }}>
        <Folder className="w-10 h-10 mx-auto mb-2 text-gray-300" />
        <p className="text-sm text-gray-400">No folder linked</p>
        <p className="text-xs text-gray-400 mt-1">Click "Link Folder" to connect a Google Drive folder</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden" style={{ minHeight: '200px' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-gray-50 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={folderHistory.length === 0 || loading}
          className="h-7 px-2"
        >
          <ArrowLeft className="w-3 h-3" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadFiles(currentFolderId)}
          disabled={loading}
          className="h-7 px-2"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        {folderHistory.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-500 flex-1 min-w-0 overflow-hidden">
            <span 
              className="cursor-pointer hover:text-blue-600 truncate" 
              onClick={() => {
                setFolderHistory([]);
                const rootId = extractFolderId(folderUrl);
                setCurrentFolderId(rootId);
                loadFiles(rootId);
              }}
            >
              Root
            </span>
            {folderHistory.map((f, idx) => (
              <React.Fragment key={idx}>
                <span>/</span>
                <span className="truncate">{f.name}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-7 px-2 text-xs"
        >
          {uploading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          <span className="ml-1">Upload</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 text-red-600 p-2 text-xs border-b">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="overflow-y-auto" style={{ maxHeight: '250px' }}>
        {loading && files.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-400">
            <Folder className="w-8 h-8 mb-2" />
            <p className="text-sm">No files found</p>
          </div>
        ) : (
          <div className="divide-y">
            {files.map((file) => {
              const FileIcon = getFileIcon(file.mimeType);
              const folder = isFolder(file);
              
              return (
                <div
                  key={file.id}
                  className={`flex items-center gap-2 p-2 hover:bg-gray-50 group ${
                    folder ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => folder && handleFolderClick(file)}
                >
                  <FileIcon className={`w-4 h-4 flex-shrink-0 ${
                    folder ? 'text-yellow-500' : 'text-gray-400'
                  }`} />
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">
                      {file.modifiedTime && new Date(file.modifiedTime).toLocaleDateString()}
                      {file.size && ` • ${formatFileSize(parseInt(file.size))}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!folder && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleViewFile(file); }}
                          className="h-6 w-6"
                          title="View"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                          disabled={downloadingId === file.id}
                          className="h-6 w-6"
                          title="Download"
                        >
                          {downloadingId === file.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                      className="h-6 w-6 text-red-500 hover:text-red-700"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}