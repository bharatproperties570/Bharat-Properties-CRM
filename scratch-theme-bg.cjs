const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'src', 'pages', 'Dashboard', 'components');
const files = fs.readdirSync(dashPath).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
    const filePath = path.join(dashPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace hardcoded dark backgrounds
    content = content.replace(/background:\s*['"]rgba\(15,\s*23,\s*42,\s*0\.[46]\)['"]/g, "background: 'var(--panel-bg)'");
    content = content.replace(/background:\s*['"]rgba\(30,\s*41,\s*59,\s*0\.4\)['"]/g, "background: 'var(--panel-bg)'");
    content = content.replace(/background:\s*['"]rgba\(255,255,255,0\.0[235]\)['"]/g, "background: 'var(--border-light)'");
    content = content.replace(/border:\s*['"]1px solid rgba\(255,255,255,0\.0[235]\)['"]/g, "border: '1px solid var(--border-light)'");
    
    // Gradient
    content = content.replace(/background:\s*['"]linear-gradient\(135deg, rgba\(30, 41, 59, 0\.5\), rgba\(15, 23, 42, 0\.5\)\)['"]/g, "background: 'var(--gradient-dark)'");

    fs.writeFileSync(filePath, content);
});

console.log('Background/Border Theme variables injected into Dashboard components.');
