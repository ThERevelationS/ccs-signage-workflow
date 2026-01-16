import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  Wallet
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

export default function BackupManager() {
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

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
      const response = await backupToGoogleDrive({ dataTypes: selectedTypes });
      
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

  return (
    <div className="space-y-6">
      <div className="clay-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}>
            <HardDrive className="w-6 h-6 text-teal-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Google Drive Backup</h3>
            <p className="text-sm text-gray-500">Export data to Excel files in your Google Drive</p>
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
              Backup to Google Drive ({selectedTypes.length} selected)
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
                  <CheckCircle2 className="w-3 h-3" />
                  {r.filename}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="clay-card p-4 bg-blue-50">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Backups are saved to your connected Google Drive account as Excel files. 
          Each backup includes a timestamp in the filename for easy organization.
        </p>
      </div>
    </div>
  );
}