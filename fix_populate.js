import fs from 'fs';

const path = 'backend/controllers/contact.controller.js';
let content = fs.readFileSync(path, 'utf8');

const populateStr = `const populateFields = [
    { path: 'owner', select: 'fullName email name' },
    { path: 'team', select: 'name' },
    { path: 'teams', select: 'name' },
    { path: 'groups' },
    { path: 'assignment.assignedTo', select: 'fullName email name' },
    { path: 'assignment.assignedBy', select: 'fullName email name' },
    { path: 'assignment.team', select: 'name' },
    { path: 'source' },
    { path: 'subSource' },
    { path: 'campaign' },
    { path: 'title' },
    { path: 'countryCode' },
    { path: 'professionCategory' },
    { path: 'professionSubCategory' },
    { path: 'designation' }
];`;

content = content.replace(/const populateFields = \[[\s\S]*?\];/, populateStr);
fs.writeFileSync(path, content);
console.log("Updated populateFields successfully");
