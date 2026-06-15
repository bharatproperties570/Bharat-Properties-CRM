const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'src', 'pages', 'Dashboard', 'components');
const files = fs.readdirSync(dashPath).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
    const filePath = path.join(dashPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace remaining dark backgrounds
    content = content.replace(/background:\s*['"]rgba\(15,\s*23,\s*42,\s*0\.6\)['"]/g, "background: 'var(--panel-bg)'");
    content = content.replace(/background:\s*['"]rgba\(255,255,255,0\.03\)['"]/g, "background: 'var(--border-light)'");
    content = content.replace(/border:\s*['"]1px solid rgba\(255,255,255,0\.03\)['"]/g, "border: '1px solid var(--border-light)'");
    
    fs.writeFileSync(filePath, content);
});

console.log('Secondary Background/Border Theme variables injected.');
