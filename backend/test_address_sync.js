import AddressParsingService from './services/AddressParsingService.js';
async function test() {
    const result = await AddressParsingService.parseAddress('vpo sham garh tehsil nilokheri distt karnal');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
}
test();
