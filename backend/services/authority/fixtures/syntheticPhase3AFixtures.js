/**
 * ============================================================================
 *  BHARAT PROPERTIES CRM — SYNTHETIC PHASE 3A ADAPTER FIXTURES
 * ============================================================================
 * 
 *  CRITICAL GOVERNANCE & PRIVACY RULES:
 *  1. ALL data in this file is 100% SYNTHETIC, PROPOSED, and UNVERIFIED.
 *  2. NO real portal response samples, live HTML, or scraping outputs exist here.
 *  3. NO real owner / allottee PII (names, phone numbers, addresses, Aadhaar, PAN)
 *     is included. Any name or address fields are explicit synthetic placeholders.
 *  4. No field mapping is upgraded to 'VERIFIED' without genuine redacted portal samples.
 *  5. Used exclusively for isolated adapter contract testing (Phase 3A).
 * 
 *  @module syntheticPhase3AFixtures
 *  @version 3.0.0-phase3a
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. HSVP SYNTHETIC FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const HSVP_SYNTHETIC = Object.freeze({

    VALID_STRUCTURED: Object.freeze({
        description: 'Synthetic complete HSVP record with valid residential plot data',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '101',
            'File No.': 'HRY/UE/PKL/2018/101',
            'Form No.': 'F-10101',
            'Scheme': 'Urban Estate Phase-I',
            'Urban Estate': 'Urban Estate Panchkula',
            'Sector': 'Sector 14',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size/Area': '10 Marla (Allotment)',
            'Status': 'Allotted',
            'Possession': 'Offered',
            'Allottee Name': 'SYNTHETIC_ALLOTTEE_ALPHA',
            'Address': 'SYNTHETIC_ADDRESS_ALPHA',
            'Allotment Price': 'Rs. 15,00,000',
            'Outstanding Dues': 'Rs. 0',
            'Amount Paid': 'Rs. 15,00,000',
            'Date of Allotment': '12/05/2018',
            'Possession Date': '15/06/2019',
            'Transfer Date': '',
            'Litigation': 'No',
            'Mortgage': 'No',
            'Building Plan': 'Approved',
            'OC': 'Not Issued'
        }
    }),

    MISSING_PROPERTY_ID: Object.freeze({
        description: 'Synthetic HSVP record missing property identifier',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '',
            'Urban Estate': 'Urban Estate Panchkula',
            'Sector': 'Sector 14',
            'Category': 'Residential',
            'Type': 'Plot',
            'Status': 'Allotted'
        }
    }),

    MISSING_URBAN_ESTATE_AMBIGUOUS: Object.freeze({
        description: 'Synthetic HSVP record with property and sector but missing urban estate (triggers AMBIGUOUS composite key)',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '505',
            'Sector': 'Sector 14',
            'Urban Estate': '',
            'Category': 'Commercial',
            'Type': 'Booth',
            'Status': 'Allotted'
        }
    }),

    CONTRADICTORY_DATES: Object.freeze({
        description: 'Synthetic HSVP record with possession date occurring prior to allotment date',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '202',
            'Sector': 'Sector 4',
            'Urban Estate': 'Urban Estate Panchkula',
            'Category': 'Residential',
            'Date of Allotment': '20/05/2020',
            'Possession Date': '10/01/2015', // Contradictory: possession before allotment
            'Outstanding Dues': 'Rs. 0'
        }
    }),

    MALFORMED_TYPES: Object.freeze({
        description: 'Synthetic HSVP record with malformed types (objects/arrays where primitives expected)',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': { complexObj: true },
            'Sector': ['Sector', '14'],
            'Urban Estate': 'Urban Estate Gurugram',
            'Outstanding Dues': { amount: 15000 },
            'Date of Allotment': [2021, 5, 12],
            'Building Plan': 12345
        }
    }),

    UNKNOWN_CATEGORICAL_STATUS: Object.freeze({
        description: 'Synthetic HSVP record with unmapped administrative status',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '303',
            'Sector': 'Sector 12',
            'Urban Estate': 'Urban Estate Karnal',
            'Status': 'Pending Chief Administrator Scrutiny',
            'Litigation': 'No'
        }
    }),

    EXPLICIT_NEGATIVE_ENCUMBRANCE: Object.freeze({
        description: 'Synthetic HSVP record with explicit negative phrasing for litigation and mortgage',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '404',
            'Sector': 'Sector 7',
            'Urban Estate': 'Urban Estate Ambala',
            'Litigation': 'No pending court case',
            'Mortgage': 'Not under mortgage'
        }
    }),

    CATEGORICAL_LITIGATION_OBSERVATION: Object.freeze({
        description: 'Synthetic HSVP record with nuanced litigation observation string',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '505',
            'Sector': 'Sector 15',
            'Urban Estate': 'Urban Estate Faridabad',
            'Litigation': 'CWP 4567/2022 pending before High Court of Punjab & Haryana',
            'Mortgage': 'Nil'
        }
    }),

    CATEGORICAL_MORTGAGE_OBSERVATION: Object.freeze({
        description: 'Synthetic HSVP record with nuanced mortgage observation string',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '606',
            'Sector': 'Sector 21',
            'Urban Estate': 'Urban Estate Gurugram',
            'Litigation': 'Nil',
            'Mortgage': 'Under mortgage with State Bank of India Sector 14 Panchkula'
        }
    }),

    SENTINEL_INPUTS: Object.freeze({
        description: 'Synthetic HSVP record with masked/restricted inputs triggering sentinels',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '707',
            'Sector': 'Sector 9',
            'Urban Estate': 'Urban Estate Hisar',
            'Litigation': '****',
            'Mortgage': 'RESTRICTED_ACCESS',
            'Building Plan': 'Pending Review',
            'OC': 'Under Process'
        }
    }),

    UNRECOGNIZED_CATEGORY_AND_UNIT: Object.freeze({
        description: 'Synthetic HSVP record with unrecognized area unit and non-standard category',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '808',
            'Sector': 'Sector 9999',
            'Urban Estate': 'Urban Estate Rohtak',
            'Category': 'Agricultural Aerodrome Hangar',
            'Size/Area': '150 Bigha 4 Biswa',
            'Status': 'Allotted'
        }
    }),

    SECURITY_INJECTION_ATTEMPT: Object.freeze({
        description: 'Synthetic HSVP record containing script injections, NoSQL operators, and credential keys',
        authorityCode: 'HSVP',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': '<script>alert("xss")</script>101',
            'Sector': 'Sector 14',
            'Urban Estate': 'Urban Estate Panchkula',
            'apiKey': 'super_secret_portal_token_12345',
            'password': 'admin_password_should_be_stripped',
            'url': 'https://malicious-scraping-proxy.example.com',
            'allotteeName': 'Real Person Name Attempt',
            'aadhaar': '9999-8888-7777',
            'pan': 'ABCDE1234F',
            'Litigation': 'No'
        }
    })
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. CHANDIGARH ESTATE OFFICE (CHD) SYNTHETIC FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CHD_SYNTHETIC = Object.freeze({

    VALID_FREEHOLD_STRUCTURED: Object.freeze({
        description: 'Synthetic complete Chandigarh Estate Office record with freehold tenure',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/2021/R-202',
            'File No.': 'EO/CHD/RES/2021/5678',
            'Scheme/Colony': 'Sector 22-B Scheme',
            'Sector': '22-B',
            'Estate Office': 'Estate Office Sector 17',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size': '500 Sq. Yards',
            'Mode of Allotment': 'Auction Freehold',
            'Status': 'Freehold',
            'Possession Status': 'Taken',
            'Allottee': 'SYNTHETIC_ALLOTTEE_BETA',
            'Address': 'SYNTHETIC_ADDRESS_BETA',
            'Allotment Price': '₹ 50,00,000',
            'Dues': '₹ 0',
            'Paid Amount': '₹ 50,00,000',
            'Allotment Date': '15-08-2021',
            'Possession Date': '20-11-2021',
            'Last Transfer Date': '10-02-2023',
            'Court Case': 'No',
            'Mortgage': 'No',
            'Building Plan': 'Approved',
            'Completion Cert.': 'Issued'
        }
    }),

    VALID_LEASEHOLD_WITH_GROUND_RENT: Object.freeze({
        description: 'Synthetic complete Chandigarh record with leasehold tenure and ground rent',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/COMM/909',
            'File No.': 'EO/CHD/COMM/2015/909',
            'Scheme/Colony': 'City Centre Commercial Complex',
            'Sector': '17-C',
            'Estate Office': 'Estate Office Sector 17',
            'Category': 'Commercial',
            'Type': 'SCO',
            'Size': '250 Sq. Yards',
            'Mode of Allotment': '99 Years Leasehold',
            'Status': 'Leasehold',
            'Possession Status': 'Taken',
            'Allotment Price': '₹ 1,20,00,000',
            'Dues': '₹ 45,000',
            'Paid Amount': '₹ 1,19,55,000',
            'Court Case': 'No',
            'Mortgage': 'No'
        }
    }),

    CONTRADICTORY_TENURE_DUES: Object.freeze({
        description: 'Synthetic Chandigarh record with contradictory tenure statements',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/RES/303',
            'Sector': '35-C',
            'Status': 'Freehold',
            'Mode of Allotment': '99 Years Leasehold Allotment',
            'Dues': '₹ 10,000'
        }
    }),

    MISSING_SECTOR_AMBIGUOUS: Object.freeze({
        description: 'Synthetic Chandigarh record missing sector identifier',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/UNKNOWN/111',
            'Sector': '',
            'Estate Office': 'Estate Office Sector 17',
            'Status': 'Allotted'
        }
    }),

    EXPLICIT_NEGATIVE_COURT_CASE: Object.freeze({
        description: 'Synthetic Chandigarh record with explicit negative phrasing for court cases',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/2022/R-404',
            'Sector': '19-A',
            'Court Case': 'No pending court case',
            'Mortgage': 'Mortgage cleared'
        }
    }),

    CATEGORICAL_COURT_CASE_OBSERVATION: Object.freeze({
        description: 'Synthetic Chandigarh record with specific litigation court case details',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/2020/C-505',
            'Sector': '8-C',
            'Court Case': 'Civil Suit No. 89/2021 pending before Court of Civil Judge Senior Division Chandigarh',
            'Mortgage': 'No'
        }
    }),

    CATEGORICAL_MORTGAGE_OBSERVATION: Object.freeze({
        description: 'Synthetic Chandigarh record with bank lien details',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/2019/R-606',
            'Sector': '33-B',
            'Court Case': 'No',
            'Mortgage': 'Equitable mortgage registered with Punjab National Bank Sector 17'
        }
    }),

    SECURITY_PAYLOAD_TEST: Object.freeze({
        description: 'Synthetic Chandigarh record with malicious script fragments and injected credential keys',
        authorityCode: 'CHD',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Property No.': 'CHD/2020/R-707<iframe src="evil.com"></iframe>',
            'Sector': '22-B',
            'authToken': 'bearer_token_xyz_should_be_stripped',
            'endpoint': 'http://internal-portal.local/leak',
            'allottee': 'Confidential Allottee Data',
            'Address': 'Private Residential Address'
        }
    })
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. GMADA SYNTHETIC FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GMADA_SYNTHETIC = Object.freeze({

    VALID_IT_CITY_SECTOR_66A: Object.freeze({
        description: 'Synthetic complete GMADA record in IT City Sector 66A',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': 'GMADA/MOH/2021/P-303',
            'File No.': 'GMADA/RES/2021/9876',
            'Scheme / Phase': 'IT City Sector 66A Mohali',
            'Sector / Phase': 'Sector 66A',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size / Area': '300 Sq. Yards (eAuction)',
            'Mode': 'eAuction',
            'Status': 'Allotted',
            'Possession': 'Offered',
            'Allottee Name': 'SYNTHETIC_ALLOTTEE_GAMMA',
            'Address': 'SYNTHETIC_ADDRESS_GAMMA',
            'Allotment Price': '40 Lac',
            'Dues': '0',
            'Total Paid': '40 Lac',
            'Allotment Date': '14/09/2021',
            'Possession Date': '18/12/2022',
            'Transfer Date': '',
            'Litigation': 'No',
            'Mortgage': 'No',
            'Building Plan': 'Approved',
            'OC / CC': 'Issued'
        }
    }),

    VALID_AEROCITY_PHASE: Object.freeze({
        description: 'Synthetic GMADA record with explicit Phase designation in Aerocity',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': 'GMADA/AERO/2020/G-404',
            'File No.': 'GMADA/RES/2020/404',
            'Scheme / Phase': 'Aerocity Block-G Phase 2',
            'Sector / Phase': 'Phase 2',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size / Area': '200 Sq. Yards',
            'Mode': 'Allotment',
            'Status': 'Allotted',
            'Litigation': 'No',
            'Mortgage': 'No'
        }
    }),

    AMBIGUOUS_SECTOR_PHASE: Object.freeze({
        description: 'Synthetic GMADA record where Sector / Phase field conflates Sector and Phase',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': 'GMADA/MOH/505',
            'Sector / Phase': 'Phase 9 / Sector 63', // Ambiguous multi-part string
            'Scheme / Phase': 'Urban Complex',
            'Status': 'Allotted'
        }
    }),

    CONTRADICTORY_POSSESSION: Object.freeze({
        description: 'Synthetic GMADA record with contradictory possession and cancellation status',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': 'GMADA/MOH/606',
            'Sector / Phase': 'Sector 82',
            'Status': 'Cancelled',
            'Possession': 'Possession Taken on 15/01/2021',
            'Dues': '15 Lac'
        }
    }),

    CATEGORICAL_ENCUMBRANCE_OBSERVATION: Object.freeze({
        description: 'Synthetic GMADA record with litigation stay order observation',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': 'GMADA/MOH/707',
            'Sector / Phase': 'Sector 70',
            'Litigation': 'Stay order granted by Supreme Court in Special Leave Petition 5678/2023',
            'Mortgage': 'Lien marked by Punjab State Cooperative Bank Mohali'
        }
    }),

    MISSING_IDENTITY_PARTIAL: Object.freeze({
        description: 'Synthetic GMADA record missing plot number entirely',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': '',
            'File No.': 'GMADA/UNLINKED/808',
            'Sector / Phase': 'Sector 68',
            'Status': 'Allotted'
        }
    }),

    SECURITY_INJECTION_ATTEMPT: Object.freeze({
        description: 'Synthetic GMADA record with injected malicious scripts and credentials',
        authorityCode: 'GMADA',
        isSynthetic: true,
        sourceEvidenceStatus: 'UNVERIFIED',
        rawData: {
            'Plot No. / Property No.': 'GMADA/999<script>evil()</script>',
            'Sector / Phase': 'Sector 66A',
            'scrapeProxy': 'http://10.0.0.1:8080',
            'secretKey': 'gmada_api_key_secret',
            'Allottee Name': 'Confidential Citizen Name',
            'Address': 'Private Address Sector 66A'
        }
    })
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. CROSS-AUTHORITY AGGREGATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ALL_SYNTHETIC_FIXTURES = Object.freeze({
    HSVP: HSVP_SYNTHETIC,
    CHD: CHD_SYNTHETIC,
    GMADA: GMADA_SYNTHETIC
});

export default ALL_SYNTHETIC_FIXTURES;
