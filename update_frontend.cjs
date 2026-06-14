const fs = require('fs');
const path = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Settings/views/ImportDataPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove isAiResolving state
content = content.replace("const [isAiResolving, setIsAiResolving] = useState(false);", "");

// 2. Remove handleAiAutoResolve method entirely
const aiResolveStart = content.indexOf('// Handle AI Auto Resolve');
if (aiResolveStart !== -1) {
    const aiResolveEnd = content.indexOf('// Apply bulk resolution to all conflicts at once', aiResolveStart);
    if (aiResolveEnd !== -1) {
        content = content.substring(0, aiResolveStart) + content.substring(aiResolveEnd);
    }
}

// 3. Remove the AI auto resolve button section from the UI
const uiBotStart = content.indexOf('<div style={{ padding: \'12px 24px\', background: \'#f0fdf4\', borderBottom: \'1px solid #bbf7d0\'');
if (uiBotStart !== -1) {
    const nextSection = content.indexOf('{conflicts.length > 1 && (', uiBotStart);
    if (nextSection !== -1) {
        content = content.substring(0, uiBotStart) + content.substring(nextSection);
    }
}

// 4. Remove FIELD_LEVEL rendering in the table
const fieldLevelStart = content.indexOf('{/* ⚡ FIELD-BY-FIELD RESOLUTION PANEL */}');
if (fieldLevelStart !== -1) {
    // find the end of the block. It ends with: "})()}" followed by "</td></tr>"
    const fieldLevelEnd = content.indexOf('})()}', fieldLevelStart);
    if (fieldLevelEnd !== -1) {
        const trEnd = content.indexOf('</tr>', fieldLevelEnd);
        content = content.substring(0, fieldLevelStart) + content.substring(trEnd + 5);
    }
}

fs.writeFileSync(path, content);
console.log("Successfully updated frontend UI.");
