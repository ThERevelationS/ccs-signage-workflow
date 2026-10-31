import {FileText,Building2,ListChecks,Radio} from 'lucide-react';
export default function JurisdictionWorkspaceNavigation({jurisdiction,onNavigate}){
 const docs=Array.isArray(jurisdiction.documents)?jurisdiction.documents:[];
 const roles=jurisdiction.office_research?.method==='office-research-requirements-v1'&&Array.isArray(jurisdiction.office_research.roles)?jurisdiction.office_research.roles:[];
 const offices=roles.filter(row=>Boolean(row.office_name?.trim())).length;
 const sections=[
  {key:'documents',label:'Documents',detail:docs.length?docs.length+' saved':'None saved yet',Icon:FileText},
  {key:'offices',label:'Offices',detail:offices?offices+' office notes':'Nobody looked yet',Icon:Building2},
  {key:'requirements',label:'Rules & fees',detail:'What the office requires',Icon:ListChecks},
  {key:'monitoring',label:'Page watch',detail:'We watch their pages for changes',Icon:Radio},
 ];
 return <nav aria-label="Jurisdiction workspace shortcuts" className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b bg-white p-3">
  {sections.map(({key,label,detail,Icon})=><button type="button" key={key} type="button" onClick={()=>onNavigate(key)} className="min-h-11 min-w-0 rounded-lg border bg-gray-50 p-2 text-left hover:border-purple-400 hover:bg-purple-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"><span className="flex items-start gap-1.5 text-xs font-semibold"><Icon aria-hidden="true" className="h-4 w-4 shrink-0"/><span className="break-words">{label}</span></span><span className="mt-1 block text-[11px] text-gray-600">{detail}</span></button>)}
 </nav>;
}
