import AddressParsingService from './services/AddressParsingService.js';
import mongoose from 'mongoose';

async function test() {
    await mongoose.connect('mongodb://localhost:27017/bharat-properties-crm', { useNewUrlParser: true, useUnifiedTopology: true });
    const result = await AddressParsingService.parseAddress('vpo sham garh tehsil nilokheri distt karnal');
    console.log(result);
    process.exit(0);
}
test();
