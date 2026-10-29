const fs = require('fs');
fs.writeFileSync('.tmp-edit-entry.json', JSON.stringify([{
  old_text: "    size: 'compact',\n    location: 'both',\n    scale: 1,\n    opacity: 1,\n    font: 'default',\n    background_style: 'glass',",
  new_text: "    size: 'expanded',\n    location: 'both',\n    scale: 1,\n    opacity: 1,\n    font: 'default',\n    background_style: 'minimal',",
}]));
console.log('written');
