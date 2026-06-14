import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import AddressParsingService from './services/AddressParsingService.js';
import connectDB from './config/db.js';

const testAddresses = [
    ".KARNAL",
    "KURUKSHETRA",
    "N. F. L. TOWNSHIP PANIPAT",
    "NISSING KARNAL",
    "P. O. CHAUGANA KARNAL",
    "PO SHAHZADPUR TEH NARAINGARH AMBALA",
    "R/O KARNAL HARYANA",
    "Radaur",
    "SEC-7 U/E KARNAL",
    "SEC-7-A FARIDABAD",
    "SEC. 9 U.E DISTT. KARNAL",
    "VPO RAITKHANA P.O UDANA DISTT. KARNAL",
    "VILL CHANARTHAL DISTT. KURUKSHETRA",
    "VILL HABATPUR - KARNAL",
    "YAMUNA NAGAR",
    "YAMUNA COLONY"
];

async function runTests() {
    await connectDB();
    await AddressParsingService.initializeMasterData();

    console.log("=== Address Parsing Test ===");
    for (const addr of testAddresses) {
        console.log(`\nTesting: "${addr}"`);
        const result = await AddressParsingService.parseAddress(addr);
        console.log(JSON.stringify(result, null, 2));
    }
    
    process.exit(0);
}

runTests();
