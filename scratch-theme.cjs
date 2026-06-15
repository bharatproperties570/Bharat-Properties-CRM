const fs = require('fs');
const path = require('path');

const dashPath = path.join(__dirname, 'src', 'pages', 'Dashboard', 'components');
const files = fs.readdirSync(dashPath).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
    const filePath = path.join(dashPath, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace text color #fff with var(--text-main)
    content = content.replace(/color:\s*['"]#fff['"]/g, "color: 'var(--text-main)'");
    content = content.replace(/color:\s*['"]white['"]/g, "color: 'var(--text-main)'");
    
    // Replace text color #94a3b8 with var(--text-muted)
    content = content.replace(/color:\s*['"]#94a3b8['"]/g, "color: 'var(--text-muted)'");
    
    // Replace background rgba(15, 23, 42, 0.8) with var(--card-bg)
    content = content.replace(/background:\s*['"]rgba\(15,\s*23,\s*42,\s*0\.8\)['"]/g, "background: 'var(--card-bg)'");

    fs.writeFileSync(filePath, content);
});

console.log('Theme variables injected into Dashboard components.');
