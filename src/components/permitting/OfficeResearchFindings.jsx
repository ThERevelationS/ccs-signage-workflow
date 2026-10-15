import {useRef} from 'react';
import OfficeRoleOverview from './OfficeRoleOverview';
import ElectricalResearchTasks from './ElectricalResearchTasks';
import {officeResearchFieldLabels} from '../../../base44/shared/permittingOfficeResearch.mjs';
import {safeGovernmentOfficeSourceUrl} from './governmentOfficeCatalog';

export default function OfficeResearchFindings({research,onNavigate,onPreviewWorkflow}){
 const nodes=useRef(new Map());
 const rows=research?.method==='office-research-requirements-v1' && Array.isArray(research.roles)?research.roles.filter(row=>row && typeof row==='object'):[];
 const date=new Date(research?.researched_at);
 const inspect=index=>{const node=nodes.current.get(index);if(node){node.open=true;node.querySelector('summary')?.focus({preventScroll:true});node.scrollIntoView({block:'start',behavior:'auto'});}};
 return <section aria-label="Collected office research" className="rounded border bg-blue-50 p-3 space-y-2">
  <h4 className="font-semibold text-sm">Offices and electrical work</h4>
  <p className="text-xs">Research draft · {research?.researched_at && Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Date unavailable'}. Review findings before relying on requirements or office roles.</p>
  {!rows.length && <p className="text-sm">Office research has not been collected yet.</p>}
  <OfficeRoleOverview rows={rows} onInspect={inspect} onNavigate={onNavigate}/>
  <ElectricalResearchTasks rows={rows} onInspect={inspect}/>
  {rows.map((row,index)=>{const source=safeGovernmentOfficeSourceUrl(row.official_source_url);return <details key={index} ref={node=>{if(node)nodes.current.set(index,node);else nodes.current.delete(index);}} className="min-w-0 scroll-mt-3 rounded border bg-white p-2 text-xs [overflow-wrap:anywhere]">
   <summary tabIndex={0} className="cursor-pointer min-h-11 flex items-center font-medium">{row.label}: {row.office_name || 'Not found yet'}</summary>
   <div className="mt-2 space-y-2">
    <p>Applicability: {row.applicability==='potentially_applicable'?'May apply — check the proposed work':row.applicability==='not_applicable_candidate'?'Research suggests it may not apply — confirm before skipping':'Not established yet'}</p>
    {row.service_area && <p><strong>Service area:</strong> {row.service_area}</p>}
    {source && <a href={source} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Open research source</a>}
    {row.responsibility_quote && <blockquote className="whitespace-pre-wrap">{row.responsibility_quote}</blockquote>}
    {row.delegation_quote && <p><strong>Provider responsibility:</strong> {row.delegation_quote}</p>}
    {Object.values(row.contact_info || {}).some(Boolean) && <p className="break-words"><strong>Contact:</strong> {Object.values(row.contact_info).filter(Boolean).join(' · ')}</p>}
    <dl className="space-y-1">{Object.entries(row.research_fields || {}).map(([key,value])=><div key={key}><dt className="font-medium">{officeResearchFieldLabels[key] || key}</dt><dd className="whitespace-pre-wrap break-words">{value || 'Not found yet'}</dd></div>)}</dl>
    {row.notes && <p>{row.notes}</p>}
   </div>
  </details>;})}
 </section>;
}
