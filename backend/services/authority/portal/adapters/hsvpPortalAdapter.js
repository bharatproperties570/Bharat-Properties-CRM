/**
 * HSVP Portal Form Adapter
 *
 * Prepares compliant search requests for HSVP Plot Status Enquiry.
 * Maps CRM location entities to HSVP Urban Estate codes.
 */

export const HSVP_URBAN_ESTATE_MAP = Object.freeze({
    'faridabad': 'UE001',
    'sonipat': 'UE004',
    'gohana': 'UE005',
    'bahadurgarh': 'UE006',
    'gurgaon': 'UE007',
    'gurugram': 'UE007',
    'rozka meo': 'UE008',
    'dharuhera': 'UE009',
    'rewari': 'UE010',
    'narnaul': 'UE011',
    'hisar': 'UE012',
    'hansi': 'UE013',
    'fatehabad': 'UE014',
    'kaithal': 'UE015',
    'bhiwani': 'UE016',
    'sirsa': 'UE017',
    'rohtak': 'UE018',
    'jind': 'UE019',
    'panchkula': 'UE020',
    'kurukshetra': 'UE021',
    'shahbad': 'UE022',
    'jagadhari': 'UE023',
    'naraingarh': 'UE024',
    'ambala': 'UE025',
    'karnal': 'UE026',
    'panipat': 'UE027',
    'gurgaon ii': 'UE029',
    'ptaudi': 'UE030',
    'jhajjar': 'UE031',
    'safidon': 'UE032',
    'dadri': 'UE033',
    'pinjore': 'UE038',
    'taraori': 'UE039',
    'murthal': 'UE041',
    'pehowa': 'UE042',
    'palwal': 'UE047'
});

export function resolveHsvpUrbanEstateCode(value) {
    if (!value) return '';
    const trimmed = String(value).trim();
    const uePrefixMatch = trimmed.match(/^(UE\d{3})/i);
    if (uePrefixMatch) {
        return uePrefixMatch[1].toUpperCase();
    }
    const normalized = trimmed.toLowerCase();
    return HSVP_URBAN_ESTATE_MAP[normalized] || '';
}

export const hsvpPortalAdapter = Object.freeze({
    authorityCode: 'HSVP',

    /**
     * Builds standard POST request parameters for HSVP.
     * @param {object} criteria
     * @param {object} [options]
     * @returns {object} { method, url, headers, body }
     */
    buildSearchRequest(criteria = {}, options = {}) {
        const ue = resolveHsvpUrbanEstateCode(criteria.urbanEstate);
        const sector = String(criteria.sector || '').trim();
        const plotNo = String(criteria.plotNumber || criteria.plotNo || '').trim();

        if (!ue) {
            throw new Error(`HSVP_MISSING_URBAN_ESTATE: Cannot map "${criteria.urbanEstate}" to a verified HSVP Urban Estate code.`);
        }
        if (!sector) {
            throw new Error('HSVP_MISSING_SECTOR: Sector is required for HSVP property search.');
        }
        if (!plotNo) {
            throw new Error('HSVP_MISSING_PLOT: Plot number is required for HSVP property search.');
        }

        const params = new URLSearchParams();
        params.append('SelectedUrbanEstate', ue);
        params.append('SelectedSector', sector);
        params.append('PlotNo', plotNo);
        params.append('submitAction', options.submitAction || '');
        if (options.targetedPlotId) {
            params.append('targetedPlotId', String(options.targetedPlotId));
        }
        if (options.verificationToken) {
            params.append('__RequestVerificationToken', String(options.verificationToken));
        }

        return Object.freeze({
            method: 'POST',
            url: 'https://hsvphry.org.in/Home/PlotStatusEnquiry',
            headers: Object.freeze({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 (compatible; BharatPropertiesCRM/1.0; AuthorityAuditEngine)'
            }),
            body: params.toString()
        });
    }
});

export default hsvpPortalAdapter;
