const fs = require('fs');
const edits = [
  {
    old_text: 'import { \n  UserPlus, \n  Save, \n  Loader2,\n  CheckCircle2\n} from "lucide-react";',
    new_text: 'import { \n  UserPlus, \n  Save, \n  Loader2\n} from "lucide-react";',
  },
  {
    old_text: '            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />',
    new_text: '            <div className="relative mb-4 h-16 w-16">\n' +
      '              <span className="success-burst" />\n' +
      '              <svg className="h-16 w-16 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">\n' +
      '                <circle cx="12" cy="12" r="10" />\n' +
      '                <path className="check-draw" d="m8 12.5 2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" />\n' +
      '              </svg>\n' +
      '            </div>',
  },
];
fs.writeFileSync('.tmp-fed.json', JSON.stringify(edits));
console.log('ok');
