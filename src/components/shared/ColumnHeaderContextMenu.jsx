import React, { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { 
  ArrowUpAZ, 
  ArrowDownAZ, 
  ArrowUp01, 
  ArrowDown01,
  Calendar,
  X,
  Filter,
  Check,
  Search
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Helper to parse date string as local date
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  try {
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

// Determine column type based on field name
const getColumnType = (fieldName) => {
  const dateFields = [
    'date_needed', 'date_ordered', 'date_received', 'created_date',
    'current_task_deadline', 'date_initial_contact', 'site_survey_date',
    'date_estimate_sent', 'date_order_created', 'project_install_date',
    'permit_submitted_date', 'permit_receipt_confirmed_date', 'permit_approved_date',
    'quote_date', 'follow_up_date', 'close_date', 'start_date', 'due_date'
  ];
  
  const numberFields = [
    'estimate_amount', 'quoted_amount', 'actual_cost', 'probability',
    'quantity', 'budget_less_than', 'row_number', 'priority'
  ];
  
  const selectFields = [
    'request_type', 'status', 'sales_status', 'lead_source', 'project_type',
    'current_task_description', 'designer', 'project_manager', 'estimator',
    'current_task_assigned_to', 'vendor', 'requestor_name', 'permitting'
  ];
  
  if (dateFields.includes(fieldName)) return 'date';
  if (numberFields.includes(fieldName)) return 'number';
  if (selectFields.includes(fieldName)) return 'select';
  return 'text';
};

export function ColumnHeaderContextMenu({ 
  position, 
  onClose, 
  fieldName,
  fieldLabel,
  onSort,
  onCustomSort,
  onClearSort,
  currentSortKey,
  currentSortDirection
}) {
  const menuRef = useRef(null);
  const [showCustomSort, setShowCustomSort] = useState(false);

  useEffect(() => {
    if (showCustomSort) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, showCustomSort]);

  const columnType = getColumnType(fieldName);
  const isSorted = currentSortKey === fieldName;

  const handleClearSort = () => {
    onClearSort();
    onClose();
  };

  const handleQuickSort = (direction) => {
    onSort(fieldName, direction);
    onClose();
  };

  const handleOpenCustomSort = () => {
    setShowCustomSort(true);
  };

  if (showCustomSort) {
    return (
      <CustomSortDialog
        isOpen={true}
        onClose={() => {
          setShowCustomSort(false);
          onClose();
        }}
        fieldName={fieldName}
        fieldLabel={fieldLabel}
        columnType={columnType}
        onApply={(config) => {
          onCustomSort(fieldName, config);
          setShowCustomSort(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border rounded-lg shadow-xl py-1 z-[9999] min-w-[180px]"
      style={{ top: position.y, left: position.x }}
    >
      <div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b">
        {fieldLabel}
      </div>
      
      {/* Quick Sort Ascending */}
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleQuickSort('asc');
        }}
      >
        {columnType === 'number' || columnType === 'date' ? (
          <ArrowUp01 className="w-4 h-4 text-blue-600" />
        ) : (
          <ArrowUpAZ className="w-4 h-4 text-blue-600" />
        )}
        Sort {columnType === 'date' ? 'Oldest First' : columnType === 'number' ? 'Low to High' : 'A to Z'}
        {isSorted && currentSortDirection === 'asc' && <Check className="w-3 h-3 ml-auto text-green-600" />}
      </button>

      {/* Quick Sort Descending */}
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleQuickSort('desc');
        }}
      >
        {columnType === 'number' || columnType === 'date' ? (
          <ArrowDown01 className="w-4 h-4 text-blue-600" />
        ) : (
          <ArrowDownAZ className="w-4 h-4 text-blue-600" />
        )}
        Sort {columnType === 'date' ? 'Newest First' : columnType === 'number' ? 'High to Low' : 'Z to A'}
        {isSorted && currentSortDirection === 'desc' && <Check className="w-3 h-3 ml-auto text-green-600" />}
      </button>

      <div className="border-t my-1" />

      {/* Custom Sort */}
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpenCustomSort();
        }}
      >
        <Filter className="w-4 h-4 text-purple-600" />
        Custom Sort & Filter...
      </button>

      {/* Clear Sort */}
      {isSorted && (
        <>
          <div className="border-t my-1" />
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClearSort();
            }}
          >
            <X className="w-4 h-4" />
            Clear Sort
          </button>
        </>
      )}
    </div>
  );
}

function CustomSortDialog({ isOpen, onClose, fieldName, fieldLabel, columnType, onApply, allValues = [] }) {
  const [direction, setDirection] = useState('asc');
  const [filterType, setFilterType] = useState('all'); // all, selected, range
  const [selectedValues, setSelectedValues] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [numberFrom, setNumberFrom] = useState('');
  const [numberTo, setNumberTo] = useState('');
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);

  // Get unique values for select/text columns
  const uniqueValues = React.useMemo(() => {
    if (!allValues || allValues.length === 0) return [];
    const values = allValues
      .map(item => item[fieldName])
      .filter(v => v != null && v !== '')
      .map(v => String(v));
    return [...new Set(values)].sort();
  }, [allValues, fieldName]);

  const filteredUniqueValues = React.useMemo(() => {
    if (!searchTerm) return uniqueValues;
    const lower = searchTerm.toLowerCase();
    return uniqueValues.filter(v => v.toLowerCase().includes(lower));
  }, [uniqueValues, searchTerm]);

  const handleSelectAll = () => {
    setSelectedValues([...uniqueValues]);
  };

  const handleSelectNone = () => {
    setSelectedValues([]);
  };

  const toggleValue = (value) => {
    setSelectedValues(prev => 
      prev.includes(value) 
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  const handleApply = () => {
    const config = {
      direction,
      filterType,
      selectedValues: filterType === 'selected' ? selectedValues : null,
      dateRange: filterType === 'range' && columnType === 'date' ? { from: dateFrom, to: dateTo } : null,
      numberRange: filterType === 'range' && columnType === 'number' ? { 
        from: numberFrom !== '' ? parseFloat(numberFrom) : null, 
        to: numberTo !== '' ? parseFloat(numberTo) : null 
      } : null
    };
    onApply(config);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-purple-600" />
            Custom Sort: {fieldLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Sort Direction */}
          <div className="space-y-2">
            <Label className="font-medium">Sort Direction</Label>
            <RadioGroup value={direction} onValueChange={setDirection} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="asc" id="asc" />
                <Label htmlFor="asc" className="cursor-pointer">
                  {columnType === 'date' ? 'Oldest First' : columnType === 'number' ? 'Low to High' : 'A to Z'}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="desc" id="desc" />
                <Label htmlFor="desc" className="cursor-pointer">
                  {columnType === 'date' ? 'Newest First' : columnType === 'number' ? 'High to Low' : 'Z to A'}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Filter Options */}
          <div className="space-y-2">
            <Label className="font-medium">Filter Options</Label>
            <RadioGroup value={filterType} onValueChange={setFilterType} className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="cursor-pointer">Show All</Label>
              </div>
              
              {(columnType === 'text' || columnType === 'select') && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="selected" id="selected" />
                  <Label htmlFor="selected" className="cursor-pointer">Filter by Selected Values</Label>
                </div>
              )}
              
              {(columnType === 'date' || columnType === 'number') && (
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="range" id="range" />
                  <Label htmlFor="range" className="cursor-pointer">Filter by Range</Label>
                </div>
              )}
            </RadioGroup>
          </div>

          {/* Value Selection for text/select columns */}
          {filterType === 'selected' && (columnType === 'text' || columnType === 'select') && (
            <div className="space-y-2 border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search values..."
                  className="h-8"
                />
              </div>
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={handleSelectAll} className="h-7 text-xs">
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={handleSelectNone} className="h-7 text-xs">
                  Clear All
                </Button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredUniqueValues.length > 0 ? (
                  filteredUniqueValues.map(value => (
                    <label key={value} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                      <Checkbox
                        checked={selectedValues.includes(value)}
                        onCheckedChange={() => toggleValue(value)}
                      />
                      <span className="text-sm truncate">{value}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-2">No values available</p>
                )}
              </div>
            </div>
          )}

          {/* Date Range */}
          {filterType === 'range' && columnType === 'date' && (
            <div className="space-y-3 border rounded-lg p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">From Date</Label>
                  <Popover open={showDateFromPicker} onOpenChange={setShowDateFromPicker}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 justify-start text-left font-normal">
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "MM/dd/yyyy") : "Select..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={dateFrom}
                        onSelect={(date) => {
                          setDateFrom(date);
                          setShowDateFromPicker(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">To Date</Label>
                  <Popover open={showDateToPicker} onOpenChange={setShowDateToPicker}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-9 justify-start text-left font-normal">
                        <Calendar className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "MM/dd/yyyy") : "Select..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={dateTo}
                        onSelect={(date) => {
                          setDateTo(date);
                          setShowDateToPicker(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {dateFrom && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={() => { setDateFrom(null); setDateTo(null); }}
                  className="h-7 text-xs text-red-600"
                >
                  Clear Dates
                </Button>
              )}
            </div>
          )}

          {/* Number Range */}
          {filterType === 'range' && columnType === 'number' && (
            <div className="space-y-3 border rounded-lg p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">From ($)</Label>
                  <Input
                    type="number"
                    value={numberFrom}
                    onChange={(e) => setNumberFrom(e.target.value)}
                    placeholder="Min"
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">To ($)</Label>
                  <Input
                    type="number"
                    value={numberTo}
                    onChange={(e) => setNumberTo(e.target.value)}
                    placeholder="Max"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply}
            className="bg-purple-600 hover:bg-purple-700"
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to manage column sorting with custom filters
export function useColumnSorting(storageKeyPrefix, userEmail) {
  const storageKey = `${storageKeyPrefix}_sort_${userEmail || 'guest'}`;
  
  const [sortConfig, setSortConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error loading sort config:", e);
    }
    return { key: null, direction: 'asc', customFilter: null };
  });

  // Save to localStorage when sort changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sortConfig));
    } catch (e) {
      console.error("Error saving sort config:", e);
    }
  }, [sortConfig, storageKey]);

  const handleSort = (key, direction) => {
    setSortConfig({ key, direction, customFilter: null });
  };

  const handleCustomSort = (key, config) => {
    setSortConfig({ 
      key, 
      direction: config.direction, 
      customFilter: {
        filterType: config.filterType,
        selectedValues: config.selectedValues,
        dateRange: config.dateRange,
        numberRange: config.numberRange
      }
    });
  };

  const clearSort = () => {
    setSortConfig({ key: null, direction: 'asc', customFilter: null });
  };

  // Apply sorting and filtering to data
  const applySortAndFilter = (data, fieldName) => {
    if (!sortConfig.key) return data;
    
    let result = [...data];
    
    // Apply custom filter if present
    if (sortConfig.customFilter && sortConfig.customFilter.filterType !== 'all') {
      const filter = sortConfig.customFilter;
      
      if (filter.filterType === 'selected' && filter.selectedValues?.length > 0) {
        result = result.filter(item => {
          const value = item[sortConfig.key];
          return value != null && filter.selectedValues.includes(String(value));
        });
      }
      
      if (filter.filterType === 'range' && filter.dateRange) {
        const { from, to } = filter.dateRange;
        result = result.filter(item => {
          const value = item[sortConfig.key];
          if (!value) return false;
          const date = parseLocalDate(value);
          if (!date) return false;
          if (from && date < from) return false;
          if (to && date > to) return false;
          return true;
        });
      }
      
      if (filter.filterType === 'range' && filter.numberRange) {
        const { from, to } = filter.numberRange;
        result = result.filter(item => {
          const value = parseFloat(item[sortConfig.key]);
          if (isNaN(value)) return false;
          if (from !== null && value < from) return false;
          if (to !== null && value > to) return false;
          return true;
        });
      }
    }
    
    return result;
  };

  return {
    sortConfig,
    handleSort,
    handleCustomSort,
    clearSort,
    applySortAndFilter
  };
}

export default ColumnHeaderContextMenu;