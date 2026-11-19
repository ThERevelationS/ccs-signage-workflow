import React from 'react';

// Returns the color scheme for a tier (1 = highest markup / public, descending → friends & family).
// The gradient progresses from rich slate/navy (premium customers pay more) → green/cyan (friendly tiers).
export const TIER_THEMES = [
  { bg: 'bg-slate-900', text: 'text-white', ring: 'ring-slate-900/30', soft: 'bg-slate-50', softText: 'text-slate-900', accent: 'border-slate-900' },     // 1
  { bg: 'bg-indigo-700', text: 'text-white', ring: 'ring-indigo-600/30', soft: 'bg-indigo-50', softText: 'text-indigo-900', accent: 'border-indigo-700' }, // 2
  { bg: 'bg-blue-600', text: 'text-white', ring: 'ring-blue-500/30', soft: 'bg-blue-50', softText: 'text-blue-900', accent: 'border-blue-600' },           // 3
  { bg: 'bg-sky-500', text: 'text-white', ring: 'ring-sky-400/30', soft: 'bg-sky-50', softText: 'text-sky-900', accent: 'border-sky-500' },                // 4
  { bg: 'bg-teal-500', text: 'text-white', ring: 'ring-teal-400/30', soft: 'bg-teal-50', softText: 'text-teal-900', accent: 'border-teal-500' },           // 5
  { bg: 'bg-emerald-500', text: 'text-white', ring: 'ring-emerald-400/30', soft: 'bg-emerald-50', softText: 'text-emerald-900', accent: 'border-emerald-500' }, // 6
  { bg: 'bg-amber-500', text: 'text-white', ring: 'ring-amber-400/30', soft: 'bg-amber-50', softText: 'text-amber-900', accent: 'border-amber-500' },      // 7
  { bg: 'bg-rose-500', text: 'text-white', ring: 'ring-rose-400/30', soft: 'bg-rose-50', softText: 'text-rose-900', accent: 'border-rose-500' },           // 8
];

export const getTierTheme = (tierNumber) => {
  const idx = Math.max(0, Math.min(TIER_THEMES.length - 1, (Number(tierNumber) || 1) - 1));
  return TIER_THEMES[idx];
};

export default function TierBadge({ tierNumber, size = 'md' }) {
  const theme = getTierTheme(tierNumber);
  const sizeClass = size === 'lg'
    ? 'w-12 h-12 text-lg'
    : size === 'sm'
      ? 'w-7 h-7 text-xs'
      : 'w-9 h-9 text-sm';
  return (
    <div className={`${sizeClass} ${theme.bg} ${theme.text} rounded-xl flex items-center justify-center font-bold shadow-sm ring-2 ${theme.ring} flex-shrink-0`}>
      {tierNumber}
    </div>
  );
}