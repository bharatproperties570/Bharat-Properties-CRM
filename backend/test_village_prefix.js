import AddressParsingService from './services/AddressParsingService.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const result = await AddressParsingService.parseAddress('vpo sham garh');
    console.log("Parsed Address:", JSON.stringify(result, null, 2));
    process.exit(0);
}
test();
