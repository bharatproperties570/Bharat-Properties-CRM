import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AUTHORITY_REGISTRY
} from '../services/authority/authorityFieldDictionary.js';
import {
    SOURCE_POLICY_MATRIX,
    PERMISSION_STATUS,
    ACCESS_METHOD
} from '../services/authority/sourcePolicy.js';
import {
    getAuthorityPortalDefinition
} from '../services/authority/portal/authorityPortalDefinitions.js';
import {
    hsvpPortalAdapter,
    resolveHsvpUrbanEstateCode,
    HSVP_URBAN_ESTATE_MAP
} from '../services/authority/portal/adapters/hsvpPortalAdapter.js';
import {
    hsvpPortalParser
} from '../services/authority/portal/parsers/hsvpPortalParser.js';
import {
    gmadaPortalAdapter
} from '../services/authority/portal/adapters/gmadaPortalAdapter.js';
import {
    gmadaPortalParser
} from '../services/authority/portal/parsers/gmadaPortalParser.js';
import {
    chdPortalAdapter
} from '../services/authority/portal/adapters/chdPortalAdapter.js';
import {
    chdPortalParser
} from '../services/authority/portal/parsers/chdPortalParser.js';
import AuthoritySourceSettings, {
    checkActivationEligibility
} from '../models/AuthoritySourceSettings.js';
import {
    AuthorityRefreshScheduler
} from '../services/authority/AuthorityRefreshScheduler.js';

test('Phase 4.5 — Suite 1: Live Portal URL Contracts & Domain Integrity', () => {
    // 1. HSVP URL and registration
    const hsvpDef = getAuthorityPortalDefinition('HSVP');
    assert.equal(hsvpDef.searchUrl, 'https://hsvphry.org.in/Home/PlotStatusEnquiry');
    assert.equal(SOURCE_POLICY_MATRIX.HSVP.portalUrl, 'https://hsvphry.org.in');
    assert.equal(AUTHORITY_REGISTRY.HSVP.portalDomain, 'hsvphry.org.in');

    // 2. GMADA URL corrected (stale _2 removed, live domain gmadaipms.in)
    const gmadaDef = getAuthorityPortalDefinition('GMADA');
    assert.equal(gmadaDef.searchUrl, 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report.aspx');
    assert.ok(!gmadaDef.searchUrl.includes('_2.aspx'), 'Stale _2 route must be purged');
    assert.equal(SOURCE_POLICY_MATRIX.GMADA.portalUrl, 'https://gmadaipms.in');
    assert.equal(AUTHORITY_REGISTRY.GMADA.portalDomain, 'gmadaipms.in');

    // 3. Estate Office Chandigarh URL corrected (estateoffice.chd.gov.in)
    const chdDef = getAuthorityPortalDefinition('CHD');
    assert.equal(chdDef.searchUrl, 'https://estateoffice.chd.gov.in/KnowYourProperty/Search');
    assert.equal(SOURCE_POLICY_MATRIX.ESTATE_OFFICE_CHD.portalUrl, 'https://estateoffice.chd.gov.in');
    assert.equal(AUTHORITY_REGISTRY.ESTATE_OFFICE_CHD.portalDomain, 'estateoffice.chd.gov.in');
});

test('Phase 4.5 — Suite 2: HSVP Urban Estate Mapping & Form Adapter', () => {
    // Kurukshetra verified as UE021
    assert.equal(resolveHsvpUrbanEstateCode('Kurukshetra'), 'UE021');
    assert.equal(resolveHsvpUrbanEstateCode('kurukshetra'), 'UE021');
    assert.equal(HSVP_URBAN_ESTATE_MAP['kurukshetra'], 'UE021');

    // Live Urban Estates verified
    const requiredEstates = [
        ['kurukshetra', 'UE021'],
        ['panchkula', 'UE020'],
        ['gurugram', 'UE007'],
        ['faridabad', 'UE001'],
        ['panipat', 'UE027'],
        ['sonipat', 'UE004'],
        ['rohtak', 'UE018'],
        ['karnal', 'UE026'],
        ['hisar', 'UE012'],
        ['ambala', 'UE025'],
        ['ratia', 'UE034'],
        ['adampur', 'UE035'],
        ['nuh', 'UE036'],
        ['mahendergarh', 'UE037'],
        ['rgec', 'UE040'],
        ['taoru', 'UE044'],
        ['gharaunda', 'UE045'],
        ['faridabad ii', 'UE046'],
        ['hathin', 'UE048']
    ];

    for (const [name, code] of requiredEstates) {
        assert.equal(HSVP_URBAN_ESTATE_MAP[name], code, `Expected estate ${name} to map to ${code}`);
    }

    // Request builder sets submitAction='Search' and proper fields
    const req = hsvpPortalAdapter.buildSearchRequest({
        urbanEstate: 'Kurukshetra',
        sector: '7',
        plotNumber: '101'
    }, { verificationToken: 'hsvp_token_xyz' });

    assert.equal(req.method, 'POST');
    assert.equal(req.url, 'https://hsvphry.org.in/Home/PlotStatusEnquiry');
    assert.ok(req.body.includes('SelectedUrbanEstate=UE021'));
    assert.ok(req.body.includes('SelectedSector=7') || req.body.includes('SelectedSector=0007'));
    assert.ok(req.body.includes('PlotNo=101'));
    assert.ok(req.body.includes('submitAction=Search'));
    assert.ok(req.body.includes('__RequestVerificationToken=hsvp_token_xyz'));
});

test('Phase 4.5 — Suite 3: HSVP Live Table Parsing & Strict PII Stripping', async () => {
    // Live table HTML snippet with all 7 columns including Allottee Name and Mobile Number
    const liveHtml = `
        <form action="/Home/PlotStatusEnquiry"></form>
        <table class="table table-bordered table-striped">
            <thead>
                <tr>
                    <th>Sr. No.</th>
                    <th>Urban Estate Name</th>
                    <th>Sector No.</th>
                    <th>Property No.</th>
                    <th>Property Category</th>
                    <th>Property Sub Category</th>
                    <th>Allottee Name</th>
                    <th>Mobile Number</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>KURUKSHETRA</td>
                    <td>7</td>
                    <td>101</td>
                    <td>Residential</td>
                    <td>10 Marla</td>
                    <td>MOHAN LAL GUPTA</td>
                    <td>9876543210</td>
                </tr>
            </tbody>
        </table>
    `;

    const records = await hsvpPortalParser.parse(liveHtml);
    assert.equal(records.length, 1);

    const record = records[0];
    // Verified mapped fields
    assert.equal(record.propertyId, '101');
    assert.equal(record.urbanEstate, 'KURUKSHETRA');
    assert.equal(record.sectorNumber, '7');
    assert.equal(record.propertyCategory, 'Residential');
    assert.equal(record.propertyType, '10 Marla');

    // Strict PII checks: Allottee Name and Mobile Number must NOT be exposed
    assert.equal(record.allotteeName, undefined, 'Allottee Name must be stripped');
    assert.equal(record.mobileNumber, undefined, 'Mobile Number must be stripped');
    assert.equal(record.allottee, undefined);
    assert.equal(record.phone, undefined);
    assert.equal(record.mobile, undefined);

    // Full JSON representation must contain 0 occurrences of the citizen's personal info
    const serialized = JSON.stringify(record);
    assert.ok(!serialized.includes('MOHAN LAL GUPTA'), 'PII leaked into serialized record');
    assert.ok(!serialized.includes('9876543210'), 'Phone leaked into serialized record');
});

test('Phase 4.5 — Suite 4: GMADA Adapter & Live NO_MATCH Error Detection', async () => {
    // 1. Request builder sets hfOrgnization='3' and default '0' for usageType/propertyType
    const req = gmadaPortalAdapter.buildSearchRequest({
        location: 'S.A.S. Nagar',
        sector: 'Sector 82',
        propertyNo: 'PLOT-99'
    }, { viewState: 'vs_val', viewStateGenerator: 'gen_val', eventValidation: 'ev_val' });

    assert.equal(req.method, 'POST');
    assert.equal(req.url, 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report.aspx');
    assert.ok(req.body.includes('ctl00%24Column1_ContentPlaceHolder%24hfOrgnization=3'));
    assert.ok(req.body.includes('ctl00%24Column1_ContentPlaceHolder%24ddlUsageType=0'));
    assert.ok(req.body.includes('ctl00%24Column1_ContentPlaceHolder%24ddlPropertyType=0'));
    assert.ok(req.body.includes('ctl00%24Column1_ContentPlaceHolder%24btnView.x=10'));

    // 2. Parser handles live GMADA error response without throwing
    const noMatchHtml = `
        <!DOCTYPE html>
        <html>
        <body>
            <span id="ctl00_Column1_ContentPlaceHolder_lblMsg" class="error">
                No Match found. Please enter Valid Details to open Property Ledger
            </span>
        </body>
        </html>
    `;

    const recordsNoMatch = await gmadaPortalParser.parse(noMatchHtml);
    assert.equal(recordsNoMatch.length, 0);

    // 3. Parser handles valid table
    const tableHtml = `
        <table id="ctl00_Column1_ContentPlaceHolder_gvLedger">
            <tr>
                <th>Plot No</th>
                <th>Location</th>
                <th>Scheme</th>
                <th>Property Type</th>
                <th>Status</th>
            </tr>
            <tr>
                <td>PLOT-99</td>
                <td>S.A.S. Nagar</td>
                <td>Sector 82</td>
                <td>Commercial</td>
                <td>Allotted</td>
            </tr>
        </table>
    `;
    const recordsValid = await gmadaPortalParser.parse(tableHtml);
    assert.equal(recordsValid.length, 1);
    assert.equal(recordsValid[0].propertyId, 'PLOT-99');
    assert.equal(recordsValid[0].schemeName, 'Sector 82');
    assert.equal(recordsValid[0].propertyType, 'Commercial');
});

test('Phase 4.5 — Suite 5: Chandigarh Estate Office Adapter & Live HTML Parsing', async () => {
    // 1. Mode 1 request builder
    const reqMode1 = chdPortalAdapter.buildSearchRequest({
        plotNo: 'SCO-10',
        sector: 'Sector 17'
    }, { verificationToken: 'chd_token_abc' });

    assert.equal(reqMode1.method, 'POST');
    assert.equal(reqMode1.url, 'https://estateoffice.chd.gov.in/KnowYourProperty/Search');
    assert.ok(reqMode1.body.includes('Sector=Sector+17') || reqMode1.body.includes('Sector=Sector%2017'));
    assert.ok(reqMode1.body.includes('PropertyNumber=SCO-10'));
    assert.ok(reqMode1.body.includes('btnShow=Show'));
    assert.ok(reqMode1.body.includes('__RequestVerificationToken=chd_token_abc'));

    // 2. Mode 2 request builder
    const reqMode2 = chdPortalAdapter.buildSearchRequest({
        fileType: 'Commercial',
        fileNumber: 'F-12345'
    }, { verificationToken: 'chd_token_abc' });

    assert.equal(reqMode2.method, 'POST');
    assert.ok(reqMode2.body.includes('FileType1=Commercial'));
    assert.ok(reqMode2.body.includes('FileNumber1=F-12345'));

    // 3. Parser handles live Mode 1 search results table cleanly
    const chdHtml = `
        <form id="frmSearchProperty" action="/KnowYourProperty/Search" method="post"></form>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Sr No</th>
                    <th>File Number</th>
                    <th>Sector</th>
                    <th>Property Number</th>
                    <th>Sub Category</th>
                    <th>Property Category</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td>COMM/17/001</td>
                    <td>Sector 17</td>
                    <td>SCO-10</td>
                    <td>Shop-cum-Office</td>
                    <td>Commercial</td>
                </tr>
            </tbody>
        </table>
    `;

    const recordsChd = await chdPortalParser.parse(chdHtml);
    assert.equal(recordsChd.length, 1);
    assert.equal(recordsChd[0].propertyId, 'SCO-10');
    assert.equal(recordsChd[0].sectorNumber, 'Sector 17');
    assert.equal(recordsChd[0].propertyCategory, 'Commercial');

    // 4. Parser handles No Record Found cleanly
    const noRecordHtml = '<div>No Record Found</div>';
    const recordsNoRecord = await chdPortalParser.parse(noRecordHtml);
    assert.equal(recordsNoRecord.length, 0);
});

test('Phase 4.5 — Suite 6: Owner Permission Reconfirmation & Evidence Isolation', () => {
    // Verify userReportedEvidence across all three sources in SOURCE_POLICY_MATRIX
    for (const code of ['HSVP', 'GMADA', 'ESTATE_OFFICE_CHD']) {
        const policy = SOURCE_POLICY_MATRIX[code];
        assert.ok(policy.userReportedEvidence, `userReportedEvidence missing for ${code}`);
        assert.equal(policy.userReportedEvidence.reportedBy, 'Bharat Properties Owner');
        assert.equal(policy.userReportedEvidence.reportedAt, '2026-11-06');
        assert.equal(policy.userReportedEvidence.status, 'PENDING_WRITTEN_REFERENCE');
        assert.ok(policy.userReportedEvidence.notes.includes('6 November 2026'));

        // Permission status strictly remains NOT_OBTAINED without written authority letter
        assert.equal(policy.permissionStatus, PERMISSION_STATUS.NOT_OBTAINED);
        assert.equal(policy.approvedAccessMethod, ACCESS_METHOD.NONE);
    }
});

test('Phase 4.5 — Suite 7: Fail-Closed Activation Gate & Safety Boundary', () => {
    // A settings document reflecting the current unapproved state
    const mockSettings = {
        permissionStatus: 'NOT_OBTAINED',
        reviewStatus: 'NOT_REVIEWED',
        termsReviewed: false,
        rateLimits: null,
        circuitBreaker: { failures: 0, state: 'CLOSED' },
        userReportedEvidence: {
            reportedBy: 'Bharat Properties Owner',
            reportedAt: new Date('2026-11-06'),
            verificationStatus: 'PENDING_WRITTEN_REFERENCE'
        }
    };

    const eligibility = checkActivationEligibility(mockSettings);
    assert.equal(eligibility.eligible, false);
    assert.equal(eligibility.canActivate, false);
    assert.ok(eligibility.blockers.some(b => b.code === 'PERMISSION_NOT_GRANTED'));
    assert.ok(eligibility.blockers.some(b => b.code === 'REVIEW_NOT_APPROVED'));
    assert.ok(eligibility.blockers.some(b => b.code === 'TERMS_NOT_REVIEWED'));
});

test('Phase 4.5 — Suite 8: Scheduler Circuit Breaker & Paused Source Isolation', async () => {
    // Mock AuthoritySourceSettings.find
    const origFind = AuthoritySourceSettings.find;
    try {
        AuthoritySourceSettings.find = () => {
            return [
                {
                    tenantId: 'tenant-1',
                    authorityCode: 'HSVP',
                    isEnabled: true,
                    isPaused: true, // paused by circuit breaker
                    schedulingEnabled: true,
                    checkActivationEligibility: () => ({ canActivate: true, blockers: [] }),
                    isEffectivelyActive: () => false
                },
                {
                    tenantId: 'tenant-1',
                    authorityCode: 'GMADA',
                    isEnabled: false,
                    isPaused: false,
                    schedulingEnabled: false,
                    checkActivationEligibility: () => ({ canActivate: false, blockers: ['Permission status is NOT_OBTAINED'] }),
                    isEffectivelyActive: () => false
                }
            ];
        };

        const scheduler = new AuthorityRefreshScheduler();
        const cycleReport = await scheduler.executeWeeklyCycle({
            authorityCode: null,
            isSimulation: false
        });

        assert.ok(cycleReport.results.length >= 2);
        const hsvpResult = cycleReport.results.find(r => r.authorityCode === 'HSVP');
        const gmadaResult = cycleReport.results.find(r => r.authorityCode === 'GMADA');

        assert.equal(hsvpResult.status, 'SKIPPED_SOURCE_PAUSED');
        assert.equal(gmadaResult.status, 'SKIPPED_SCHEDULING_DISABLED');
    } finally {
        AuthoritySourceSettings.find = origFind;
    }
});
