/**
 * Authority Portal Golden Parsers & Adapters Test Suite
 * Phase 4.4.4 Acceptance
 *
 * Exercises deterministic HTML parsing for HSVP, GMADA, and Chandigarh portals
 * across success, no-records, challenge, login, server error, and parser drift states.
 * Proves that PII is never extracted and canonical fields match dictionary expectations.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { hsvpPortalParser, HSVP_PARSER_VERSION } from '../services/authority/portal/parsers/hsvpPortalParser.js';
import { gmadaPortalParser, GMADA_PARSER_VERSION } from '../services/authority/portal/parsers/gmadaPortalParser.js';
import { chdPortalParser, CHD_PARSER_VERSION } from '../services/authority/portal/parsers/chdPortalParser.js';
import { getPortalParser, PORTAL_PARSERS } from '../services/authority/portal/parsers/portalParserRegistry.js';

import { hsvpPortalAdapter, resolveHsvpUrbanEstateCode } from '../services/authority/portal/adapters/hsvpPortalAdapter.js';
import { gmadaPortalAdapter, resolveGmadaLocation } from '../services/authority/portal/adapters/gmadaPortalAdapter.js';
import { chdPortalAdapter } from '../services/authority/portal/adapters/chdPortalAdapter.js';
import { getPortalAdapter } from '../services/authority/portal/adapters/portalAdapterRegistry.js';

import { FORBIDDEN_AUTHORITY_PERSONAL_FIELD } from '../services/authority/portal/authorityPortalResultSanitizer.js';

// ============================================================================
// 1. HSVP GOLDEN PARSER TESTS
// ============================================================================
test('1. HSVP Golden Parser', async (t) => {
    await t.test('1.1 parses valid details panel and extracts canonical fields while stripping PII', async () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <body>
                <form id="enquiryForm" action="/Home/PlotStatusEnquiry" method="post"></form>
                <div id="detailsPanel">
                    <h3>Plot Status Details</h3>
                    <table class="table table-bordered">
                        <tr><th>Plot No</th><td>1234</td></tr>
                        <tr><th>Sector</th><td>Sector 14</td></tr>
                        <tr><th>Urban Estate</th><td>UE001-Faridabad</td></tr>
                        <tr><th>Category</th><td>Residential</td></tr>
                        <tr><th>Sub Category</th><td>14 Marla</td></tr>
                        <tr><th>Area</th><td>350 Sq.Yds</td></tr>
                        <tr><th>Plot Status</th><td>Allotted</td></tr>
                        <tr><th>Allotment Date</th><td>15/08/2012</td></tr>
                        <tr><th>Allotment Price</th><td>2500000</td></tr>
                        <tr><th>Total Amount Paid</th><td>2500000</td></tr>
                        <tr><th>Current Dues</th><td>0</td></tr>
                        <tr><th>Physical Possession Date</th><td>20/12/2014</td></tr>
                        <tr><th>Litigation Status</th><td>Clear / No Case</td></tr>
                        <tr><th>Building Plan Approved</th><td>Yes (2016)</td></tr>
                        <tr><th>Occupancy Certificate</th><td>Issued (2018)</td></tr>
                        <!-- Sensitive personal PII that must NEVER be extracted -->
                        <tr><th>Allottee Name</th><td>Shri Ramesh Kumar</td></tr>
                        <tr><th>Father Name</th><td>Shri Satish Kumar</td></tr>
                        <tr><th>Correspondence Address</th><td>H No 55, Sector 15, Faridabad</td></tr>
                        <tr><th>Mobile Number</th><td>9876543210</td></tr>
                    </table>
                </div>
            </body>
            </html>
        `;

        const records = await hsvpPortalParser.parse(html, {
            authorityCode: 'HSVP',
            criteria: { urbanEstate: 'Faridabad', sector: '14', plotNumber: '1234' }
        });

        assert.equal(records.length, 1);
        const record = records[0];

        assert.equal(record.propertyId, '1234');
        assert.equal(record.sectorNumber, 'Sector 14');
        assert.equal(record.urbanEstate, 'UE001-Faridabad');
        assert.equal(record.propertyCategory, 'Residential');
        assert.equal(record.propertyType, '14 Marla');
        assert.equal(record.area, '350 Sq.Yds');
        assert.equal(record.authorityStatus, 'Allotted');
        assert.equal(record.allotmentPrice, '2500000');
        assert.equal(record.totalPaid, '2500000');
        assert.equal(record.currentDues, '0');
        assert.equal(record.possessionDate, '20/12/2014');
        assert.equal(record.litigationStatus, 'Clear / No Case');
        assert.equal(record.buildingPlanApproved, 'Yes (2016)');
        assert.equal(record.occupancyCertificate, 'Issued (2018)');

        // Crucial: No personal fields
        for (const key of Object.keys(record)) {
            assert.equal(FORBIDDEN_AUTHORITY_PERSONAL_FIELD.test(key), false, `Field ${key} violates PII ban`);
        }
        assert.equal(record.allotteeName, undefined);
        assert.equal(record.mobileNumber, undefined);
        assert.equal(record.correspondenceAddress, undefined);
    });

    await t.test('1.2 returns empty array when no plots are found', async () => {
        const html = `
            <html><body>
                <form id="enquiryForm" action="/Home/PlotStatusEnquiry">
                    <div class="alert alert-warning">No records found matching the requested plot criteria.</div>
                </form>
            </body></html>
        `;
        const records = await hsvpPortalParser.parse(html);
        assert.deepEqual(records, []);
    });

    await t.test('1.3 parses multiple results from a search result table', async () => {
        const html = `
            <html><body>
                <form id="enquiryForm" action="/Home/PlotStatusEnquiry"></form>
                <table class="table">
                    <thead>
                        <tr><th>Plot No</th><th>Sector</th><th>Urban Estate</th><th>Category</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>101-P</td><td>14</td><td>Panchkula</td><td>Commercial</td><td>Allotted</td></tr>
                        <tr><td>102-P</td><td>14</td><td>Panchkula</td><td>Commercial</td><td>Available</td></tr>
                    </tbody>
                </table>
            </body></html>
        `;
        const records = await hsvpPortalParser.parse(html);
        assert.equal(records.length, 2);
        assert.equal(records[0].propertyId, '101-P');
        assert.equal(records[0].authorityStatus, 'Allotted');
        assert.equal(records[1].propertyId, '102-P');
        assert.equal(records[1].authorityStatus, 'Available');
    });

    await t.test('1.4 detects server error and throws PORTAL_SERVER_ERROR', async () => {
        const html = '<html><body><h1>Server Error in \'/\' Application. An error occurred while processing your request.</h1></body></html>';
        await assert.rejects(hsvpPortalParser.parse(html), { code: 'PORTAL_SERVER_ERROR' });
    });

    await t.test('1.5 detects captcha challenge and throws PORTAL_CHALLENGE_DETECTED', async () => {
        const html = '<html><body><h3>Please verify you are human to proceed with search</h3><div class="captcha-box"></div></body></html>';
        await assert.rejects(hsvpPortalParser.parse(html), { code: 'PORTAL_CHALLENGE_DETECTED' });
    });

    await t.test('1.6 detects login wall / session expiry and throws PORTAL_LOGIN_DETECTED', async () => {
        const html = '<html><body><h3>Your session expired. Please sign in to continue.</h3></body></html>';
        await assert.rejects(hsvpPortalParser.parse(html), { code: 'PORTAL_LOGIN_DETECTED' });
    });

    await t.test('1.7 detects unrecognizable HTML and throws PARSER_DRIFT', async () => {
        const html = '<html><body><div>Welcome to a completely rewritten non-portal page with zero matching structure</div></body></html>';
        await assert.rejects(hsvpPortalParser.parse(html), { code: 'PARSER_DRIFT' });
    });
});

// ============================================================================
// 2. GMADA GOLDEN PARSER TESTS
// ============================================================================
test('2. GMADA Golden Parser', async (t) => {
    await t.test('2.1 parses GMADA GridView and extracts canonical fields while stripping PII', async () => {
        const html = `
            <!DOCTYPE html>
            <html><body>
                <form name="aspnetForm" method="post" action="./Property_Ledger_Report_2.aspx" id="aspnetForm">
                    <table id="ctl00_Column1_ContentPlaceHolder_gvProperty" class="report-table">
                        <tr>
                            <th>Location</th>
                            <th>Sector</th>
                            <th>Property No</th>
                            <th>Form No</th>
                            <th>Usage Type</th>
                            <th>Property Type</th>
                            <th>Area</th>
                            <th>Status</th>
                            <th>Allotment Price</th>
                            <th>Amount Paid</th>
                            <th>Outstanding Balance</th>
                            <th>Allottee Name</th>
                        </tr>
                        <tr>
                            <td>S.A.S. Nagar</td>
                            <td>Sector 70</td>
                            <td>PLOT-456</td>
                            <td>GMADA/2015/789</td>
                            <td>Residential</td>
                            <td>Independent Plot</td>
                            <td>250 Sq.Yds</td>
                            <td>Freehold</td>
                            <td>4500000</td>
                            <td>4500000</td>
                            <td>0</td>
                            <td>Confidential Allottee Name</td>
                        </tr>
                    </table>
                </form>
            </body></html>
        `;

        const records = await gmadaPortalParser.parse(html);
        assert.equal(records.length, 1);
        const record = records[0];

        assert.equal(record.urbanEstate, 'S.A.S. Nagar');
        assert.equal(record.sectorNumber, 'Sector 70');
        assert.equal(record.propertyId, 'PLOT-456');
        assert.equal(record.formNumber, 'GMADA/2015/789');
        assert.equal(record.propertyCategory, 'Residential');
        assert.equal(record.propertyType, 'Independent Plot');
        assert.equal(record.area, '250 Sq.Yds');
        assert.equal(record.authorityStatus, 'Freehold');
        assert.equal(record.allotmentPrice, '4500000');
        assert.equal(record.totalPaid, '4500000');
        assert.equal(record.currentDues, '0');

        assert.equal(record.allotteeName, undefined);
    });

    await t.test('2.2 returns empty array on no records found', async () => {
        const html = `
            <html><body>
                <form name="aspnetForm" id="aspnetForm">
                    <span id="lblMessage">No records found for the selected criteria.</span>
                </form>
            </body></html>
        `;
        const records = await gmadaPortalParser.parse(html);
        assert.deepEqual(records, []);
    });

    await t.test('2.3 detects 502 Bad Gateway and throws PORTAL_SERVER_ERROR', async () => {
        const html = '<html><body><h1>502 Bad Gateway</h1><p>The upstream server failed to respond.</p></body></html>';
        await assert.rejects(gmadaPortalParser.parse(html), { code: 'PORTAL_SERVER_ERROR' });
    });

    await t.test('2.4 detects unrecognizable markup and throws PARSER_DRIFT', async () => {
        const html = '<html><body><div>Drifted structure without aspnetForm or table</div></body></html>';
        await assert.rejects(gmadaPortalParser.parse(html), { code: 'PARSER_DRIFT' });
    });
});

// ============================================================================
// 3. CHANDIGARH (CHD) GOLDEN PARSER TESTS
// ============================================================================
test('3. Chandigarh Golden Parser', async (t) => {
    await t.test('3.1 parses Mode 1 (Plot + Sector) results and strips PII', async () => {
        const html = `
            <!DOCTYPE html>
            <html><body>
                <form action="/KnowYourProperty/Search" id="frmSearchProperty" method="post">
                    <div id="dvResult">
                        <table>
                            <tr><th>Property No</th><td>550</td></tr>
                            <tr><th>Sector No</th><td>Sector 18-C</td></tr>
                            <tr><th>Category</th><td>Residential</td></tr>
                            <tr><th>Site Area</th><td>1 Kanal</td></tr>
                            <tr><th>Ownership Status</th><td>Freehold</td></tr>
                            <tr><th>Building Plan Approved</th><td>Sanctioned</td></tr>
                            <tr><th>Occupancy Certificate</th><td>Granted</td></tr>
                            <tr><th>Litigation Status</th><td>Nil</td></tr>
                            <tr><th>Owner Name</th><td>DO NOT RECORD PII</td></tr>
                        </table>
                    </div>
                </form>
            </body></html>
        `;

        const records = await chdPortalParser.parse(html);
        assert.equal(records.length, 1);
        const record = records[0];

        assert.equal(record.propertyId, '550');
        assert.equal(record.sectorNumber, 'Sector 18-C');
        assert.equal(record.propertyCategory, 'Residential');
        assert.equal(record.area, '1 Kanal');
        assert.equal(record.authorityStatus, 'Freehold');
        assert.equal(record.buildingPlanApproved, 'Sanctioned');
        assert.equal(record.occupancyCertificate, 'Granted');
        assert.equal(record.litigationStatus, 'Nil');
        assert.equal(record.ownerName, undefined);
    });

    await t.test('3.2 parses Mode 2 (File Type + File Number) results', async () => {
        const html = `
            <html><body>
                <form id="frmSearchProperty">
                    <div id="dvResult">
                        <table>
                            <tr><th>File Number</th><td>CP-9876</td></tr>
                            <tr><th>Property No</th><td>Booth 12</td></tr>
                            <tr><th>Sector</th><td>Sector 22</td></tr>
                            <tr><th>Property Type</th><td>Commercial Booth</td></tr>
                            <tr><th>Ownership Status</th><td>Leasehold</td></tr>
                        </table>
                    </div>
                </form>
            </body></html>
        `;

        const records = await chdPortalParser.parse(html);
        assert.equal(records.length, 1);
        assert.equal(records[0].fileNumber, 'CP-9876');
        assert.equal(records[0].propertyId, 'Booth 12');
        assert.equal(records[0].sectorNumber, 'Sector 22');
        assert.equal(records[0].propertyType, 'Commercial Booth');
    });

    await t.test('3.3 returns empty array when no records exist', async () => {
        const html = `
            <html><body>
                <form id="frmSearchProperty">
                    <div class="alert">No record found matching the criteria.</div>
                </form>
            </body></html>
        `;
        const records = await chdPortalParser.parse(html);
        assert.deepEqual(records, []);
    });

    await t.test('3.4 detects parser drift and throws PARSER_DRIFT', async () => {
        const html = '<html><body><div>Completely drifted content</div></body></html>';
        await assert.rejects(chdPortalParser.parse(html), { code: 'PARSER_DRIFT' });
    });
});

// ============================================================================
// 4. FORM ADAPTERS & REQUEST BUILDING TESTS
// ============================================================================
test('4. Form Adapters & Request Building', async (t) => {
    await t.test('4.1 HSVP adapter resolves UE code and builds POST request', () => {
        assert.equal(resolveHsvpUrbanEstateCode('Gurgaon'), 'UE007');
        assert.equal(resolveHsvpUrbanEstateCode('UE020'), 'UE020');
        assert.equal(resolveHsvpUrbanEstateCode('Faridabad'), 'UE001');

        const req = hsvpPortalAdapter.buildSearchRequest({
            urbanEstate: 'Gurgaon',
            sector: '29',
            plotNumber: '500'
        }, { verificationToken: 'test-csrf-token' });

        assert.equal(req.method, 'POST');
        assert.equal(req.url, 'https://hsvphry.org.in/Home/PlotStatusEnquiry');
        assert.ok(req.body.includes('SelectedUrbanEstate=UE007'));
        assert.ok(req.body.includes('SelectedSector=29'));
        assert.ok(req.body.includes('PlotNo=500'));
        assert.ok(req.body.includes('__RequestVerificationToken=test-csrf-token'));
    });

    await t.test('4.2 GMADA adapter resolves location and builds POST request', () => {
        assert.equal(resolveGmadaLocation('Mohali'), 'S.A.S. Nagar');
        assert.equal(resolveGmadaLocation('New Chandigarh'), 'New Chandigarh');

        const req = gmadaPortalAdapter.buildSearchRequest({
            location: 'Mohali',
            sectors: 'Sector 82',
            propertyNo: 'PLOT-99'
        }, { viewState: 'viewstate123' });

        assert.equal(req.method, 'POST');
        assert.equal(req.url, 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report_2.aspx');
        assert.ok(req.body.includes('ddlLocations=S.A.S.+Nagar') || req.body.includes('ddlLocations=S.A.S.%20Nagar'));
        assert.ok(req.body.includes('ddlScheme=Sector+82') || req.body.includes('ddlScheme=Sector%2082'));
        assert.ok(req.body.includes('txtSearch=PLOT-99'));
        assert.ok(req.body.includes('__VIEWSTATE=viewstate123'));
    });

    await t.test('4.3 CHD adapter builds Mode 1 and Mode 2 requests', () => {
        const reqMode1 = chdPortalAdapter.buildSearchRequest({
            plotNo: '100',
            sectorNo: 'Sector 17'
        });
        assert.ok(reqMode1.body.includes('PropertyNumber=100'));
        assert.ok(reqMode1.body.includes('Sector=Sector+17') || reqMode1.body.includes('Sector=Sector%2017'));

        const reqMode2 = chdPortalAdapter.buildSearchRequest({
            fileType: 'CP',
            fileNumber: '5432'
        });
        assert.ok(reqMode2.body.includes('FileType1=CP'));
        assert.ok(reqMode2.body.includes('FileNumber1=5432'));
    });

    await t.test('4.4 registry retrieves adapters and parsers cleanly', () => {
        assert.equal(getPortalAdapter('HSVP').authorityCode, 'HSVP');
        assert.equal(getPortalAdapter('GMADA').authorityCode, 'GMADA');
        assert.equal(getPortalAdapter('CHD').authorityCode, 'CHD');

        assert.equal(getPortalParser('HSVP').authorityCode, 'HSVP');
        assert.equal(getPortalParser('GMADA').authorityCode, 'GMADA');
        assert.equal(getPortalParser('CHD').authorityCode, 'CHD');
    });
});
