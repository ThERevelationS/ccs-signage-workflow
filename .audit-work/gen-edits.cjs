const fs = require('fs');
// Reproduce the same edits against REMOTE content — derive old/new pairs
// by applying each known transform, verifying old exists in remote text.
const remote = JSON.parse(fs.readFileSync('.audit-work/jdp-remote.json','utf8')).files[0].content;
const E = [];
const add=(o,n)=>{ if(!remote.includes(o)) { console.log('MISSING:', o.slice(0,60)); process.exit(1);} E.push({old_text:o,new_text:n,replace_all:false}); };

add(`          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}`, `          Overview
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "documents"} aria-controls="jurisdiction-overview-panel" onClick={() => setActiveTab("documents")} className={\`min-h-11 flex-1 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500 \${activeTab === "documents" ? "border-b-2 border-purple-600 text-purple-700 bg-white" : "text-gray-500 hover:text-gray-700"}\`}>
          Documents
          {(jurisdiction.documents?.length > 0) && (<span className="ml-1 bg-purple-100 text-purple-700 text-[10px] rounded-full px-1.5 py-0.5 font-bold">{jurisdiction.documents.length}</span>)}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "offices"} aria-controls="jurisdiction-overview-panel" onClick={() => setActiveTab("offices")} className={\`min-h-11 flex-1 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500 \${activeTab === "offices" ? "border-b-2 border-purple-600 text-purple-700 bg-white" : "text-gray-500 hover:text-gray-700"}\`}>
          Offices
          {(jurisdiction.office_research?.offices?.length > 0) && (<span className="ml-1 bg-purple-100 text-purple-700 text-[10px] rounded-full px-1.5 py-0.5 font-bold">{jurisdiction.office_research.offices.length}</span>)}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}`);

add(`      {activeTab === "overview" && <><JurisdictionWorkspaceNavigation jurisdiction={jurisdiction} onNavigate={navigateWorkspace}/><div id="jurisdiction-overview-panel" role="tabpanel" className="flex-1 overflow-y-auto p-4 space-y-4">
        <LocalityApprovedEvidence jurisdiction={jurisdiction} isAdmin={currentUser?.role === "admin"} />

        <OfficeChangeLog jurisdiction={jurisdiction} />

        <section ref={node=>{workspaceSections.current.offices=node;}}`,
`      {activeTab !== "activity" && <><div id="jurisdiction-overview-panel" role="tabpanel" className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "overview" && <>
        <JurisdictionWorkspaceNavigation jurisdiction={jurisdiction} onNavigate={navigateWorkspace}/>
        <LocalityApprovedEvidence jurisdiction={jurisdiction} isAdmin={currentUser?.role === "admin"} />

        <OfficeChangeLog jurisdiction={jurisdiction} />
        </>}

        {activeTab === "offices" && <>
        <section ref={node=>{workspaceSections.current.offices=node;}}`);

add(`onNavigate={navigateWorkspace} /></section>

        <section ref={node=>{workspaceSections.current.requirements=node;}}`,
`onNavigate={navigateWorkspace} /></section>
        </>}

        {activeTab === "overview" && <>
        <section ref={node=>{workspaceSections.current.requirements=node;}}`);

add(`        {/* Documents */}
         <div ref={node=>{workspaceSections.current.documents=node;}}`,
`        </>}

        {activeTab === "documents" && <>
        {/* Documents */}
         <div ref={node=>{workspaceSections.current.documents=node;}}`);

add(`            {(!jurisdiction.documents || jurisdiction.documents.length === 0) && (
              <p className="text-xs text-gray-400 italic">No documents yet. Use the AI refresh to discover documents.</p>
            )}
          </div>`,
`            {(!jurisdiction.documents || jurisdiction.documents.length === 0) && (
              <p className="text-xs text-gray-400 italic">No documents yet. Use the AI refresh to discover documents.</p>
            )}
            {!docSearchTerm.trim() && (jurisdiction.documents?.length || 0) > docVisibleCount && (
              <button type="button" onClick={() => setDocVisibleCount((jurisdiction.documents || []).length)} className="w-full rounded border border-dashed border-gray-300 bg-white py-2 text-xs font-medium text-purple-700 hover:bg-purple-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-purple-500">
                Show all {(jurisdiction.documents || []).length} documents
              </button>
            )}
          </div>`);

add(`          </div>
        </div>


      </div>

      {/* AI Permit Workflow Designer entry — preselects this jurisdiction */}
      <div className="border-t p-3 bg-violet-50 border-l-4 border-l-violet-400">`,
`          </div>
        </div>
        </>}

      </div>

      {/* AI Permit Workflow Designer entry — preselects this jurisdiction */}
      {activeTab === "overview" && <>
      <div className="border-t p-3 bg-violet-50 border-l-4 border-l-violet-400">`);

add(`            {asking ? "Asking..." : "Ask"}
          </Button>
        </div>
      </div>
      </>}
    </div>
  );
}`,
`            {asking ? "Asking..." : "Ask"}
          </Button>
        </div>
      </div>
      </>}
      </>}
    </div>
  );
}`);

add(`  const navigateWorkspace = (section, sourceId) => {
    if (section === 'documents') {
      setSourceRequest(previous => typeof sourceId === 'string' && sourceId.trim()
        ? { jurisdictionId: jurisdiction.id, sourceId: sourceId.trim(), token: (previous?.token || 0) + 1 }
        : null);
    }
    const target=workspaceSections.current[section];
    if(target){target.scrollIntoView({block:"start",behavior:"auto"});target.focus({preventScroll:true});}
  };`,
`  const SECTION_TAB = { documents: 'documents', offices: 'offices', monitoring: 'offices', requirements: 'overview' };
  const navigateWorkspace = (section, sourceId) => {
    if (section === 'documents') {
      setSourceRequest(previous => typeof sourceId === 'string' && sourceId.trim()
        ? { jurisdictionId: jurisdiction.id, sourceId: sourceId.trim(), token: (previous?.token || 0) + 1 }
        : null);
    }
    const tab = SECTION_TAB[section];
    if (tab) setActiveTab(tab);
    setTimeout(() => {
      const target=workspaceSections.current[section];
      if(target){target.scrollIntoView({block:"start",behavior:"auto"});target.focus({preventScroll:true});}
    }, 60);
  };`);

add(`  const [activeTab, setActiveTab] = useState("overview");`,
`  const [activeTab, setActiveTab] = useState("overview");
  const [docVisibleCount, setDocVisibleCount] = useState(8);`);

add(`             {(jurisdiction.documents || []).map(doc => (`,
`             {(docSearchTerm.trim() ? (jurisdiction.documents || []) : (jurisdiction.documents || []).slice(0, docVisibleCount)).map(doc => (`);

fs.writeFileSync('.audit-work/jdp-edits.json', JSON.stringify(E));
console.log('edits:', E.length, 'all anchors verified in remote');
