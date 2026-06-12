import "dotenv/config";
import AddressParsingService from './services/AddressParsingService.js';
import mongoose from 'mongoose';
import connectDB from "./config/db.js";

const testAddresses = [
    "Flat 402, Block C, near Rama Temple, Sector 15, Vasundhara, Ghaziabad, UP - 201012",
    "House No. 128A, Lane 3, near Hanuman Mandir, Sector 45, Gurugram, Haryana, 122001",
    "Shop 4, Market Complex, Phase 2, DLF, Gurgaon, 122002",
    "Village Badarpur, Tehsil Sohna, Gurgaon, HR",
    "12/A Park Street, near Metro Station, Kolkata, WB, 700016",
    "Shop 12, Main Market, Ghaziabad, Haryana, 201001"
];

async function runTests() {
    console.log("Connecting to Database...");
    await connectDB();
    console.log("DB Connected.");

    console.log("\nStarting Address Parsing Tests...\n");
    for (const addr of testAddresses) {
        console.log(`Input: "${addr}"`);
        const result = await AddressParsingService.parseAddress(addr);
        console.log("Parsed Result:", JSON.stringify(result, null, 2));
        console.log("-".repeat(40));
    }

    mongoose.connection.close();
    console.log("DB Connection Closed.");
}

runTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
