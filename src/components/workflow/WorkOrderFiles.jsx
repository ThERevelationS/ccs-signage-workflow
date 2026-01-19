import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Upload,
  File,
  FileImage,
  FileText,
  Trash2,
  Download,
  Loader2,
  Paperclip,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { UploadFile } from "@/integrations/Core";
import { useAuth } from "@/components/auth/EmailGate";

const WorkOrder = base44.entities.WorkOrder;

const getFileIcon = (type) => {
  if (type?.startsWith('image/')) return FileImage;
  if (type?.includes('pdf')) return FileText;
  return File;
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function WorkOrderFiles({ workOrder, onUpdate }) {
  const { currentUser } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const files = workOrder?.files || [];

  const handleFileUpload = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    
    const newFiles = [];
    for (const file of selectedFiles) {
      const result = await UploadFile({ file });
      newFiles.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: file.name,
        url: result.file_url,
        type: file.type,
        size: file.size,
        uploaded_by: currentUser?.full_name || currentUser?.email || "Unknown",
        uploaded_at: new Date().toISOString()
      });
    }

    const updatedFiles = [...files, ...newFiles];
    await WorkOrder.update(workOrder.id, { files: updatedFiles });
    Object.assign(workOrder, { files: updatedFiles });
    
    setUploading(false);
    if (onUpdate) onUpdate();
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteConfirm) return;
    
    const updatedFiles = files.filter(f => f.id !== deleteConfirm.id);
    await WorkOrder.update(workOrder.id, { files: updatedFiles });
    Object.assign(workOrder, { files: updatedFiles });
    
    setDeleteConfirm(null);
    if (onUpdate) onUpdate();
  };

  return (
    <div className="clay-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-blue-600" />
          Files
          {files.length > 0 && (
            <Badge variant="secondary" className="text-xs">{files.length}</Badge>
          )}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-7 px-3 text-xs"
        >
          {uploading ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Upload className="w-3 h-3 mr-1" />
          )}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
        />
      </div>

      {files.length === 0 ? (
        <div 
          className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Click to upload files</p>
          <p className="text-xs text-gray-400 mt-1">Blueprints, photos, documents, etc.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {files.map((file) => {
            const FileIcon = getFileIcon(file.type);
            const isImage = file.type?.startsWith('image/');
            
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-white/50 hover:bg-white/80 transition-colors group"
              >
                {isImage ? (
                  <img 
                    src={file.url} 
                    alt={file.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <FileIcon className="w-5 h-5 text-gray-500" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(file.size)} • {file.uploaded_by?.split(' ')[0] || 'Unknown'}
                    {file.uploaded_at && ` • ${format(new Date(file.uploaded_at), "MMM d")}`}
                  </p>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => window.open(file.url, '_blank')}
                    title="Open file"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = file.url;
                      link.download = file.name;
                      link.click();
                    }}
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDeleteConfirm(file)}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFile} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}