const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/pages/**/*FilterPanel.jsx');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Replace backgroundColor: 'var(--bg-card)' with isDark conditional or '#1e293b' for dark
    // Let's just do a string replacement.
    // We already have `const { isDark } = useTheme();` in most panels.
    // If we replace backgroundColor: 'var(--bg-card)' -> backgroundColor: isDark ? '#1e293b' : '#ffffff'
    
    // Some might have backgroundColor: '#fff'
    // Let's replace 'var(--bg-card)' with isDark ? '#1e293b' : '#ffffff' in the main container style
    
    // Instead of regex, let's just make it simpler. The main container is usually:
    // width: '380px', backgroundColor: isDark ? '#1e293b' : '#fff', boxShadow: ...
    
    content = content.replace(/backgroundColor:\s*['"]var\(--bg-card\)['"]/g, "backgroundColor: isDark ? '#1e293b' : '#ffffff'");
    content = content.replace(/backgroundColor:\s*['"]#fff['"]/g, "backgroundColor: isDark ? '#1e293b' : '#ffffff'");
    content = content.replace(/backgroundColor:\s*['"]#ffffff['"]/g, "backgroundColor: isDark ? '#1e293b' : '#ffffff'");
    
    content = content.replace(/background:\s*['"]var\(--bg-card\)['"]/g, "background: isDark ? '#1e293b' : '#ffffff'");
    content = content.replace(/background:\s*['"]#fff['"]/g, "background: isDark ? '#1e293b' : '#ffffff'");
    content = content.replace(/background:\s*['"]#ffffff['"]/g, "background: isDark ? '#1e293b' : '#ffffff'");
    
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
});
