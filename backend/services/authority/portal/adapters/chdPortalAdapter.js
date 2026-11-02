/**
 * Chandigarh Estate Office Portal Form Adapter
 *
 * Prepares compliant search requests for Chandigarh Administration Know Your Property Search.
 * Supports Mode 1 (Plot No + Sector No) and Mode 2 (File Type + File Number).
 */

export const chdPortalAdapter = Object.freeze({
    authorityCode: 'CHD',

    /**
     * Builds standard POST request parameters for Chandigarh.
     * @param {object} criteria
     * @param {object} [options]
     * @returns {object} { method, url, headers, body }
     */
    buildSearchRequest(criteria = {}, options = {}) {
        const plotNo = String(criteria.plotNo || criteria.propertyId || criteria.propertyNumber || '').trim();
        const sector = String(criteria.sectorNo || criteria.sector || '').trim();
        const fileType = String(criteria.fileType || '').trim();
        const fileNumber = String(criteria.fileNumber || '').trim();

        const params = new URLSearchParams();

        if (plotNo && sector) {
            params.append('PropertyNumber', plotNo);
            params.append('Sector', sector);
        } else if (fileType && fileNumber) {
            params.append('FileType1', fileType);
            params.append('FileNumber1', fileNumber);
        } else {
            throw new Error('CHD_MISSING_SEARCH_MODE: Chandigarh search requires either (Plot No + Sector) OR (File Type + File Number).');
        }

        params.append('btnShow', 'Show');

        if (options.verificationToken) {
            params.append('__RequestVerificationToken', String(options.verificationToken));
        }

        return Object.freeze({
            method: 'POST',
            url: 'https://estateoffice.chd.gov.in/KnowYourProperty/Search',
            headers: Object.freeze({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 (compatible; BharatPropertiesCRM/1.0; AuthorityAuditEngine)'
            }),
            body: params.toString()
        });
    }
});

export default chdPortalAdapter;
