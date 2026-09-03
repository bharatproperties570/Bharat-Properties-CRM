const fs = require('fs');

function replaceInFile(filePath, searchStr, replaceStr) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        fs.writeFileSync(filePath, content);
        console.log(`✅ Patched ${filePath}`);
    } else {
        console.log(`⚠️ Search string not found in ${filePath}`);
    }
}

// 1. Contact Controller
replaceInFile(
    './controllers/contact.controller.js',
    'let query = { ...visibilityFilter, isMerged: { $ne: true } };',
    'let query = { isMerged: { $ne: true } };'
);
replaceInFile(
    './controllers/contact.controller.js',
    '        // ─── DYNAMIC SORTING (Senior Professional Optimization) ───',
    '        if (Object.keys(visibilityFilter).length > 0) {\n            query = { $and: [visibilityFilter, query] };\n        }\n\n        // ─── DYNAMIC SORTING (Senior Professional Optimization) ───'
);

// 2. Deal Controller
replaceInFile(
    './controllers/deal.controller.js',
    'let query = { ...visibilityFilter, isVisible: { $ne: false } };',
    'let query = { isVisible: { $ne: false } };'
);
replaceInFile(
    './controllers/deal.controller.js',
    '        const populateFields = [',
    '        if (Object.keys(visibilityFilter).length > 0) {\n            query = { $and: [visibilityFilter, query] };\n        }\n\n        const populateFields = ['
);

// 3. Inventory Controller
replaceInFile(
    './controllers/inventory.controller.js',
    'let query = { ...visibilityFilter };',
    'let query = {};'
);
replaceInFile(
    './controllers/inventory.controller.js',
    '        console.log(`[INVENTORY_QUERY] projectId:`, finalProject, `Query:`, JSON.stringify(query, null, 2));\n        const populateFields = [',
    '        if (Object.keys(visibilityFilter).length > 0) {\n            query = { $and: [visibilityFilter, Object.keys(query).length > 0 ? query : {}] };\n        }\n\n        console.log(`[INVENTORY_QUERY] projectId:`, finalProject, `Query:`, JSON.stringify(query, null, 2));\n        const populateFields = ['
);

// 4. Project Controller
replaceInFile(
    './controllers/project.controller.js',
    'let query = { ...visibilityFilter };',
    'let query = {};'
);
replaceInFile(
    './controllers/project.controller.js',
    '        // Professional Sorting Engine',
    '        if (Object.keys(visibilityFilter).length > 0) {\n            query = { $and: [visibilityFilter, Object.keys(query).length > 0 ? query : {}] };\n        }\n\n        // Professional Sorting Engine'
);

// 5. Models (Contact.js)
replaceInFile(
    './models/Contact.js',
    "visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' }",
    "visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Team' }"
);
replaceInFile(
    './models/Contact.js',
    'visibleTo: { type: String, default: "Everyone" },',
    'visibleTo: { type: String, default: "Team" },'
);

// 6. Models (Deal.js)
replaceInFile(
    './models/Deal.js',
    "visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Everyone' },",
    "visibleTo: { type: String, enum: ['Everyone', 'Team', 'Private'], default: 'Team' },"
);
replaceInFile(
    './models/Deal.js',
    'visibleTo: { type: String, default: "Public" },',
    'visibleTo: { type: String, default: "Team" },'
);

console.log("Patch complete.");
