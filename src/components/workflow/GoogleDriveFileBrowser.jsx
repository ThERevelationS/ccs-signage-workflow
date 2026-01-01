import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Archive,
  X
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

export default function GoogleDriveFileBrowser({ 
  isOpen, 
  onClose, 
  folderId,
  folderUrl,
  workOrderTitle,
  onFileIdsUpdate 
}) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderHistory, setFolderHistory] = useState([]);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const fileInputRef = useRef(null);

  // Extract folder ID from URL if provided
  useEffect(() => {
    if (isOpen) {
      let extractedId = folderId;
      if (!extractedId && folderUrl) {
        // Extract folder ID from various Google Drive URL formats
        const match = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        if (match) {
          extractedId = match[1];
        }
      }
      setCurrentFolderId(extractedId);
      setFolderHistory([]);
      if (extractedId) {
        loadFiles(extractedId);
      } else {
        loadFiles(null);
      }
    }
  }, [isOpen, folderId, folderUrl]);

  const loadFiles = async (targetFolderId) => {
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
      setCurrentFolderId(previous?.id || null);
      loadFiles(previous?.id || null);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setLoading(true);
    try {
      const response = await googleDriveOperations({
        action: 'createFolder',
        fileName: newFolderName,
        folderId: currentFolderId
      });
      
      if (response.data.error) {
        setError(response.data.error);
      } else {
        setShowNewFolderDialog(false);
        setNewFolderName("");
        loadFiles(currentFolderId);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    
    try {
      // Read file as base64
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
          // Update work order with new file ID if callback provided
          if (onFileIdsUpdate && response.data.file?.id) {
            onFileIdsUpdate(response.data.file.id);
          }
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
        // Download the file
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (open) onClose(); }}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5 text-green-600" />
            Google Drive - {workOrderTitle || 'Files'}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 py-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={folderHistory.length === 0 || loading}
            className="h-8"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadFiles(currentFolderId)}
            disabled={loading}
            className="h-8"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewFolderDialog(true)}
            disabled={loading}
            className="h-8"
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            New Folder
          </Button>

          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-8 clay-button border-none"
            style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1" />
            )}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Breadcrumb */}
        {folderHistory.length > 0 && (
          <div className="flex items-center gap-1 text-sm text-gray-500 py-1">
            <span className="cursor-pointer hover:text-blue-600" onClick={() => {
              setFolderHistory([]);
              setCurrentFolderId(folderId);
              loadFiles(folderId);
            }}>
              Root
            </span>
            {folderHistory.map((folder, idx) => (
              <React.Fragment key={idx}>
                <span>/</span>
                <span className="cursor-pointer hover:text-blue-600" onClick={() => {
                  const newHistory = folderHistory.slice(0, idx + 1);
                  setFolderHistory(newHistory);
                  setCurrentFolderId(folder.id);
                  loadFiles(folder.id);
                }}>
                  {folder.name || 'Folder'}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="icon" onClick={() => setError(null)} className="h-6 w-6">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Folder className="w-12 h-12 mb-2" />
              <p>No files found</p>
              <p className="text-xs">Upload files or create a folder to get started</p>
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((file) => {
                const FileIcon = getFileIcon(file.mimeType);
                const folder = isFolder(file);
                
                return (
                  <div
                    key={file.id}
                    className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group ${
                      folder ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => folder && handleFolderClick(file)}
                  >
                    <FileIcon className={`w-5 h-5 flex-shrink-0 ${
                      folder ? 'text-yellow-500' : 'text-gray-400'
                    }`} />
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
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
                            className="h-7 w-7"
                            title="View"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                            disabled={downloadingId === file.id}
                            className="h-7 w-7"
                            title="Download"
                          >
                            {downloadingId === file.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleDelete(file); }}
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* New Folder Dialog */}
        <Dialog open={showNewFolderDialog} onOpenChange={(open) => { if (open) setShowNewFolderDialog(true); }}>
          <DialogContent className="clay-card border-none max-w-sm">
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}