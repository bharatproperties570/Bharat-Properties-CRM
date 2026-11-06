/**
 * GMADA Portal Form Adapter
 *
 * Prepares compliant search requests for GMADA Property Ledger Report.
 * Maps CRM location entities to verified GMADA Locations.
 */

export const GMADA_LOCATION_MAP = Object.freeze({
    'mohali': 'S.A.S. Nagar',
    's.a.s. nagar': 'S.A.S. Nagar',
    'sas nagar': 'S.A.S. Nagar',
    'new chandigarh': 'New Chandigarh',
    'mullanpur': 'New Chandigarh',
    'rajpura': 'Rajpura',
    'zirakpur': 'Zirakpur',
    'kiratpur sahib': 'Kiratpur Sahib',
    'sri anandpur sahib': 'Sri Anandpur Sahib'
});

export function resolveGmadaLocation(value) {
    if (!value) return '';
    const trimmed = String(value).trim().toLowerCase();
    return GMADA_LOCATION_MAP[trimmed] || String(value).trim();
}

export const gmadaPortalAdapter = Object.freeze({
    authorityCode: 'GMADA',

    /**
     * Builds standard POST request parameters for GMADA.
     * @param {object} criteria
     * @param {object} [options]
     * @returns {object} { method, url, headers, body }
     */
    buildSearchRequest(criteria = {}, options = {}) {
        const location = resolveGmadaLocation(criteria.location);
        const sector = String(criteria.sectors || criteria.sector || '').trim();
        const searchIdentifier = String(criteria.propertyNo || criteria.formNo || criteria.propertyId || '').trim();

        if (!location) {
            throw new Error(`GMADA_MISSING_LOCATION: Location is required for GMADA property search.`);
        }
        if (!sector) {
            throw new Error('GMADA_MISSING_SECTOR: Sector/Scheme is required for GMADA property search.');
        }
        if (!searchIdentifier) {
            throw new Error('GMADA_MISSING_IDENTIFIER: Property No or Form No is required for GMADA property search.');
        }

        const params = new URLSearchParams();
        params.append('ctl00$Column1_ContentPlaceHolder$ddlLocations', location);
        params.append('ctl00$Column1_ContentPlaceHolder$ddlScheme', sector);
        params.append('ctl00$Column1_ContentPlaceHolder$ddlUsageType', criteria.usageType ? String(criteria.usageType) : '0');
        params.append('ctl00$Column1_ContentPlaceHolder$ddlPropertyType', criteria.propertyType ? String(criteria.propertyType) : '0');
        params.append('ctl00$Column1_ContentPlaceHolder$txtSearch', searchIdentifier);
        params.append('ctl00$Column1_ContentPlaceHolder$hfOrgnization', options.organizationId || '3');
        params.append('ctl00$Column1_ContentPlaceHolder$btnView.x', '10');
        params.append('ctl00$Column1_ContentPlaceHolder$btnView.y', '10');

        // ASP.NET Hidden ViewState Fields
        if (options.viewState) {
            params.append('__VIEWSTATE', String(options.viewState));
        }
        if (options.viewStateGenerator) {
            params.append('__VIEWSTATEGENERATOR', String(options.viewStateGenerator));
        }
        if (options.eventValidation) {
            params.append('__EVENTVALIDATION', String(options.eventValidation));
        }

        return Object.freeze({
            method: 'POST',
            url: 'https://gmadaipms.in/UserExternalPages/Property_Ledger_Report.aspx',
            headers: Object.freeze({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 (compatible; BharatPropertiesCRM/1.0; AuthorityAuditEngine)'
            }),
            body: params.toString()
        });
    }
});

export default gmadaPortalAdapter;
