const fs = require('fs');
const path = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Settings/views/ImportDataPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Remove FIELD_LEVEL button logic
const fieldLevelLogicStr = `// If AI partially resolved fields
                                                                                        if (resolutions[rowKey]?.ownership === 'FIELD_LEVEL') {
                                                                                            const decidedCount = Object.keys(resolutions[rowKey].fields || {}).filter(k => resolutions[rowKey].fields[k]).length;
                                                                                            const totalDiffs = conflict.diffs?.length || 0;
                                                                                            if (decidedCount < totalDiffs) {
                                                                                                return 'Resolve Remaining';
                                                                                            }
                                                                                        }`;

content = content.replace(fieldLevelLogicStr, '');

// Also search for any totalDiffs rendering
content = content.replace(/{totalDiffs > 0 && !conflict.existing\?\.owners && \([\s\S]*?\)}/g, '');
content = content.replace(/{conflict.existing\?\.owners \? 'Owner Conflict' : \`\${totalDiffs} Field\${totalDiffs > 1 \? 's' : ''} Conflict\`}/g, "'Owner Conflict'");

fs.writeFileSync(path, content);
console.log("Cleaned frontend UI further.");
