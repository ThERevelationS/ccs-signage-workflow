import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Plus, Edit, Package, Building2, Layers, Wrench, Square } from 'lucide-react';
import EquipmentInventoryTab from '@/components/foundation/EquipmentInventoryTab';
import WallCapsInventoryTab from '@/components/foundation/WallCapsInventoryTab';

const FoundationInventoryEntity = base44.entities.FoundationInventory;

// ─── Wall Material constants ───────────────────────────────────────────────
const WALL_SUBTYPES = [
  { value: 'brick', label: 'Brick' },
  { value: 'cinderblock', label: 'Cinderblock / CMU' },
  { value: 'stone', label: 'Stone' },
  { value: 'concrete', label: 'Concrete (poured/cast)' },
];
const TEXTURE_OPTIONS = [
  { value: 'smooth', label: 'Smooth' },
  { value: 'rough', label: 'Rough / Natural' },
  { value: 'textured', label: 'Textured' },
  { value: 'glazed', label: 'Glazed' },
];
const PRESET_COLORS = [
  { label: 'Red Brick', value: '#b5451b' },
  { label: 'Tan Brick', value: '#c8a97e' },
  { label: 'Gray Concrete', value: '#9ca3af' },
  { label: 'Dark Charcoal', value: '#4b5563' },
  { label: 'Sandstone', value: '#d4a76a' },
  { label: 'Limestone', value: '#e5d9c3' },
  { label: 'Slate Gray', value: '#708090' },
  { label: 'Cream', value: '#f5e6c8' },
  { label: 'Brown', value: '#795548' },
  { label: 'White', value: '#f5f5f5' },
];

// ─── Tab configs ──────────────────────────────────────────────────────────
// NOTE: Concrete SUPPLIERS (ready-mix services like Citywide / Ernst) live in
// Master Inventory → Labor & Services with service_category = "concrete_service".
// Only BAGGED concrete is still managed here (it's a physical product, not a service).
const TAB_CONFIGS = {
  concrete: {
    label: 'Bagged Concrete',
    types: ['bagged_concrete'],
    defaultType: 'bagged_concrete',
    fields: [
      { key: 'material_name', label: 'Material Name *', type: 'text', required: true },
      { key: 'material_description', label: 'Description', type: 'text' },
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'select', options: [{ value: 'bag', label: 'Bag' }, { value: 'each', label: 'Each' }] },
      { key: 'cost_per_unit', label: 'Cost Per Unit ($)', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  rebar: {
    label: 'Rebar',
    types: ['rebar'],
    defaultType: 'rebar',
    fields: [
      { key: 'material_name', label: 'Material Name *', type: 'text', required: true },
      { key: 'rebar_size', label: 'Rebar Size', type: 'select', options: [{ value: '#3', label: '#3' }, { value: '#4', label: '#4' }, { value: '#5', label: '#5' }, { value: '#6', label: '#6' }] },
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'select', options: [{ value: 'lf', label: 'Linear Ft' }, { value: 'ton', label: 'Ton' }, { value: 'each', label: 'Each' }] },
      { key: 'cost_per_unit', label: 'Cost Per Unit ($)', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  forming: {
    label: 'Forming',
    types: ['forming_material'],
    defaultType: 'forming_material',
    fields: [
      { key: 'material_name', label: 'Material Name *', type: 'text', required: true },
      { key: 'material_description', label: 'Description', type: 'text' },
      { key: 'lumber_size', label: 'Lumber Size', type: 'select', options: [{ value: '2x4', label: '2x4' }, { value: '2x6', label: '2x6' }, { value: '2x8', label: '2x8' }, { value: '2x10', label: '2x10' }, { value: '2x12', label: '2x12' }, { value: 'plywood_3/4', label: 'Plywood 3/4"' }, { value: 'custom', label: 'Custom' }] },
      { key: 'thickness_inches', label: 'Thickness (inches)', type: 'number' },
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'unit', label: 'Unit', type: 'select', options: [{ value: 'lf', label: 'Linear Ft' }, { value: 'each', label: 'Each' }, { value: 'sheet', label: 'Sheet' }] },
      { key: 'cost_per_unit', label: 'Cost Per Unit ($)', type: 'number' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  poles: {
    label: 'Poles',
    types: ['pole'],
    defaultType: 'pole',
    fields: [
      { key: 'material_name', label: 'Pole Name *', type: 'text', required: true },
      { key: 'pole_shape', label: 'Shape', type: 'select', options: [{ value: 'square', label: 'Square / Rectangular' }, { value: 'round', label: 'Round' }] },
      { key: 'pole_width_inches', label: 'Width (inches)', type: 'number' },
      { key: 'pole_depth_inches', label: 'Depth (inches)', type: 'number' },
      { key: 'pole_wall_thickness_inches', label: 'Wall Thickness (inches)', type: 'number' },
      { key: 'pole_stock_length_ft', label: 'Stock Length (ft)', type: 'number' },
      { key: 'pole_pricing_mode', label: 'Pricing Mode', type: 'select', options: [{ value: 'per_foot', label: 'Per Foot' }, { value: 'stock_price', label: 'Per Stock Piece' }] },
      { key: 'cost_per_unit', label: 'Cost Per Unit ($)', type: 'number' },
      { key: 'pole_stock_price', label: 'Stock Piece Price ($)', type: 'number' },
      { key: 'paint_rate_per_linear_ft', label: 'Paint Rate / Linear Ft ($)', type: 'number' },
      { key: 'supplier', label: 'Supplier', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
};

// ─── Generic Item Form ─────────────────────────────────────────────────────
function GenericItemForm({ tabKey, item, onSave, onCancel }) {
  const config = TAB_CONFIGS[tabKey];
  const defaults = { material_type: config.defaultType };
  config.fields.forEach(f => {
    if (f.type === 'number') defaults[f.key] = 0;
    else if (f.type === 'select') defaults[f.key] = f.options?.[0]?.value || '';
    else defaults[f.key] = '';
  });

  const [form, setForm] = useState({ ...defaults, ...item });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const isValid = config.fields.filter(f => f.required).every(f => form[f.key]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {config.fields.map(field => (
          <div key={field.key} className={field.key === 'material_name' || field.key === 'notes' ? 'col-span-2' : ''}>
            <Label className="text-xs">{field.label}</Label>
            {field.type === 'select' ? (
              <Select value={String(form[field.key] ?? field.options?.[0]?.value ?? '')} onValueChange={v => set(field.key, v)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {field.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : field.type === 'number' ? (
              <Input type="number" className="h-8" value={form[field.key] ?? 0} step="0.01" min="0"
                onChange={e => set(field.key, parseFloat(e.target.value) || 0)} />
            ) : (
              <Input className="h-8" value={form[field.key] ?? ''} onChange={e => set(field.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
      
      {form.material_type === 'concrete_service' && (
         <div className="col-span-2 space-y-4 border-t border-slate-200 mt-4 pt-4">
            <h4 className="text-sm font-semibold text-slate-800">Mix Pricing ($/CY)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
               <div><Label className="text-xs">3500 AE</Label><Input type="number" className="h-8" value={form.mix_3500_price ?? 195.40} onChange={e => set('mix_3500_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">4000 AE (Standard)</Label><Input type="number" className="h-8" value={form.mix_4000_price ?? 201.00} onChange={e => set('mix_4000_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">4500 AE</Label><Input type="number" className="h-8" value={form.mix_4500_price ?? 208.70} onChange={e => set('mix_4500_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">5000 AE</Label><Input type="number" className="h-8" value={form.mix_5000_price ?? 214.60} onChange={e => set('mix_5000_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">Fast Set</Label><Input type="number" className="h-8" value={form.mix_fast_set_price ?? 248.00} onChange={e => set('mix_fast_set_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
            </div>
            
            <h4 className="text-sm font-semibold text-slate-800">Admixture Pricing ($/CY)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
               <div><Label className="text-xs">Calcium Chloride</Label><Input type="number" className="h-8" value={form.admix_calcium_chloride_price ?? 8.50} onChange={e => set('admix_calcium_chloride_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">Set-Retarding</Label><Input type="number" className="h-8" value={form.admix_set_retarding_price ?? 4.50} onChange={e => set('admix_set_retarding_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">Water-Reducing</Label><Input type="number" className="h-8" value={form.admix_water_reducing_price ?? 4.25} onChange={e => set('admix_water_reducing_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">Fibers</Label><Input type="number" className="h-8" value={form.admix_fibers_price ?? 12.50} onChange={e => set('admix_fibers_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">Winter Service</Label><Input type="number" className="h-8" value={form.admix_winter_service_price ?? 5.50} onChange={e => set('admix_winter_service_price', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
            </div>

            <h4 className="text-sm font-semibold text-slate-800">Small Load Fees ($)</h4>
            <p className="text-xs text-slate-500 -mt-2">Fee charged by the supplier when ordering less than a full truck. Enter $0 for no fee.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
               <div><Label className="text-xs">1 – 1.75 YD</Label><Input type="number" className="h-8" value={form.small_load_fee_1_1_75 ?? 150} onChange={e => set('small_load_fee_1_1_75', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">2 – 2.75 YD</Label><Input type="number" className="h-8" value={form.small_load_fee_2_2_75 ?? 120} onChange={e => set('small_load_fee_2_2_75', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">3 – 3.75 YD</Label><Input type="number" className="h-8" value={form.small_load_fee_3_3_75 ?? 105} onChange={e => set('small_load_fee_3_3_75', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">4 – 4.25 YD</Label><Input type="number" className="h-8" value={form.small_load_fee_4_4_25 ?? 80} onChange={e => set('small_load_fee_4_4_25', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
               <div><Label className="text-xs">4.5 – 4.75 YD</Label><Input type="number" className="h-8" value={form.small_load_fee_4_5_4_75 ?? 40} onChange={e => set('small_load_fee_4_5_4_75', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
            </div>

            <h4 className="text-sm font-semibold text-slate-800">Fuel / Delivery Surcharge ($)</h4>
            <p className="text-xs text-slate-500 -mt-2">Flat fee added per truck load for fuel and delivery.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
               <div><Label className="text-xs">Per Load Surcharge</Label><Input type="number" className="h-8" value={form.fuel_surcharge ?? 30} onChange={e => set('fuel_surcharge', parseFloat(e.target.value) || 0)} step="0.01" min="0" /></div>
            </div>
         </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!isValid}>Save</Button>
      </div>
    </div>
  );
}

// ─── Wall Material Form ────────────────────────────────────────────────────
function WallMaterialForm({ item, onSave, onCancel, isFillMaterial }) {
  const [form, setForm] = useState({
    material_name: '', material_type: isFillMaterial ? 'fill_material' : 'wall_material', wall_material_subtype: 'brick',
    wall_unit_length_inches: 8, wall_unit_width_inches: 4, wall_unit_height_inches: 2.25,
    wall_color: '#b5451b', wall_texture: 'rough', cost_per_unit: 0.75, supplier: '', notes: '',
    ...item,
  });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const isConcrete = form.wall_material_subtype === 'concrete';

  const applyPreset = (subtype) => {
    set('wall_material_subtype', subtype);
    if (subtype === 'brick') { set('wall_unit_length_inches', 8); set('wall_unit_width_inches', 3.75); set('wall_unit_height_inches', 2.25); }
    else if (subtype === 'cinderblock') { set('wall_unit_length_inches', 16); set('wall_unit_width_inches', 8); set('wall_unit_height_inches', 8); }
    else if (subtype === 'stone') { set('wall_unit_length_inches', 12); set('wall_unit_width_inches', 6); set('wall_unit_height_inches', 4); }
    else if (subtype === 'concrete') { set('wall_unit_length_inches', 0); set('wall_unit_width_inches', 8); set('wall_unit_height_inches', 0); set('wall_color', '#9ca3af'); set('wall_texture', 'smooth'); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Material Name *</Label>
          <Input className="h-8" value={form.material_name} onChange={e => set('material_name', e.target.value)} placeholder="e.g. Standard Red Brick" />
        </div>
        <div>
          <Label className="text-xs">Material Subtype</Label>
          <Select value={form.wall_material_subtype} onValueChange={applyPreset}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{WALL_SUBTYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Cost Per Unit ($)</Label>
          <Input type="number" className="h-8" value={form.cost_per_unit} onChange={e => set('cost_per_unit', parseFloat(e.target.value) || 0)} step="0.01" min="0" />
        </div>
      </div>
      {!isConcrete && (
        <>
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Unit Dimensions</div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Length (inches)</Label><Input type="number" className="h-8" value={form.wall_unit_length_inches} onChange={e => set('wall_unit_length_inches', parseFloat(e.target.value) || 0)} step="0.125" /></div>
            <div><Label className="text-xs">Width / Depth (inches)</Label><Input type="number" className="h-8" value={form.wall_unit_width_inches} onChange={e => set('wall_unit_width_inches', parseFloat(e.target.value) || 0)} step="0.125" /></div>
            <div><Label className="text-xs">Height (inches)</Label><Input type="number" className="h-8" value={form.wall_unit_height_inches} onChange={e => set('wall_unit_height_inches', parseFloat(e.target.value) || 0)} step="0.125" /></div>
          </div>
        </>
      )}
      {isConcrete && (
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Wall Depth / Width (inches)</Label><Input type="number" className="h-8" value={form.wall_unit_width_inches} onChange={e => set('wall_unit_width_inches', parseFloat(e.target.value) || 0)} step="0.5" /></div>
        </div>
      )}
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Visual / 3D Appearance</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Color</Label>
          <div className="flex gap-2 mt-1 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button key={c.value} title={c.label}
                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${form.wall_color === c.value ? 'border-blue-500 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c.value }} onClick={() => set('wall_color', c.value)} />
            ))}
            <input type="color" value={form.wall_color || '#b5451b'} onChange={e => set('wall_color', e.target.value)} className="w-6 h-6 rounded border cursor-pointer" title="Custom color" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Texture</Label>
          <Select value={form.wall_texture || 'rough'} onValueChange={v => set('wall_texture', v)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{TEXTURE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
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

// ─── Generic Tab Content ───────────────────────────────────────────────────
function GenericTab({ tabKey, items, onEdit, onDelete, onAdd, isAdmin }) {
  const config = TAB_CONFIGS[tabKey];

  const displayFields = config.fields.filter(f =>
    !['material_name', 'notes', 'material_type'].includes(f.key)
  ).slice(0, 4);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">{config.label} items used for cost estimation in foundation projects.</p>
        {isAdmin && <Button size="sm" onClick={onAdd}><Plus className="w-4 h-4 mr-1" /> Add {config.label}</Button>}
      </div>
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-slate-400">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No {config.label.toLowerCase()} items yet.</p>
            <p className="text-xs mt-1">Click "Add {config.label}" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id} className="hover:shadow-sm transition-shadow border-blue-200 shadow-sm overflow-hidden mb-3">
              <CardContent className="py-3 px-4 flex items-start justify-between gap-3 bg-blue-50/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{item.material_name}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span className="text-xs text-slate-500 capitalize">{item.material_type?.replace(/_/g, ' ')}</span>
                    {displayFields.map(f => {
                      const val = item[f.key];
                      if (!val && val !== 0) return null;
                      const label = f.label.replace(' ($)', '').replace(' *', '');
                      const display = f.type === 'number' && f.label.includes('$') ? `$${parseFloat(val).toFixed(2)}` : val;
                      return <span key={f.key} className="text-xs text-slate-500">{label}: <span className="text-slate-700 font-medium">{display}</span></span>;
                    })}
                    {item.cost_per_unit > 0 && !displayFields.find(f => f.key === 'cost_per_unit') && (
                      <span className="text-xs text-slate-500">Cost: <span className="text-slate-700 font-medium">${parseFloat(item.cost_per_unit).toFixed(2)}</span></span>
                    )}
                    {item.cost_per_day > 0 && <span className="text-xs text-slate-500">Day: <span className="text-slate-700 font-medium">${parseFloat(item.cost_per_day).toFixed(2)}</span></span>}
                    {item.cost_per_week > 0 && <span className="text-xs text-slate-500">Week: <span className="text-slate-700 font-medium">${parseFloat(item.cost_per_week).toFixed(2)}</span></span>}
                    {item.notes && <span className="text-xs text-slate-400 italic">{item.notes}</span>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(item)}><Edit className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => onDelete(item.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
// `embedded` mode = rendered inside the Master Inventory "Concrete & Stone"
// tab. In that mode we strip the outer page chrome (header/subtitle/padding)
// so it fits inside the surrounding Card.
export default function FoundationInventoryPage({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('wall_material');
  const [isAdmin, setIsAdmin] = useState(false);

  // Wall material dialog
  const [showWallForm, setShowWallForm] = useState(false);
  const [wallEditItem, setWallEditItem] = useState(null);
  const [wallEditItemIsFill, setWallEditItemIsFill] = useState(false);

  // Generic dialog
  const [showGenericForm, setShowGenericForm] = useState(false);
  const [genericTabKey, setGenericTabKey] = useState(null);
  const [genericEditItem, setGenericEditItem] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await base44.auth.me();
      setIsAdmin(user?.role === 'admin');
    };
    checkAuth();
    loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const data = await FoundationInventoryEntity.list('-created_date', 200);
    setItems(data);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    await FoundationInventoryEntity.delete(id);
    loadItems();
  };

  const handleSaveWall = async (form) => {
    if (wallEditItem?.id) await FoundationInventoryEntity.update(wallEditItem.id, form);
    else await FoundationInventoryEntity.create(form);
    setShowWallForm(false); setWallEditItem(null); setWallEditItemIsFill(false);
    loadItems();
  };

  const handleSaveGeneric = async (form) => {
    if (genericEditItem?.id) await FoundationInventoryEntity.update(genericEditItem.id, form);
    else await FoundationInventoryEntity.create(form);
    setShowGenericForm(false); setGenericEditItem(null); setGenericTabKey(null);
    loadItems();
  };

  const openGenericAdd = (tabKey) => { setGenericTabKey(tabKey); setGenericEditItem(null); setShowGenericForm(true); };
  const openGenericEdit = (tabKey, item) => { setGenericTabKey(tabKey); setGenericEditItem(item); setShowGenericForm(true); };

  // Group items by type
  const byType = (types) => items.filter(i => types.includes(i.material_type));
  const wallMaterials = byType(['wall_material']);
  const fillMaterials = byType(['fill_material']);

  return (
    <div className={embedded ? "space-y-4" : "p-6 max-w-7xl mx-auto space-y-6"}>
      {!embedded && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Concrete | Masonry | Poles Inventory</h1>
            <p className="text-slate-500 text-sm">Manage material costs for use in concrete, masonry & pole estimates</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
            <strong>Heads up:</strong> This page has moved into <a href="/MasterInventory" className="underline font-semibold">Master Inventory → Concrete &amp; Stone</a>. Poles now live under <a href="/MasterInventory" className="underline font-semibold">Master Inventory → Extruded Metals &amp; Poles</a>.
          </div>
        </>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 bg-slate-100/80 p-1.5 border border-slate-200 rounded-xl shadow-sm">
          <TabsTrigger value="wall_material" className="flex items-center gap-1"><Building2 className="w-3 h-3" /> Wall Materials</TabsTrigger>
          <TabsTrigger value="concrete">Concrete</TabsTrigger>
          <TabsTrigger value="rebar">Rebar</TabsTrigger>
          <TabsTrigger value="forming">Forming</TabsTrigger>
          {!embedded && <TabsTrigger value="equipment" className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Equipment</TabsTrigger>}
          {!embedded && <TabsTrigger value="poles">Poles</TabsTrigger>}
          <TabsTrigger value="fill_material"><Layers className="w-3 h-3 mr-1" />Wall Fill</TabsTrigger>
          <TabsTrigger value="wall_cap" className="flex items-center gap-1"><Square className="w-3 h-3" /> Wall Caps</TabsTrigger>
        </TabsList>

        {/* WALL MATERIALS TAB */}
        <TabsContent value="wall_material" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Brick, cinderblock, stone, and concrete units for building walls above the foundation.</p>
            {isAdmin && (
              <Button size="sm" onClick={() => { setWallEditItem(null); setShowWallForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Wall Material
              </Button>
            )}
          </div>
          {loading ? <div className="text-center text-slate-400 py-8">Loading...</div>
            : wallMaterials.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-slate-400">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No wall materials yet. Add brick, stone, cinderblock, or concrete units.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {wallMaterials.map(m => (
                  <Card key={m.id} className="hover:shadow-md transition-shadow border-orange-200 shadow-sm overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-orange-50/50 border-b border-orange-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border border-slate-300 flex-shrink-0" style={{ backgroundColor: m.wall_color || '#cc9966' }} />
                          <div>
                            <CardTitle className="text-sm font-semibold">{m.material_name}</CardTitle>
                            <Badge variant="outline" className="text-xs capitalize">{m.wall_material_subtype}</Badge>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setWallEditItem(m); setShowWallForm(true); }}><Edit className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(m.id)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 text-xs text-slate-600 space-y-1">
                      {m.wall_material_subtype !== 'concrete' && <div>Size: {m.wall_unit_length_inches}"L × {m.wall_unit_width_inches}"W × {m.wall_unit_height_inches}"H</div>}
                      {m.wall_material_subtype === 'concrete' && <div>Wall depth: {m.wall_unit_width_inches}"</div>}
                      <div>Cost: ${parseFloat(m.cost_per_unit || 0).toFixed(2)} / unit</div>
                      <div>Texture: <span className="capitalize">{m.wall_texture}</span></div>
                      {m.supplier && <div>Supplier: {m.supplier}</div>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </TabsContent>

        {/* WALL FILL MATERIALS TAB */}
        <TabsContent value="fill_material" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Materials for internal walls (configured identically to Wall Materials).</p>
            {isAdmin && (
              <Button size="sm" onClick={() => { setWallEditItem(null); setWallEditItemIsFill(true); setShowWallForm(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Wall Fill
              </Button>
            )}
          </div>
          {loading ? <div className="text-center text-slate-400 py-8">Loading...</div>
            : fillMaterials.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-slate-400">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No wall fill materials yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fillMaterials.map(m => (
                  <Card key={m.id} className="hover:shadow-md transition-shadow border-indigo-200 shadow-sm overflow-hidden">
                    <CardHeader className="py-3 px-4 bg-indigo-50/50 border-b border-indigo-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded border border-slate-300 flex-shrink-0" style={{ backgroundColor: m.wall_color || '#cc9966' }} />
                          <div>
                            <CardTitle className="text-sm font-semibold">{m.material_name}</CardTitle>
                            <Badge variant="outline" className="text-xs capitalize">{m.wall_material_subtype}</Badge>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => { setWallEditItem(m); setWallEditItemIsFill(true); setShowWallForm(true); }}><Edit className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(m.id)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 text-xs text-slate-600 space-y-1">
                      {m.wall_material_subtype !== 'concrete' && <div>Size: {m.wall_unit_length_inches}"L × {m.wall_unit_width_inches}"W × {m.wall_unit_height_inches}"H</div>}
                      {m.wall_material_subtype === 'concrete' && <div>Wall depth: {m.wall_unit_width_inches}"</div>}
                      <div>Cost: ${parseFloat(m.cost_per_unit || 0).toFixed(2)} / unit</div>
                      <div>Texture: <span className="capitalize">{m.wall_texture}</span></div>
                      {m.supplier && <div>Supplier: {m.supplier}</div>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </TabsContent>

        {/* EQUIPMENT (Custom UI) */}
        <TabsContent value="equipment">
            <EquipmentInventoryTab allItems={items} loadItems={loadItems} isAdmin={isAdmin} />
        </TabsContent>

        {/* WALL CAPS (Custom UI) */}
        <TabsContent value="wall_cap">
            <WallCapsInventoryTab allItems={items} FoundationInventoryEntity={FoundationInventoryEntity} loadItems={loadItems} isAdmin={isAdmin} />
        </TabsContent>

        {/* GENERIC TABS */}
        {Object.keys(TAB_CONFIGS).map(tabKey => (
          <TabsContent key={tabKey} value={tabKey}>
            <GenericTab
              tabKey={tabKey}
              items={byType(TAB_CONFIGS[tabKey].types)}
              onAdd={() => openGenericAdd(tabKey)}
              onEdit={(item) => openGenericEdit(tabKey, item)}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Wall Material Dialog */}
      <Dialog open={showWallForm} onOpenChange={open => { if (!open) { setShowWallForm(false); setWallEditItem(null); setWallEditItemIsFill(false); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{wallEditItem ? (wallEditItemIsFill ? 'Edit Wall Fill' : 'Edit Wall Material') : (wallEditItemIsFill ? 'Add Wall Fill' : 'Add Wall Material')}</DialogTitle></DialogHeader>
          <WallMaterialForm isFillMaterial={wallEditItemIsFill} item={wallEditItem} onSave={handleSaveWall} onCancel={() => { setShowWallForm(false); setWallEditItem(null); setWallEditItemIsFill(false); }} />
        </DialogContent>
      </Dialog>

      {/* Generic Item Dialog */}
      <Dialog open={showGenericForm} onOpenChange={open => { if (!open) { setShowGenericForm(false); setGenericEditItem(null); setGenericTabKey(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{genericEditItem ? `Edit ${TAB_CONFIGS[genericTabKey]?.label}` : `Add ${TAB_CONFIGS[genericTabKey]?.label}`}</DialogTitle>
          </DialogHeader>
          {genericTabKey && (
            <GenericItemForm tabKey={genericTabKey} item={genericEditItem} onSave={handleSaveGeneric} onCancel={() => { setShowGenericForm(false); setGenericEditItem(null); setGenericTabKey(null); }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}