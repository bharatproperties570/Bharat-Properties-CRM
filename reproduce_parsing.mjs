
import { splitIntakeMessage, parseDealContent } from './src/utils/dealParser.js';

// Mock data if needed, or rely on what's imported by dealParser if it works in node
// We might need to handle the import of mockData in dealParser if we run this with node.
// For now, let's assume we can use a simple test runner or just node with --experimental-modules if needed.
// Or effectively, I will create a script that MOCKS the dependencies if I can't easily run the app context.

const testCases = [
    {
        name: "Single Deal with Extra Text",
        text: `Urgent Sale
500 sqyd plot in sec 82 mohali
Contact me asap`
    },
    {
        name: "Multiple Deals in Numbered List",
        text: `1. 500 sqyd plot in sec 82 mohali
2. 200 sqyd plot in aero city
Contact 9876543210`
    },
    {
        name: "Complex Mixed Content",
        text: `Inventory Update:

Plot No 123, Sector 82, 500 Sqyd
Price 2 Cr

Also available:
SCO 55, Aerocity, 100 Sqyd
`
    }
];

async function runTests() {
    console.log("Starting Parsing Verification...\n");

    for (const test of testCases) {
        console.log(`--- Test: ${test.name} ---`);
        console.log("Input:\n", test.text);

        try {
            const deals = splitIntakeMessage(test.text);
            console.log(`\nDetected ${deals.length} deal(s).`);

            deals.forEach((deal, i) => {
                console.log(`\nDeal #${i + 1}:`);
                console.log(`  Location: ${deal.location}`);
                console.log(`  Unit: ${deal.address.unitNumber}`);
                console.log(`  Size: ${deal.specs.size}`);
                console.log(`  Price: ${deal.specs.price}`);
                console.log(`  Remarks: "${deal.remarks}"`);
                console.log(`  Contacts: ${deal.allContacts.map(c => c.mobile).join(', ')}`);
            });
        } catch (e) {
            console.error("Error parsing:", e);
        }
        console.log("\n" + "=".repeat(30) + "\n");
    }
}

runTests();
