const fs = require('fs');
const path = require('path');

// Create dist/popup directory if it doesn't exist
const distPopupDir = path.join(__dirname, '..', 'dist', 'popup');
if (!fs.existsSync(distPopupDir)) {
  fs.mkdirSync(distPopupDir, { recursive: true });
}

// Copy popup.html
const htmlSource = path.join(__dirname, '..', 'src', 'popup', 'popup.html');
const htmlDest = path.join(distPopupDir, 'popup.html');
fs.copyFileSync(htmlSource, htmlDest);
console.log('✓ Copied popup.html');

// Copy popup.css
const cssSource = path.join(__dirname, '..', 'src', 'popup', 'popup.css');
const cssDest = path.join(distPopupDir, 'popup.css');
fs.copyFileSync(cssSource, cssDest);
console.log('✓ Copied popup.css');

console.log('✓ Assets copied successfully');
