/**
 * Authority Portal Definitions — Phase 4.4.4 starter contract.
 *
 * These are search-form contracts, not DOM selectors. Real browser selectors,
 * dropdown values and result labels must be captured from redacted live samples
 * before enabling any portal connector.
 */

export const AUTHORITY_PORTAL_DEFINITIONS = Object.freeze({
    HSVP: Object.freeze({
        authorityCode: 'HSVP',
        sourceDictionaryKey: 'HSVP',
        name: 'Haryana Shehri Vikas Pradhikaran',
        searchUrl: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
        formContract: Object.freeze({
            strategy: 'URBAN_ESTATE_SECTOR_PLOT',
            fields: Object.freeze([
                { portalField: 'Urban Estate', key: 'urbanEstate', crmSources: ['authorityLink.urbanEstate', 'inventory.city', 'inventory.address.city'], controlKind: 'select' },
                { portalField: 'Sector', key: 'sector', crmSources: ['authorityLink.sectorNumber', 'inventory.sector'], controlKind: 'select' },
                { portalField: 'Plot Number', key: 'plotNumber', crmSources: ['authorityLink.propertyId', 'inventory.unitNo', 'inventory.unitNumber'], controlKind: 'input' }
            ]),
            requiredKeys: Object.freeze(['urbanEstate', 'sector', 'plotNumber'])
        }),
        access: Object.freeze({
            publicSearchFormObserved: true,
            loginObservedInInitialInspection: false,
            captchaObservedInInitialInspection: false,
            termsReviewStatus: 'NOT_REVIEWED',
            automationEnabled: false
        })
    }),

    GMADA: Object.freeze({
        authorityCode: 'GMADA',
        sourceDictionaryKey: 'GMADA',
        name: 'Greater Mohali Area Development Authority',
        // Exact URL supplied by the user. Initial web inspection of this exact
        // page returned 502; do not silently switch to a different route.
        searchUrl: 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report_2.aspx',
        formContract: Object.freeze({
            strategy: 'LOCATION_SECTORS_USAGE_PROPERTY_TYPE_IDENTIFIER',
            fields: Object.freeze([
                { portalField: 'Location', key: 'location', crmSources: ['inventory.city', 'inventory.address.city', 'inventory.projectNameCitySuffix'], controlKind: 'select' },
                { portalField: 'Sectors', key: 'sectors', crmSources: ['authorityLink.sectorNumber', 'inventory.sector'], controlKind: 'select' },
                { portalField: 'Usage Type', key: 'usageType', crmSources: ['inventory.category'], controlKind: 'select' },
                { portalField: 'Property Type', key: 'propertyType', crmSources: ['inventory.subCategory'], controlKind: 'select' },
                { portalField: 'Property No', key: 'propertyNo', crmSources: ['authorityLink.propertyId', 'inventory.unitNo', 'inventory.unitNumber'], controlKind: 'input' },
                { portalField: 'Form No', key: 'formNo', crmSources: ['authorityLink.formNumber', 'inventory.formNumber'], controlKind: 'input' }
            ]),
            requiredKeys: Object.freeze(['location', 'sectors']),
            oneOfRequired: Object.freeze([Object.freeze(['propertyNo', 'formNo'])])
        }),
        access: Object.freeze({
            publicSearchFormObserved: true,
            exactUserSuppliedPageReachableDuringInitialInspection: false,
            loginObservedInInitialInspection: false,
            captchaObservedInInitialInspection: false,
            termsReviewStatus: 'NOT_REVIEWED',
            automationEnabled: false
        })
    }),

    CHD: Object.freeze({
        authorityCode: 'CHD',
        sourceDictionaryKey: 'ESTATE_OFFICE_CHD',
        name: 'Estate Office, Chandigarh Administration',
        searchUrl: 'https://estateoffice.chd.gov.in/KnowYourProperty/Search',
        formContract: Object.freeze({
            strategy: 'PLOT_SECTOR_OR_FILE_TYPE_FILE_NUMBER',
            fields: Object.freeze([
                { portalField: 'Plot No', key: 'plotNo', crmSources: ['authorityLink.propertyId', 'inventory.unitNo', 'inventory.unitNumber'], controlKind: 'input' },
                { portalField: 'Sector No', key: 'sectorNo', crmSources: ['authorityLink.sectorNumber', 'inventory.sector'], controlKind: 'input' },
                { portalField: 'File Type', key: 'fileType', crmSources: ['explicitSearchOverride.fileType'], controlKind: 'select' },
                { portalField: 'File Number', key: 'fileNumber', crmSources: ['authorityLink.fileNumber', 'inventory.fileNumber'], controlKind: 'input' }
            ]),
            oneOfRequired: Object.freeze([
                Object.freeze(['plotNo', 'sectorNo']),
                Object.freeze(['fileType', 'fileNumber'])
            ])
        }),
        disclaimer: 'The portal describes the online property information as provisional; office records take precedence.',
        access: Object.freeze({
            publicSearchFormObserved: true,
            loginObservedInInitialInspection: false,
            captchaObservedInInitialInspection: false,
            termsReviewStatus: 'NOT_REVIEWED',
            automationEnabled: false
        })
    })
});

export const AUTHORITY_PORTAL_CODES = Object.freeze(Object.keys(AUTHORITY_PORTAL_DEFINITIONS));

export function getAuthorityPortalDefinition(authorityCode) {
    const code = String(authorityCode || '').trim().toUpperCase();
    const definition = AUTHORITY_PORTAL_DEFINITIONS[code];
    if (!definition) {
        const error = new Error(`UNKNOWN_AUTHORITY_PORTAL: ${authorityCode || '(empty)'}`);
        error.code = 'UNKNOWN_AUTHORITY_PORTAL';
        throw error;
    }
    return definition;
}
