const fs = require('fs');
const edits = [
  {
    old_text: '  }\n\n  const recentActivity = [];',
    new_text: '  }\n\n  const cardGlow = hasProblem ? "glow-danger"\n    : statusData?.status === "clocked_in" && statusData.work_pause_status === "paused" ? "glow-warning"\n    : statusData?.status === "clocked_in" && statusData.break_status === "on_break" ? "glow-warning"\n    : statusData?.status === "clocked_in" ? "glow-success"\n    : "";\n\n  const recentActivity = [];',
  },
  {
    old_text: '    <div className="clay-card p-4 mb-6">',
    new_text: '    <div className={`clay-card glow-card p-4 mb-6 ${cardGlow}`}>',
  },
];
fs.writeFileSync('.tmp-etc2.json', JSON.stringify(edits));
console.log('ok');
