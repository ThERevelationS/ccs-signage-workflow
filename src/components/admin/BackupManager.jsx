import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { 
  HardDrive, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  Users,
  ClipboardList,
  Briefcase,
  Calendar,
  Wallet,
  FolderOpen,
  Save,
  X
} from "lucide-react";
import { backupToGoogleDrive } from "@/functions/backupToGoogleDrive";

const DATA_TYPES = [
  { id: 'users', label: 'User Data', icon: Users, description: 'Employee accounts and settings' },
  { id: 'timeclock', label: 'Time Clock Entries', icon: Clock, description: 'All clock in/out records' },
  { id: 'orders', label: 'Order Form Data', icon: ClipboardList, description: 'Material and supply orders' },
  { id: 'workorders', label: 'Client/Project Data', icon: Briefcase, description: 'Work orders and projects' },
  { id: 'timeoff', label: 'Time Off Requests', icon: Calendar, description: 'PTO and leave requests' },
  { id: 'pto', label: 'PTO Balances', icon: Wallet, description: 'Employee PTO balances' },
];

const SCHEDULE_OPTIONS = [
  { value: 'none', label: 'Manual only (no schedule)' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function BackupManager() {
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  // Settings
  const [settings, setSettings] = useState({
    folderId: null,
    folderName: null,
    dataTypes: [],
    schedule: 'none',
    scheduleTime: '02:00',
    scheduleDayOfWeek: 0,
    scheduleDayOfMonth: 1
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  
  // Folder input
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderInput, setFolderInput] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoadingSettings(true);
    try {
      const response = await backupToGoogleDrive({ action: 'getSettings' });
      if (response.data.settings) {
        setSettings(prev => ({ ...prev, ...response.data.settings }));
        setSelectedTypes(response.data.settings.dataTypes || []);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
    setIsLoadingSettings(false);
  };

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const newSettings = {
        ...settings,
        dataTypes: selectedTypes
      };
      await backupToGoogleDrive({ action: 'saveSettings', settings: newSettings });
      setSettings(newSettings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setError("Failed to save settings: " + err.message);
    }
    setIsSavingSettings(false);
  };

  // Extract folder ID from Google Drive URL or use direct ID
  const extractFolderId = (input) => {
    if (!input) return null;
    const trimmed = input.trim();
    
    // Match various Google Drive folder URL formats
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /^([a-zA-Z0-9_-]{20,})$/ // Direct folder ID
    ];
    
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const saveFolder = () => {
    const folderId = extractFolderId(folderInput);
    if (!folderId) {
      setError("Invalid folder link or ID. Please paste a valid Google Drive folder URL.");
      return;
    }
    
    setSettings(prev => ({
      ...prev,
      folderId: folderId,
      folderName: 'Custom Folder'
    }));
    setShowFolderDialog(false);
    setFolderInput('');
    setError(null);
  };

  const clearFolder = () => {
    setSettings(prev => ({
      ...prev,
      folderId: null,
      folderName: null
    }));
  };

  const handleToggle = (id) => {
    setSelectedTypes(prev => 
      prev.includes(id) 
        ? prev.filter(t => t !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedTypes.length === DATA_TYPES.length) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes(DATA_TYPES.map(t => t.id));
    }
  };

  const handleBackup = async () => {
    if (selectedTypes.length === 0) return;
    
    setIsBackingUp(true);
    setResult(null);
    setError(null);

    try {
      const response = await backupToGoogleDrive({ 
        dataTypes: selectedTypes,
        folderId: settings.folderId
      });
      
      if (response.data.error) {
        setError(response.data.error);
      } else {
        setResult(response.data);
      }
    } catch (err) {
      setError(err.message || "Backup failed");
    }
    
    setIsBackingUp(false);
  };

  if (isLoadingSettings) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <div className="clay-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
            <Settings className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Backup Settings</h3>
            <p className="text-sm text-gray-500">Configure where and when backups are saved</p>
          </div>
        </div>

        {/* Folder Selection */}
        <div className="mb-6">
          <Label className="text-sm font-medium mb-2 block">Backup Location</Label>
          <div className="flex gap-2">
            <div className="flex-1 p-3 rounded-lg border bg-gray-50 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-gray-500" />
              <span className="text-gray-700 truncate">
                {settings.folderId ? `Folder: ${settings.folderId.substring(0, 20)}...` : 'Root folder (My Drive)'}
              </span>
            </div>
            <Button onClick={() => setShowFolderDialog(true)} variant="outline">
              {settings.folderId ? 'Change' : 'Set Folder'}
            </Button>
            {settings.folderId && (
              <Button onClick={clearFolder} variant="outline" size="icon">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div className="mb-6">
          <Label className="text-sm font-medium mb-2 block">Automatic Backup Schedule</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select
              value={settings.schedule}
              onValueChange={(val) => setSettings(prev => ({ ...prev, schedule: val }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {settings.schedule !== 'none' && (
              <Input
                type="time"
                value={settings.scheduleTime}
                onChange={(e) => setSettings(prev => ({ ...prev, scheduleTime: e.target.value }))}
              />
            )}

            {settings.schedule === 'weekly' && (
              <Select
                value={String(settings.scheduleDayOfWeek)}
                onValueChange={(val) => setSettings(prev => ({ ...prev, scheduleDayOfWeek: parseInt(val) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sunday</SelectItem>
                  <SelectItem value="1">Monday</SelectItem>
                  <SelectItem value="2">Tuesday</SelectItem>
                  <SelectItem value="3">Wednesday</SelectItem>
                  <SelectItem value="4">Thursday</SelectItem>
                  <SelectItem value="5">Friday</SelectItem>
                  <SelectItem value="6">Saturday</SelectItem>
                </SelectContent>
              </Select>
            )}

            {settings.schedule === 'monthly' && (
              <Select
                value={String(settings.scheduleDayOfMonth)}
                onValueChange={(val) => setSettings(prev => ({ ...prev, scheduleDayOfMonth: parseInt(val) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>Day {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {settings.schedule !== 'none' && (
            <p className="text-xs text-amber-600 mt-2">
              Note: After saving, contact support to enable the scheduled automation.
            </p>
          )}
        </div>

        <Button 
          onClick={saveSettings}
          disabled={isSavingSettings}
          className="clay-button border-none text-gray-800 gap-2"
          style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
        >
          {isSavingSettings ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : settingsSaved ? (
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {settingsSaved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>

      {/* Manual Backup Card */}
      <div className="clay-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
            <HardDrive className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Manual Backup</h3>
            <p className="text-sm text-gray-500">Run a backup now to Google Drive</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-medium">Select Data to Backup</Label>
            <Button variant="ghost" size="sm" onClick={handleSelectAll} className="text-xs">
              {selectedTypes.length === DATA_TYPES.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {DATA_TYPES.map(type => (
              <div 
                key={type.id}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedTypes.includes(type.id) 
                    ? 'border-purple-400 bg-purple-50' 
                    : 'border-gray-200 hover:border-gray-300 bg-white/50'
                }`}
                onClick={() => handleToggle(type.id)}
              >
                <div className="flex items-start gap-3">
                  <Checkbox 
                    checked={selectedTypes.includes(type.id)}
                    onCheckedChange={() => handleToggle(type.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <type.icon className="w-4 h-4 text-gray-600" />
                      <span className="font-medium text-gray-800">{type.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button 
          onClick={handleBackup}
          disabled={selectedTypes.length === 0 || isBackingUp}
          className="w-full clay-button border-none text-gray-800"
          style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
        >
          {isBackingUp ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Backing Up...
            </>
          ) : (
            <>
              <HardDrive className="w-4 h-4 mr-2" />
              Backup Now ({selectedTypes.length} selected)
            </>
          )}
        </Button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Backup Failed</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2 text-green-700 mb-3">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">{result.message}</span>
            </div>
            <div className="space-y-2">
              {result.results?.map((r, i) => (
                <div key={i} className="text-sm text-green-600 flex items-center gap-2">
                  {r.error ? (
                    <>
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                      <span className="text-red-600">{r.type}: {r.error}</span>
                    </>
                  ) : r.skipped ? (
                    <>
                      <span className="text-gray-500">{r.filename} (skipped - no data)</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      {r.filename}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Set Folder Dialog */}
      <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <DialogContent className="clay-card border-none max-w-md">
          <DialogHeader>
            <DialogTitle>Set Backup Folder</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Paste a Google Drive folder link or folder ID where backups should be saved.
            </p>
            
            <div>
              <Label>Folder Link or ID</Label>
              <Input
                placeholder="https://drive.google.com/drive/folders/..."
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveFolder()}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Example: https://drive.google.com/drive/folders/1ABC123...
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFolderDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={saveFolder} 
                disabled={!folderInput.trim()}
              >
                <Save className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}