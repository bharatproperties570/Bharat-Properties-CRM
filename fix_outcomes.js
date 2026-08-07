const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'context', 'PropertyConfigContext.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// A regex trick or we can just find and replace for Site Visit.
// Actually, an easier way is to just inject it at runtime in the component or parse it.

// Let's use a regex to find all `outcomes: [` inside `name: 'Site Visit'` and `name: 'Meeting'`.
// But wait, parsing JSX as text is fragile. Let's do it carefully.
// Instead of messing with the huge file, let's write a targeted script.

const siteVisitIndex = content.indexOf(`name: 'Site Visit'`);
const meetingIndex = content.indexOf(`name: 'Meeting'`);

if (siteVisitIndex > -1) {
    let beforeSV = content.substring(0, siteVisitIndex);
    let afterSV = content.substring(siteVisitIndex);
    
    // We only want to process outcomes until the next activity 'name: '...''
    const nextActivityIndex = afterSV.indexOf(`name: '`, 100);
    
    let svBlock = nextActivityIndex > -1 ? afterSV.substring(0, nextActivityIndex) : afterSV;
    let restAfterSV = nextActivityIndex > -1 ? afterSV.substring(nextActivityIndex) : '';
    
    // Inject the outcome into every outcomes array
    svBlock = svBlock.replace(/outcomes:\s*\[([\s\S]*?)\]/g, (match, inner) => {
        if (!inner.includes('Owner Denied Access/Not Selling')) {
            return `outcomes: [${inner}                            { label: 'Owner Denied Access/Not Selling', score: -30, stage: 'Closed (Lost)' },\n                        ]`;
        }
        return match;
    });
    
    content = beforeSV + svBlock + restAfterSV;
}

const mIndex = content.indexOf(`name: 'Meeting'`);
if (mIndex > -1) {
    let beforeM = content.substring(0, mIndex);
    let afterM = content.substring(mIndex);
    
    const nextActivityIndex = afterM.indexOf(`name: '`, 100);
    
    let mBlock = nextActivityIndex > -1 ? afterM.substring(0, nextActivityIndex) : afterM;
    let restAfterM = nextActivityIndex > -1 ? afterM.substring(nextActivityIndex) : '';
    
    mBlock = mBlock.replace(/outcomes:\s*\[([\s\S]*?)\]/g, (match, inner) => {
        if (!inner.includes('Postponed Indefinitely')) {
            return `outcomes: [${inner}                            { label: 'Postponed Indefinitely', score: -30, stage: 'Closed (Lost)' },\n                        ]`;
        }
        return match;
    });
    
    content = beforeM + mBlock + restAfterM;
}

// Bump version
content = content.replace(/forms_migrated_v3/g, 'forms_migrated_v4');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed outcomes in PropertyConfigContext.jsx');

