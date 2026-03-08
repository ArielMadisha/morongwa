const fs = require('fs');
const path = 'frontend/app/store/page.tsx';
let s = fs.readFileSync(path, 'utf8');
// Fix: remove '</div>' + curly apostrophe + spaces + ')}' and fix structure
s = s.replace(/<\/div>[\u2019'\s]+\)\}/g, '</div>\n                  </main>\n                </>\n              )}');
fs.writeFileSync(path, s);
console.log('Done');
