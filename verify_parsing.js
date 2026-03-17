import LeadParsingService from './backend/services/LeadParsingService.js';

const mockEmail99acres = {
    subject: 'New enquiry for your property on 99acres',
    body: `
        You have a new lead!
        Name: John Doe
        Mobile: +91 9876543210
        Email: john.doe@example.com
        Property: 3BHK Flat in Gurgaon Sector 54
        Message: Interested in this property.
    `
};

const mockEmailREI = {
    subject: 'Enquiry from RealEstateIndia.com',
    body: `
        Lead Details:
        Sender Name: Jane Smith
        Mobile: 918887776655
        Email: jane.smith@test.com
        Enquiry For: Residential Plot in Mohali
    `
};

console.log('--- Testing 99acres Parsing ---');
const parsed99 = LeadParsingService.parsePortalEmail(mockEmail99acres.subject, mockEmail99acres.body);
console.log(JSON.stringify(parsed99, null, 2));

console.log('\n--- Testing RealEstateIndia Parsing ---');
const parsedREI = LeadParsingService.parsePortalEmail(mockEmailREI.subject, mockEmailREI.body);
console.log(JSON.stringify(parsedREI, null, 2));

if (parsed99.mobile === '9876543210' && parsedREI.mobile === '8887776655') {
    console.log('\n✅ Parsing Verification Successful!');
} else {
    console.error('\n❌ Parsing Verification Failed!');
    process.exit(1);
}
