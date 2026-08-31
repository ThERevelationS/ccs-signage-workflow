import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus, Edit, Square } from 'lucide-react';

const PROFILES = [
  { value: 'flat', label: 'Flat' },
  { value: 'beveled', label: 'Beveled' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'peaked', label: 'Peaked' },
  { value: 'stepped', label: 'Stepped' },
];

const PRESET_COLORS = [
  '#9ca3af', '#4b5563', '#d4a76a', '#e5d9c3', '#708090',
  '#f5e6c8', '#795548', '#f5f5f5', '#b5451b', '#1f2937',
];

function CapForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    material_name: '',
    material_type: 'wall_cap',
    cap_stock_length_inches: 48,
    cap_width_inches: 8,
    cap_height_inches: 2,
    cap_profile: 'flat',
    cap_color: '#9ca3af',
    cap_stock_price: 35,
    is_cuttable: true,
    supplier: '',
    notes: '',
    ...item,
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Cap Name *</Label>
        <Input className="h-8" value={form.material_name} onChange={e => set('material_name', e.target.value)} placeholder="e.g. 4ft Bluestone Wall Cap" />
      </div>

      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dimensions</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Stock Length (in)</Label>
          <Input type="number" className="h-8" value={form.cap_stock_length_inches} step="0.25" min="1"
            onChange={e => set('cap_stock_length_inches', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <Label className="text-xs">Width (in)</Label>
          <Input type="number" className="h-8" value={form.cap_width_inches} step="0.25" min="1"
            onChange={e => set('cap_width_inches', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <Label className="text-xs">Height (in)</Label>
          <Input type="number" className="h-8" value={form.cap_height_inches} step="0.25" min="0.25"
            onChange={e => set('cap_height_inches', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Profile</Label>
          <Select value={form.cap_profile} onValueChange={v => set('cap_profile', v)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{PROFILES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Stock Price ($)</Label>
          <Input type="number" className="h-8" value={form.cap_stock_price} step="0.01" min="0"
            onChange={e => set('cap_stock_price', parseFloat(e.target.value) || 0)} />
          <p className="text-[10px] text-slate-500 mt-0.5">Charged in full per cut piece.</p>
        </div>
      </div>

      <div>
        <Label className="text-xs">Color</Label>
        <div className="flex gap-2 mt-1 flex-wrap items-center">
          {PRESET_COLORS.map(c => (
            <button key={c} className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${form.cap_color === c ? 'border-blue-500 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }} onClick={() => set('cap_color', c)} />
          ))}
          <input type="color" value={form.cap_color || '#9ca3af'} onChange={e => set('cap_color', e.target.value)}
            className="w-6 h-6 rounded border cursor-pointer" />
        </div>
      </div>

      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md p-2">
        <Checkbox id="cuttable" checked={form.is_cuttable !== false} onCheckedChange={v => set('is_cuttable', !!v)} className="w-4 h-4" />
        <Label htmlFor="cuttable" className="text-xs font-semibold text-amber-900 cursor-pointer">
          Cuttable on-site (allows trimming to fit; full stock charged per cut)
        </Label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Supplier</Label><Input className="h-8" value={form.supplier || ''} onChange={e => set('supplier', e.target.value)} /></div>
        <div><Label className="text-xs">Notes</Label><Input className="h-8" value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.material_name}>Save</Button>
      </div>
    </div>
  );
}

export default function WallCapsInventoryTab({ allItems, FoundationInventoryEntity, loadItems, isAdmin }) {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const caps = allItems.filter(i => i.material_type === 'wall_cap');

  const handleSave = async (form) => {
    if (editItem?.id) await FoundationInventoryEntity.update(editItem.id, form);
    else await FoundationInventoryEntity.create(form);
    setShowForm(false); setEditItem(null);
    loadItems();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this wall cap?')) return;
    await FoundationInventoryEntity.delete(id);
    loadItems();
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Wall caps placed on top of outer wall sections. Full stock is charged per cut piece.</p>
        {isAdmin && (
          <Button size="sm" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Wall Cap
          </Button>
        )}
      </div>

      {caps.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-slate-400">
            <Square className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No wall caps yet. Add stock pieces to use in projects.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {caps.map(cap => (
            <Card key={cap.id} className="hover:shadow-md transition-shadow border-stone-200 shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 bg-stone-50/70 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border border-slate-300 flex-shrink-0" style={{ backgroundColor: cap.cap_color || '#9ca3af' }} />
                    <div>
                      <CardTitle className="text-sm font-semibold">{cap.material_name}</CardTitle>
                      <div className="flex gap-1 mt-0.5">
                        <Badge variant="outline" className="text-xs capitalize">{cap.cap_profile || 'flat'}</Badge>
                        {cap.is_cuttable !== false && <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">Cuttable</Badge>}
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditItem(cap); setShowForm(true); }}><Edit className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(cap.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 text-xs text-slate-600 space-y-1">
                <div>Size: {cap.cap_stock_length_inches}"L × {cap.cap_width_inches}"W × {cap.cap_height_inches}"H</div>
                <div>Price: <span className="font-semibold text-slate-800">${parseFloat(cap.cap_stock_price || 0).toFixed(2)}</span> / stock piece</div>
                {cap.supplier && <div>Supplier: {cap.supplier}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); setEditItem(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? 'Edit Wall Cap' : 'Add Wall Cap'}</DialogTitle></DialogHeader>
          <CapForm item={editItem} onSave={handleSave} onCancel={() => { setShowForm(false); setEditItem(null); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}