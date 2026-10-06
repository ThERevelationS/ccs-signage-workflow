import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import RuleCard from "../../src/components/admin/PermittingRuleCard";
import "../../src/index.css";
function Fixture() {
 const [receipt,setReceipt]=useState("");
 const rule={id:"fixture-conflict",version:1,status:"needs_review",confidence:"high",conflict_state:"conflicting_sources",rule_category:"submittal_requirement",requirement:"Fixture only — review both retained sources",is_operational:false,citations:[{section_or_page:"PDF page 1",excerpt:"First fixture citation"},{section_or_page:"PDF page 2",excerpt:"Second fixture citation"}]};
 return <main className="p-6 space-y-4"><h1>Isolated permitting review fixture</h1><p>Local component callbacks only. No API calls or production records.</p><RuleCard rule={rule} expanded onToggle={()=>{}} onApprove={()=>setReceipt("Unexpected approval")} onReject={()=>{}} onEdit={()=>{}} onResolveConflict={rationale=>setReceipt("Local resolution callback: "+rationale)} actionLoading={false}/><output aria-label="Local callback receipt">{receipt}</output></main>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
