import test from 'node:test';
import assert from 'node:assert';
import LeadParsingService from './services/LeadParsingService.js';

test('LeadParsingService - Portal Email Parsers Verification Suite', async (t) => {

    await t.test('99acres - Valid modern format', () => {
        const subject = 'New enquiry for your property on 99acres';
        const body = `
            You have received a response on 3BHK Flat in Mohali Sector 82 on 99acres.com.
            Details of the response:
            Rahul Sharma rahul.sharma@example.com +919876543210
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);
        
        assert.ok(result);
        assert.strictEqual(result.portal, '99acres');
        assert.strictEqual(result.name, 'Rahul Sharma');
        assert.strictEqual(result.mobile, '9876543210');
        assert.strictEqual(result.email, 'rahul.sharma@example.com');
        assert.strictEqual(result.listingDetails, '3BHK Flat in Mohali Sector 82');
        assert.strictEqual(result.formatMismatch, false);
    });

    await t.test('99acres - Broken format triggers formatMismatch', () => {
        const subject = 'New enquiry for your property on 99acres';
        const body = `
            You have received a response on 3BHK Flat in Mohali Sector 82 on 99acres.com.
            Details of the response:
            rahul.sharma@example.com (No Name or Mobile provided)
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);
        
        assert.ok(result);
        assert.strictEqual(result.portal, '99acres');
        assert.strictEqual(result.formatMismatch, true);
    });

    await t.test('RealEstateIndia - Valid format', () => {
        const subject = 'Enquiry from RealEstateIndia.com';
        const body = `
            Lead Details:
            Sender Name: Priya Patel
            Mobile: +91-9988776655
            Email: priya.patel@test.com
            Enquiry For: Residential Plot in Zirakpur
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);

        assert.ok(result);
        assert.strictEqual(result.portal, 'RealEstateIndia');
        assert.strictEqual(result.name, 'Priya Patel');
        assert.strictEqual(result.mobile, '9988776655');
        assert.strictEqual(result.email, 'priya.patel@test.com');
        assert.strictEqual(result.listingDetails, 'Residential Plot in Zirakpur');
        assert.strictEqual(result.formatMismatch, false);
    });

    await t.test('MagicBricks - Valid format', () => {
        const subject = 'Enquiry on MagicBricks.com';
        const body = `
            Interest details:
            Name: Vikram Singh
            Contact No: 09876501234
            Email: vikram.singh@gmail.com
            Interested in: Penthouse in Sector 66 Mohali
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);

        assert.ok(result);
        assert.strictEqual(result.portal, 'MagicBricks');
        assert.strictEqual(result.name, 'Vikram Singh');
        assert.strictEqual(result.mobile, '9876501234');
        assert.strictEqual(result.email, 'vikram.singh@gmail.com');
        assert.strictEqual(result.listingDetails, 'Penthouse in Sector 66 Mohali');
        assert.strictEqual(result.formatMismatch, false);
    });

    await t.test('Housing.com - Valid format', () => {
        const subject = 'New lead on Housing.com';
        const body = `
            Details:
            User Name: Amit Verma
            Phone: 919012345678
            User Email: amit.verma@housing.in
            Property Detail: Shop in Sector 80
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);

        assert.ok(result);
        assert.strictEqual(result.portal, 'Housing.com');
        assert.strictEqual(result.name, 'Amit Verma');
        assert.strictEqual(result.mobile, '9012345678');
        assert.strictEqual(result.email, 'amit.verma@housing.in');
        assert.strictEqual(result.listingDetails, 'Shop in Sector 80');
        assert.strictEqual(result.formatMismatch, false);
    });

    await t.test('SquareYards - Valid format', () => {
        const subject = 'Inquiry from SquareYards';
        const body = `
            Lead:
            Name: Preeti Kaur
            Phone: 9872109876
            Email: preeti.kaur@sqy.com
            Project: Marbella Grand IT City
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);

        assert.ok(result);
        assert.strictEqual(result.portal, 'SquareYards');
        assert.strictEqual(result.name, 'Preeti Kaur');
        assert.strictEqual(result.mobile, '9872109876');
        assert.strictEqual(result.email, 'preeti.kaur@sqy.com');
        assert.strictEqual(result.listingDetails, 'Marbella Grand IT City');
        assert.strictEqual(result.formatMismatch, false);
    });

    await t.test('CommonFloor - Valid format', () => {
        const subject = 'Enquiry on CommonFloor';
        const body = `
            Inbound:
            Customer Name: Jaspreet Singh
            Mobile: +919877766554
            Email: jaspreet@cf.com
            Enquired For: Homeland Heights Sector 70
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);

        assert.ok(result);
        assert.strictEqual(result.portal, 'CommonFloor');
        assert.strictEqual(result.name, 'Jaspreet Singh');
        assert.strictEqual(result.mobile, '9877766554');
        assert.strictEqual(result.email, 'jaspreet@cf.com');
        assert.strictEqual(result.listingDetails, 'Homeland Heights Sector 70');
        assert.strictEqual(result.formatMismatch, false);
    });

    await t.test('General Inquiry fallback', () => {
        const subject = 'New enquiry from website contact form';
        const body = `
            Hello, please contact me regarding some properties.
            My phone is 9999888877 and email is hello@corporate.com. Name: Ajay
        `;
        const result = LeadParsingService.parsePortalEmail(subject, body);

        assert.ok(result);
        assert.strictEqual(result.portal, 'General Inquiry');
        assert.strictEqual(result.name, 'Ajay');
        assert.strictEqual(result.mobile, '9999888877');
        assert.strictEqual(result.email, 'hello@corporate.com');
        // Fallback/Generic parser doesn't set formatMismatch flag since it's general text matching
        assert.strictEqual(result.formatMismatch, undefined);
    });
});
