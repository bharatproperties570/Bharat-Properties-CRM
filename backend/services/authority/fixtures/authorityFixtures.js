/**
 * ============================================================================
 *  AUTHORITY VERIFICATION — SANITIZED TEST FIXTURES
 *  Phase 1.2: No real data, no live responses, no PII, no credentials.
 * ============================================================================
 *
 *  Phase 1.2 changes:
 *    - Categorical boolean fixtures: litigation/mortgage exact-phrase only
 *    - Pending/Rejected/Under review → CATEGORICAL_STATUS (not coerced)
 *    - phaseCode added as canonical field
 *    - Cross-authority/estate/sector/phase identity collision tests
 *    - Negative phrasing safety tests for litigation/mortgage
 *
 *  @module authorityFixtures
 *  @version 1.2.0-phase1.2
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  HSVP FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const HSVP_FIXTURES = {

    HAPPY_PATH: {
        description: 'Complete HSVP response with all major fields populated (synthetic data)',
        rawData: {
            'Property No.': '1234',
            'File No.': 'HRY/UE/KKR/2019/5678',
            'Form No.': 'F-9876',
            'Scheme': 'Urban Estate Phase-II',
            'Urban Estate': 'Urban Estate Kurukshetra',
            'Sector': 'Sector 14',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size/Area': '10 Marla (Allotment)',
            'Status': 'Allotted',
            'Possession': 'Offered',
            'Allottee Name': 'REDACTED_NAME',
            'Address': 'REDACTED_ADDRESS',
            'Allotment Price': 'Rs. 12,50,000',
            'Outstanding Dues': 'Rs. 0',
            'Amount Paid': 'Rs. 12,50,000',
            'Date of Allotment': '15/03/2019',
            'Possession Date': '20/08/2020',
            'Transfer Date': '',
            'Litigation': 'No',
            'Mortgage': 'No',
            'Building Plan': 'Approved',
            'OC': 'Not Issued',
        },
    },

    PARTIAL: {
        description: 'HSVP response with several fields missing (NOT_RETURNED expected)',
        rawData: {
            'Property No.': '5678',
            'Scheme': 'Sector Plan',
            'Urban Estate': 'Urban Estate Panchkula',
            'Sector': 'Sector 4',
            'Category': 'Commercial',
            'Type': 'SCO',
            'Size/Area': '200 Sq. Yards',
            'Status': 'Transferred',
        },
        expectedSentinels: [
            'fileNumber', 'formNumber', 'allotteeName', 'allotteeAddress',
            'allotmentPrice', 'currentDues', 'totalPaid',
            'allotmentDate', 'possessionDate', 'lastTransferDate',
            'litigationStatus', 'mortgageStatus', 'buildingPlanApproved', 'occupancyCertificate',
            'possessionStatus',
        ],
    },

    EMPTY_RESULT: {
        description: 'HSVP query that returns no matching property',
        rawData: {},
        expectedAllSentinel: true,
    },

    MASKED: {
        description: 'HSVP response with masked/restricted owner data',
        rawData: {
            'Property No.': '9999',
            'Sector': 'Sector 8',
            'Urban Estate': 'Urban Estate Karnal',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size/Area': '8 Marla',
            'Status': 'Allotted',
            'Allottee Name': '****',
            'Address': '****',
            'Litigation': '****',
        },
        expectedMasked: ['allotteeName', 'allotteeAddress'],
    },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ESTATE OFFICE CHANDIGARH FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ESTATE_OFFICE_CHD_FIXTURES = {

    HAPPY_PATH: {
        description: 'Complete Chandigarh Estate Office response (synthetic data)',
        rawData: {
            'Property No.': 'CHD/2020/R-4567',
            'File No.': 'EO/CHD/RES/2020/1234',
            'Scheme/Colony': 'Sector 22-B Housing',
            'Sector': '22-B',
            'Estate Office': 'Estate Office Sector 17',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size': '500 Sq. Yards',
            'Mode of Allotment': 'Auction',
            'Status': 'Freehold',
            'Possession Status': 'Taken',
            'Allottee': 'REDACTED_NAME',
            'Address': 'REDACTED_ADDRESS',
            'Allotment Price': '₹ 45,00,000',
            'Dues': '₹ 0',
            'Paid Amount': '₹ 45,00,000',
            'Allotment Date': '10-06-2020',
            'Possession Date': '15-09-2020',
            'Last Transfer Date': '01-03-2022',
            'Court Case': 'No',
            'Mortgage': 'Yes',
            'Building Plan': 'Approved',
            'Completion Cert.': 'Issued',
        },
    },

    PARTIAL: {
        description: 'Chandigarh response with minimal fields',
        rawData: {
            'Property No.': 'CHD/COMM/8888',
            'Sector': '35-C',
            'Category': 'Commercial',
            'Type': 'Booth',
            'Size': '15 Sq. Yards',
            'Status': 'Leasehold',
        },
        expectedSentinels: [
            'fileNumber', 'allotteeName', 'allotteeAddress',
            'allotmentPrice', 'currentDues', 'totalPaid',
            'allotmentDate', 'possessionDate', 'lastTransferDate',
            'litigationStatus', 'mortgageStatus', 'buildingPlanApproved', 'occupancyCertificate',
            'possessionStatus', 'allotmentMode', 'estateOffice',
        ],
    },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GMADA FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const GMADA_FIXTURES = {

    HAPPY_PATH: {
        description: 'Complete GMADA response (synthetic data)',
        rawData: {
            'Plot No. / Property No.': 'GMADA/MOH/2021/P-777',
            'File No.': 'GMADA/RES/2021/3456',
            'Scheme / Phase': 'IT City Sector 66A Mohali',
            'Sector / Phase': 'Sector 66A',
            'Category': 'Residential',
            'Type': 'Plot',
            'Size / Area': '300 Sq. Yards (eAuction)',
            'Mode': 'eAuction',
            'Status': 'Allotted',
            'Possession': 'Not Offered',
            'Allottee Name': 'REDACTED_NAME',
            'Address': 'REDACTED_ADDRESS',
            'Allotment Price': '35.5 Lac',
            'Dues': '5 Lac',
            'Total Paid': '30.5 Lac',
            'Allotment Date': '22/11/2021',
            'Possession Date': '',
            'Transfer Date': '',
            'Litigation': 'No',
            'Mortgage': 'No',
            'Building Plan': 'Not Applied',
            'OC / CC': 'Not Issued',
        },
    },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CROSS-SOURCE EDGE CASE FIXTURES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const AREA_VARIATIONS = [
    { raw: '10 Marla',                  expected: { value: 10, unit: 'MARLA', mode: null } },
    { raw: '10 Marla (Allotment)',      expected: { value: 10, unit: 'MARLA', mode: 'Allotment' } },
    { raw: '10 Marla (Auction)',        expected: { value: 10, unit: 'MARLA', mode: 'Auction' } },
    { raw: '10 Marla (eAuction)',       expected: { value: 10, unit: 'MARLA', mode: 'eAuction' } },
    { raw: '500 Sq. Yards',             expected: { value: 500, unit: 'SQ_YARD', mode: null } },
    { raw: '500 Sq Yards (Allotment)',  expected: { value: 500, unit: 'SQ_YARD', mode: 'Allotment' } },
    { raw: '1000 Sq.Ft.',              expected: { value: 1000, unit: 'SQ_FEET', mode: null } },
    { raw: '1 Kanal',                   expected: { value: 1, unit: 'KANAL', mode: null } },
    { raw: '2 Kanal (Rehabilitation)',  expected: { value: 2, unit: 'KANAL', mode: 'Rehabilitation' } },
    { raw: '5 Acre',                    expected: { value: 5, unit: 'ACRE', mode: null } },
    { raw: '200 Sq. Meters',           expected: { value: 200, unit: 'SQ_METER', mode: null } },
    { raw: '3.5 Bigha',                expected: { value: 3.5, unit: 'BIGHA', mode: null } },
    { raw: '1,200 Sq. Yards',          expected: { value: 1200, unit: 'SQ_YARD', mode: null } },
    { raw: '',                          expected: { value: null, unit: null, mode: null } },
    { raw: null,                        expected: { value: null, unit: null, mode: null } },
    { raw: 'Not Available',             expected: { value: null, unit: null, mode: null, error: 'PARSE_ERROR' } },
    { raw: '10',                        expected: { value: 10, unit: null, mode: null } },
    { raw: '10 UnknownUnit',           expected: { value: 10, unit: null, mode: null, error: 'UNKNOWN_UNIT' } },
];

export const DATE_VARIATIONS = [
    { raw: '15/03/2019',     expected: { year: 2019, month: 3, day: 15, sentinel: null } },
    { raw: '10-06-2020',     expected: { year: 2020, month: 6, day: 10, sentinel: null } },
    { raw: '01.12.2018',     expected: { year: 2018, month: 12, day: 1, sentinel: null } },
    { raw: '2021-11-22',     expected: { year: 2021, month: 11, day: 22, sentinel: null } },
    { raw: '12 Jan 2024',    expected: { year: 2024, month: 1, day: 12, sentinel: null } },
    { raw: '',               expected: { sentinel: 'NOT_RETURNED' } },
    { raw: null,             expected: { sentinel: 'NOT_RETURNED' } },
    { raw: '-',              expected: { sentinel: 'NOT_RETURNED' } },
    { raw: 'N/A',            expected: { sentinel: 'NOT_RETURNED' } },
    { raw: 'Not Applicable', expected: { sentinel: 'NOT_RETURNED' } },
    { raw: 'GARBAGE',        expected: { sentinel: 'PARSE_ERROR' } },
    { raw: '99/99/9999',     expected: { sentinel: 'PARSE_ERROR' } },
    { raw: '00/00/0000',     expected: { sentinel: 'PARSE_ERROR' } },
];

/**
 * Phase 1.1: Universal yes/no edge cases only.
 * "Approved", "Rejected", "Issued" are NOT universal booleans —
 * they are categorical responses tested separately per field context.
 */
export const BOOLEAN_EDGE_CASES = [
    { raw: 'Yes',             expected: { value: true, sentinel: null } },
    { raw: 'No',              expected: { value: false, sentinel: null } },
    { raw: 'yes',             expected: { value: true, sentinel: null } },
    { raw: 'no',              expected: { value: false, sentinel: null } },
    { raw: 'y',               expected: { value: true, sentinel: null } },
    { raw: 'n',               expected: { value: false, sentinel: null } },
    { raw: true,              expected: { value: true, sentinel: null } },
    { raw: false,             expected: { value: false, sentinel: null } },
    { raw: null,              expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: undefined,         expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: '',                expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: 'N/A',             expected: { value: null, sentinel: 'NOT_APPLICABLE' } },
    { raw: 'Not Applicable',  expected: { value: null, sentinel: 'NOT_APPLICABLE' } },
    { raw: '-',               expected: { value: null, sentinel: 'NOT_APPLICABLE' } },
    { raw: '****',            expected: { value: null, sentinel: 'RESTRICTED' } },
    { raw: 'restricted',      expected: { value: null, sentinel: 'RESTRICTED' } },
];

/**
 * Phase 1.1: Categorical boolean words that must NOT resolve to true/false
 * without field context.
 */
export const CATEGORICAL_WORDS_NOT_UNIVERSAL_BOOLEAN = [
    { raw: 'Approved',        expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Approved is not universal yes' },
    { raw: 'Not Approved',    expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Not Approved is not universal no' },
    { raw: 'Issued',          expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Issued is field-specific' },
    { raw: 'Not Issued',      expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Not Issued is field-specific' },
    { raw: 'Rejected',        expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Rejected is a categorical status' },
    { raw: 'Not Applied',     expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Not Applied is field-specific' },
    { raw: 'Granted',         expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Granted is field-specific' },
    { raw: 'Allotted',        expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Allotted is a property status' },
    { raw: 'Transferred',     expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Transferred is a property status' },
    { raw: 'Freehold',        expected: { value: null, sentinel: 'PARSE_ERROR' }, note: 'Freehold is a tenure type' },
];

/**
 * Phase 1.2: Field-specific categorical boolean resolutions.
 *
 * CRITICAL Phase 1.2 changes:
 *   - Pending → CATEGORICAL_STATUS (NOT false)
 *   - Rejected → CATEGORICAL_STATUS (NOT false)
 *   - Under review → CATEGORICAL_STATUS
 *   - Litigation/mortgage: exact negative phrases only, no substring inference
 *   - Descriptive text → CATEGORICAL_STATUS observation (never true/false)
 */
export const CATEGORICAL_BOOLEAN_BY_FIELD = [
    // ── buildingPlanApproved ────────────────────────────────────────────
    { raw: 'Approved',     field: 'buildingPlanApproved', expected: { value: true, sentinel: null } },
    { raw: 'Not Approved', field: 'buildingPlanApproved', expected: { value: false, sentinel: null } },
    { raw: 'Not Applied',  field: 'buildingPlanApproved', expected: { value: false, sentinel: null } },
    { raw: 'Sanctioned',   field: 'buildingPlanApproved', expected: { value: true, sentinel: null } },
    { raw: 'Not Sanctioned', field: 'buildingPlanApproved', expected: { value: false, sentinel: null } },
    { raw: 'Pending',      field: 'buildingPlanApproved', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Pending is indeterminate, NOT false' },
    { raw: 'Rejected',     field: 'buildingPlanApproved', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Rejected is a status, NOT a boolean false' },
    { raw: 'Under review', field: 'buildingPlanApproved', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Under review is indeterminate' },
    { raw: 'Granted',      field: 'buildingPlanApproved', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Granted for building plan is ambiguous — is it approved or granted for review?' },
    { raw: 'Yes',          field: 'buildingPlanApproved', expected: { value: true, sentinel: null } },
    { raw: 'No',           field: 'buildingPlanApproved', expected: { value: false, sentinel: null } },

    // ── occupancyCertificate ────────────────────────────────────────────
    { raw: 'Issued',       field: 'occupancyCertificate', expected: { value: true, sentinel: null } },
    { raw: 'Not Issued',   field: 'occupancyCertificate', expected: { value: false, sentinel: null } },
    { raw: 'Granted',      field: 'occupancyCertificate', expected: { value: true, sentinel: null } },
    { raw: 'Received',     field: 'occupancyCertificate', expected: { value: true, sentinel: null } },
    { raw: 'Not Applied',  field: 'occupancyCertificate', expected: { value: false, sentinel: null } },
    { raw: 'Pending',      field: 'occupancyCertificate', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Pending is indeterminate, NOT false' },
    { raw: 'Under review', field: 'occupancyCertificate', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Under review is indeterminate' },
    { raw: 'Yes',          field: 'occupancyCertificate', expected: { value: true, sentinel: null } },
    { raw: 'No',           field: 'occupancyCertificate', expected: { value: false, sentinel: null } },

    // ── litigationStatus ────────────────────────────────────────────────
    // Phase 1.2: NO substring inference. Exact phrases only.
    { raw: 'No',                          field: 'litigationStatus', expected: { value: false, sentinel: null } },
    { raw: 'Yes',                         field: 'litigationStatus', expected: { value: true, sentinel: null } },
    { raw: 'No court case',               field: 'litigationStatus', expected: { value: false, sentinel: null }, note: 'Explicit negative phrase' },
    { raw: 'No pending court case',       field: 'litigationStatus', expected: { value: false, sentinel: null }, note: 'Explicit negative phrase' },
    { raw: 'Court case pending',          field: 'litigationStatus', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Descriptive — observation only, not a legal conclusion' },
    { raw: 'Matter disposed',             field: 'litigationStatus', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Disposed case is not a clear current-litigation boolean' },
    { raw: 'Litigation pending in High Court', field: 'litigationStatus', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Descriptive text — observation, NOT coerced to true' },
    { raw: 'No litigation',               field: 'litigationStatus', expected: { value: false, sentinel: null }, note: 'Explicit negative' },
    { raw: 'Not under litigation',        field: 'litigationStatus', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Not in exact-match list — unresolved' },

    // ── mortgageStatus ──────────────────────────────────────────────────
    // Phase 1.2: NO substring inference. Exact phrases only.
    { raw: 'No',                          field: 'mortgageStatus', expected: { value: false, sentinel: null } },
    { raw: 'Yes',                         field: 'mortgageStatus', expected: { value: true, sentinel: null } },
    { raw: 'Not under mortgage',          field: 'mortgageStatus', expected: { value: false, sentinel: null }, note: 'Explicit negative phrase' },
    { raw: 'No mortgage',                 field: 'mortgageStatus', expected: { value: false, sentinel: null }, note: 'Explicit negative phrase' },
    { raw: 'Mortgage cleared',            field: 'mortgageStatus', expected: { value: false, sentinel: null }, note: 'Cleared mortgage = no current mortgage' },
    { raw: 'Under mortgage with SBI',     field: 'mortgageStatus', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Descriptive — observation only' },
    { raw: 'Loan not applicable',         field: 'mortgageStatus', expected: { value: null, sentinel: 'CATEGORICAL_STATUS' }, note: 'Contains "loan" but negated — do NOT infer true from substring' },

    // ── Missing / N-A / Restricted pass through ─────────────────────────
    { raw: null,           field: 'buildingPlanApproved', expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: '****',         field: 'litigationStatus',     expected: { value: null, sentinel: 'RESTRICTED' } },
    { raw: '',             field: 'mortgageStatus',        expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: 'N/A',          field: 'occupancyCertificate',  expected: { value: null, sentinel: 'NOT_APPLICABLE' } },
];

export const CURRENCY_VARIATIONS = [
    { raw: 'Rs. 12,50,000',   expected: { value: 1250000, sentinel: null } },
    { raw: '₹ 45,00,000',     expected: { value: 4500000, sentinel: null } },
    { raw: '35.5 Lac',         expected: { value: 3550000, sentinel: null } },
    { raw: '1.5 Cr',           expected: { value: 15000000, sentinel: null } },
    { raw: '1.5 Crore',        expected: { value: 15000000, sentinel: null } },
    { raw: '5 Lakh',           expected: { value: 500000, sentinel: null } },
    { raw: 'INR 1000000',      expected: { value: 1000000, sentinel: null } },
    { raw: '0',                expected: { value: 0, sentinel: null } },
    { raw: 'Rs. 0',            expected: { value: 0, sentinel: null } },
    { raw: '',                 expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: null,               expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: 'N/A',              expected: { value: null, sentinel: 'NOT_RETURNED' } },
    { raw: 'Not Disclosed',    expected: { value: null, sentinel: 'PARSE_ERROR' } },
    { raw: 'FREE',             expected: { value: null, sentinel: 'PARSE_ERROR' } },
];

export const DUPLICATE_PROPERTY_IDS = {
    description: 'Same property number "1234" across estates/sectors/authorities — must not collide',
    records: [
        { authority: 'HSVP', sector: 'Sector 14', propertyId: '1234', urbanEstate: 'Kurukshetra', phase: null },
        { authority: 'HSVP', sector: 'Sector 14', propertyId: '1234', urbanEstate: 'Panchkula', phase: null },
        { authority: 'HSVP', sector: 'Sector 8',  propertyId: '1234', urbanEstate: 'Kurukshetra', phase: null },
        { authority: 'ESTATE_OFFICE_CHD', sector: '14', propertyId: '1234', urbanEstate: null, phase: null },
        { authority: 'GMADA', sector: '66A', propertyId: '1234', urbanEstate: null, phase: null },
    ],
    expectedUniqueKeys: 5,
};

/**
 * Phase 1.2: Cross-authority/sector/phase collision tests.
 * Same property number across different phases must produce different keys.
 */
export const PHASE_COLLISION_CASES = {
    description: 'Same propertyId in different phases within same authority+sector must not collide',
    records: [
        { authority: 'GMADA', sector: '66A', propertyId: '1234', urbanEstate: null, phase: 'Phase-I' },
        { authority: 'GMADA', sector: '66A', propertyId: '1234', urbanEstate: null, phase: 'Phase-II' },
        { authority: 'GMADA', sector: '66A', propertyId: '1234', urbanEstate: null, phase: null },
    ],
    expectedUniqueKeys: 3,
    note: 'Phase participates in key when present, producing distinct keys',
};

/**
 * Phase 1.2: AMBIGUOUS composite key cases — updated with phaseCode.
 */
export const AMBIGUOUS_KEY_CASES = [
    {
        description: 'HSVP without urbanEstate should be AMBIGUOUS',
        input: { authority: 'HSVP', sector: 'Sector 14', propertyId: '1234', urbanEstate: null, phase: null },
        expectedError: 'AMBIGUOUS',
    },
    {
        description: 'HSVP with all required components should produce an exact key',
        input: { authority: 'HSVP', sector: 'Sector 14', propertyId: '1234', urbanEstate: 'Kurukshetra', phase: null },
        expectedError: null,
    },
    {
        description: 'CHD without sector should be AMBIGUOUS',
        input: { authority: 'ESTATE_OFFICE_CHD', sector: '', propertyId: '1234', urbanEstate: null, phase: null },
        expectedError: 'AMBIGUOUS',
    },
    {
        description: 'GMADA with all required components should produce an exact key',
        input: { authority: 'GMADA', sector: '66A', propertyId: '1234', urbanEstate: null, phase: null },
        expectedError: null,
    },
    {
        description: 'Missing authority is always INCOMPLETE',
        input: { authority: '', sector: '14', propertyId: '1234', urbanEstate: null, phase: null },
        expectedError: 'INCOMPLETE_KEY',
    },
    {
        description: 'Missing propertyId is always INCOMPLETE',
        input: { authority: 'HSVP', sector: '14', propertyId: '', urbanEstate: 'Kurukshetra', phase: null },
        expectedError: 'INCOMPLETE_KEY',
    },
    {
        description: 'HSVP with phase but no urbanEstate is still AMBIGUOUS (urbanEstate required)',
        input: { authority: 'HSVP', sector: 'Sector 14', propertyId: '1234', urbanEstate: null, phase: 'Phase-II' },
        expectedError: 'AMBIGUOUS',
    },
];

/**
 * Phase 1.1: Sector normalization ONLY strips "Sector"/"Sec" prefix.
 */
export const SECTOR_NORMALIZATION = [
    { raw: 'Sector 14',   expected: '14' },
    { raw: 'Sector-14A',  expected: '14A' },
    { raw: 'Sec 14',      expected: '14' },
    { raw: 'Sec-22B',     expected: '22B' },
    { raw: '14',           expected: '14' },
    { raw: '22-B',         expected: '22-B' },
    { raw: '',             expected: null },
    { raw: null,           expected: null },
];

/**
 * Phase 1.1: Phase normalization is separate from sector.
 */
export const PHASE_NORMALIZATION = [
    { raw: 'Phase XI',    expected: 'XI' },
    { raw: 'Phase-3',     expected: '3' },
    { raw: 'Phase 2',     expected: '2' },
    { raw: 'Ph 4',        expected: '4' },
    { raw: 'Ph-V',        expected: 'V' },
    { raw: '',             expected: null },
    { raw: null,           expected: null },
];

/**
 * Phase 1.1: Location classification tests.
 */
export const LOCATION_CLASSIFICATION = [
    { raw: 'Sector 14',  expectedType: 'sector', expectedNormalized: '14' },
    { raw: 'Sec-22B',    expectedType: 'sector', expectedNormalized: '22B' },
    { raw: 'Phase XI',   expectedType: 'phase',  expectedNormalized: 'XI' },
    { raw: 'Phase-3',    expectedType: 'phase',  expectedNormalized: '3' },
    { raw: '14',          expectedType: 'bare',   expectedNormalized: '14' },
    { raw: '22-B',        expectedType: 'bare',   expectedNormalized: '22-B' },
    { raw: '',            expectedType: 'bare',   expectedNormalized: null },
];

/**
 * Phase 1.1: "Phase XI" must NOT normalize to the same value as "Sector XI".
 */
export const SECTOR_PHASE_COLLISION_PREVENTION = [
    {
        description: '"Sector XI" and "Phase XI" must not be treated as the same location',
        sector: 'Sector XI',
        phase: 'Phase XI',
        note: 'They are classified as different location types and must not be conflated in composite keys.',
    },
];

export const PROPERTY_ID_NORMALIZATION = [
    { raw: 'Plot No. 1234',       expected: '1234' },
    { raw: 'Property No. 5678',   expected: '5678' },
    { raw: 'SCO No. 45',          expected: '45' },
    { raw: 'Booth No. 12',        expected: '12' },
    { raw: '1234',                 expected: '1234' },
    { raw: 'CHD/2020/R-4567',     expected: 'CHD/2020/R-4567' },
    { raw: 'GMADA/MOH/2021/P-777', expected: 'GMADA/MOH/2021/P-777' },
    { raw: '  1234  ',             expected: '1234' },
    { raw: '',                     expected: null },
    { raw: null,                   expected: null },
];

/**
 * Phase 1.2 NEW: Litigation/mortgage negative-phrasing safety tests.
 * These specifically test that phrases containing keywords like "court",
 * "mortgage", "loan" but with a NEGATIVE meaning do NOT become true.
 */
export const LITIGATION_MORTGAGE_SAFETY = [
    // Litigation
    { raw: 'No pending court case',       field: 'litigationStatus', expectedValue: false,  expectedSentinel: null, note: 'Exact negative phrase → false' },
    { raw: 'No court case',               field: 'litigationStatus', expectedValue: false,  expectedSentinel: null, note: 'Exact negative phrase → false' },
    { raw: 'No litigation',               field: 'litigationStatus', expectedValue: false,  expectedSentinel: null, note: 'Exact negative phrase → false' },
    { raw: 'Court case pending',          field: 'litigationStatus', expectedValue: null,   expectedSentinel: 'CATEGORICAL_STATUS', note: 'Descriptive — observation only' },
    { raw: 'Matter disposed',             field: 'litigationStatus', expectedValue: null,   expectedSentinel: 'CATEGORICAL_STATUS', note: 'Disposed is not clear boolean' },
    { raw: 'Litigation pending in High Court', field: 'litigationStatus', expectedValue: null, expectedSentinel: 'CATEGORICAL_STATUS', note: 'Descriptive — NOT true' },
    // Mortgage
    { raw: 'Not under mortgage',          field: 'mortgageStatus', expectedValue: false,    expectedSentinel: null, note: 'Exact negative phrase → false' },
    { raw: 'No mortgage',                 field: 'mortgageStatus', expectedValue: false,    expectedSentinel: null, note: 'Exact negative phrase → false' },
    { raw: 'Mortgage cleared',            field: 'mortgageStatus', expectedValue: false,    expectedSentinel: null, note: 'Cleared = no current mortgage' },
    { raw: 'Under mortgage with SBI',     field: 'mortgageStatus', expectedValue: null,     expectedSentinel: 'CATEGORICAL_STATUS', note: 'Descriptive — NOT true via substring' },
    { raw: 'Loan not applicable',         field: 'mortgageStatus', expectedValue: null,     expectedSentinel: 'CATEGORICAL_STATUS', note: '"loan" present but negated — NOT true' },
];

export default {
    HSVP_FIXTURES,
    ESTATE_OFFICE_CHD_FIXTURES,
    GMADA_FIXTURES,
    AREA_VARIATIONS,
    DATE_VARIATIONS,
    BOOLEAN_EDGE_CASES,
    CATEGORICAL_WORDS_NOT_UNIVERSAL_BOOLEAN,
    CATEGORICAL_BOOLEAN_BY_FIELD,
    CURRENCY_VARIATIONS,
    DUPLICATE_PROPERTY_IDS,
    PHASE_COLLISION_CASES,
    AMBIGUOUS_KEY_CASES,
    SECTOR_NORMALIZATION,
    PHASE_NORMALIZATION,
    LOCATION_CLASSIFICATION,
    SECTOR_PHASE_COLLISION_PREVENTION,
    PROPERTY_ID_NORMALIZATION,
    LITIGATION_MORTGAGE_SAFETY,
};
