const { spawnSync } = require('child_process');
const fs = require('fs');
const RUN = 'C:\\Users\\BrettHeinlein\\AppData\\Local\\npm-cache\\_npx\\ebe492f4494510c0\\node_modules\\base44\\bin\\run.js';
const APP = '68dfcc5e57bbbc35387da97c';
const files = [
  ['src/Layout.jsx', 'Layout.json', 'jsx'],
  ['src/components/mobile/PullToRefresh.jsx', 'ptr.json', 'jsx'],
  ['src/components/timeclock/TimeTracker.jsx', 'tt.json', 'jsx'],
  ['src/components/timeclock/TimeTrackerSettings.jsx', 'tts.json', 'jsx'],
  ['src/pages/TimeClock.jsx', 'tc.json', 'jsx'],
  ['src/components/timeclock/QuickClockSection.jsx', 'qcs.json', 'jsx'],
  ['src/components/timeclock/PTOBalanceView.jsx', 'pto.json', 'jsx'],
  ['src/components/timeclock/TimeClockShiftDetail.jsx', 'tcsd.json', 'jsx'],
  ['src/components/timeclock/TimeClockReportsDashboard.jsx', 'tcrd.json', 'jsx'],
  ['src/components/timeclock/PayPeriodManager.jsx', 'ppm.json', 'jsx'],
  ['src/components/timeclock/TimeClockAdmin.jsx', 'tca.json', 'jsx'],
  ['src/components/timeclock/CorrectionRequestDialog.jsx', 'crd.json', 'jsx'],
  ['src/components/timeclock/TimeOffRequestDialog.jsx', 'tord.json', 'jsx'],
  ['src/components/timeclock/CorrectionRequestAdminPanel.jsx', 'crap.json', 'jsx'],
  ['src/components/timeclock/faceScanRuntime.js', 'fsr.json', 'js'],
  ['src/components/timeclock/FaceRecognition.jsx', 'fr.json', 'jsx'],
  ['src/components/timeclock/QRScanner.jsx', 'qr.json', 'jsx'],
];
const manifest = [];
for (const [path, out, kind] of files) {
  const res = spawnSync(process.execPath, [RUN, 'api', 'fetch', 'GET',
    `/api/apps/${APP}/code/content?path=${path}`, '--output', `.tmp-remote/${out}`],
    { encoding: 'utf8', timeout: 120000 });
  console.log((res.status === 0 ? 'fetched ' : 'FAIL    ') + path);
  manifest.push({ path, out, jsx: kind !== 'ts' });
}
fs.writeFileSync('.tmp-remote-manifest.json', JSON.stringify(manifest));
