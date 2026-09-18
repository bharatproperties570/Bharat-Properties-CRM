import assert from 'assert';

// MongoDB query engine array match semantics simulation
function mongoMatch(document, query) {
    for (const key of Object.keys(query)) {
        const docVal = document[key];
        const queryVal = query[key];
        
        if (Array.isArray(docVal)) {
            if (!docVal.includes(queryVal)) return false;
        } else {
            if (docVal !== queryVal) return false;
        }
    }
    return true;
}

function runTest() {
    console.log("Running Trigger Query Verification Test...");

    const rule = {
        triggerEvent: ["onCreate", "onWebCapture"]
    };

    assert.strictEqual(
        mongoMatch(rule, { triggerEvent: "onCreate" }), 
        true, 
        "rule MUST match query for 'onCreate'"
    );

    assert.strictEqual(
        mongoMatch(rule, { triggerEvent: "onWebCapture" }), 
        true, 
        "rule MUST match query for 'onWebCapture'"
    );

    assert.strictEqual(
        mongoMatch(rule, { triggerEvent: "onImport" }), 
        false, 
        "rule MUST NOT match query for 'onImport'"
    );

    console.log("Trigger Query Verification Passed.");
}

runTest();
