
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Simple regex-based duplicate key detector for JS/JSX objects
function findDuplicateKeys(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let inObject = 0;
    let currentObjectLines = [];

    // This is a naive detector, but good for style objects which cause these issues
    // We look for patterns like 'key: value,' within { }
    const results = [];

    // Improved naive approach: look for the same key defined twice within the same scope
    // We'll use a simple stack to track braces
    let depth = 0;
    let scopes = [{}]; // Stack of maps tracking keys in current scope

    const linesArr = content.split('\n');
    linesArr.forEach((line, index) => {
        // Increase/decrease depth based on braces
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;

        for (let i = 0; i < openBraces; i++) {
            depth++;
            scopes.push({});
        }

        // Extract potential keys from line (naive: "key: value")
        const keyMatch = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:/);
        if (keyMatch && depth > 0) {
            const key = keyMatch[1];
            if (scopes[depth][key]) {
                results.push({ line: index + 1, key, file: filePath });
            }
            scopes[depth][key] = true;
        }

        for (let i = 0; i < closeBraces; i++) {
            if (depth > 0) {
                depth--;
                scopes.pop();
            }
        }
    });

    return results;
}

const targetDir = process.argv[2] || 'src';

// Recursively find files
function getFiles(dir) {
    let files = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            files = files.concat(getFiles(file));
        } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
            files.push(file);
        }
    });
    return files;
}

const files = getFiles(targetDir);
let allDuplicates = [];
files.forEach(file => {
    try {
        const duplicates = findDuplicateKeys(file);
        allDuplicates = allDuplicates.concat(duplicates);
    } catch (e) { }
});

if (allDuplicates.length > 0) {
    console.log(JSON.stringify(allDuplicates, null, 2));
} else {
    console.log("No duplicates found.");
}
