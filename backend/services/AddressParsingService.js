import UnifiedAIService from './UnifiedAIService.js';

class AddressParsingService {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Determines if a string field contains a full unstructured address rather than a simple field.
     * @param {string} val 
     * @returns {boolean}
     */
    shouldParse(val) {
        if (!val || typeof val !== 'string') return false;
        const trimmed = val.trim();
        if (trimmed.length < 10) return false;
        // Count spaces: a full address has at least 2 spaces (i.e. 3 or more words)
        const spaceCount = (trimmed.match(/\s/g) || []).length;
        if (spaceCount < 2) return false;
        // Check for common address indicators (pincode, house, sector, phase, city names, etc.)
        const hasIndicators = /sector|sec|phase|ph|house|flat|plot|h\.?no|near|opposite|opp|landmark|road|gali|lane|kurukshetra|gurgaon|gurugram|delhi|ghaziabad|street|ward/i.test(trimmed);
        return hasIndicators || spaceCount >= 3;
    }


    /**
     * Parse a single raw address string into structured components.
     * @param {string} rawAddress 
     * @returns {Promise<Object>} Structured address components
     */
    async parseAddress(rawAddress) {
        if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
            return this._getEmptyAddress();
        }

        const normalizedKey = rawAddress.trim().toLowerCase();
        if (this.cache.has(normalizedKey)) {
            console.log(`[AddressParsingService] Cache hit for: "${rawAddress.substring(0, 30)}..."`);
            return this.cache.get(normalizedKey);
        }

        const systemPrompt = `You are an expert Indian postal address parser. 
Your task is to analyze the unstructured address input and split it into structured JSON fields.
Ensure you follow these rules:
1. "houseNo": Flat/house/plot/shop number, building/apartment name, block, phase, or floor info.
2. "street": Street name, road, lane, landmark, near-by reference, or colony name (if not sector-based).
3. "area": Sector number, zone, sub-locality, or specific sector details (e.g., "Sector 45", "DLF Phase 3").
4. "location": Locality, village name, main locality reference, or sub-district identifier.
5. "tehsil": Tehsil, district, or city name (e.g., "Gurugram", "Ghaziabad", "New Delhi").
6. "pincode": Find and extract the exact 6-digit postal code.
7. "state": Full name of the state (e.g., "Haryana", "Uttar Pradesh", "Delhi").
8. "country": Set to "India" if in India, otherwise specify.

You MUST respond ONLY with a valid JSON object matching the schema. No explanations, no markdown wrappers, no backticks.
Schema structure:
{
  "houseNo": "string",
  "street": "string",
  "area": "string",
  "location": "string",
  "tehsil": "string",
  "pincode": "string",
  "state": "string",
  "country": "string"
}`;

        const userPrompt = `Address: "${rawAddress}"`;

        try {
            console.log(`[AddressParsingService] Requesting AI to parse: "${rawAddress.substring(0, 50)}..."`);
            
            // Using UnifiedAIService with automatic failover
            const rawResponse = await UnifiedAIService.generate(userPrompt, {
                systemPrompt,
                temperature: 0.1
            });

            const structured = this._cleanAndParseJSON(rawResponse);
            const normalized = this._normalizeStructuredAddress(structured);
            this.cache.set(normalizedKey, normalized);
            return normalized;
        } catch (error) {
            console.error(`[AddressParsingService] Error parsing address:`, error.message);
            // Fallback to empty structure to prevent breaking import pipeline
            return this._getEmptyAddress();
        }
    }

    /**
     * Parse multiple addresses concurrently in batch using chunks to avoid timeouts.
     * @param {Array<string>} addresses 
     * @param {number} chunkSize 
     * @returns {Promise<Array<Object>>}
     */
    async parseAddressesInBatch(addresses, chunkSize = 10) {
        if (!addresses || !Array.isArray(addresses)) return [];
        console.log(`[AddressParsingService] Batch parsing ${addresses.length} addresses in chunks of ${chunkSize}...`);
        
        const results = [];
        for (let i = 0; i < addresses.length; i += chunkSize) {
            const chunk = addresses.slice(i, i + chunkSize);
            const chunkPromises = chunk.map(addr => this.parseAddress(addr));
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }
        return results;
    }

    /**
     * Standardizes common Indian address abbreviations to match database lookups.
     */
    _normalizeStructuredAddress(parsed) {
        const cleanHouseNo = (str) => {
            if (!str || typeof str !== 'string') return '';
            let cleaned = str.trim();
            const prefixRegex = /^(?:h\s*\.?\s*no\.?\s*(?:no\.?)?|house\s*(?:no\.?)?|flat\s*(?:no\.?)?|plot\s*(?:no\.?)?|qtr\s*\.?\s*(?:no\.?)?|quarter\s*(?:no\.?)?|shop\s*(?:no\.?)?|ward\s*(?:no\.?)?|no\.?)\s*[-:#\/\s]*\s*/i;
            cleaned = cleaned.replace(prefixRegex, '');
            return cleaned.trim();
        };

        const cleanLocation = (str) => {
            if (!str || typeof str !== 'string') return '';
            let val = str.trim();
            
            // Generate fuzzy key for checking standard names
            let key = val.toLowerCase().trim();
            // 1. Strip standard prefix "vill "
            key = key.replace(/^(?:village|vill\s*\.?|v\.?p\.?o\s*\.?)\s+/i, '');
            // 2. Strip suffixes like "post office ...", "po ...", "p.o. ...", "district ...", "near ...", "via ..."
            key = key.replace(/\s+post\s+office.*$/gi, '');
            key = key.replace(/\s+p\.?o\.?.*$/gi, '');
            key = key.replace(/\s+district.*$/gi, '');
            key = key.replace(/\s+near.*$/gi, '');
            key = key.replace(/\s+via.*$/gi, '');
            // 3. Normalize common spelling variations
            key = key.replace(/jayotisar/g, 'jyotisar');
            key = key.replace(/kirmach/g, 'kirmich');
            key = key.replace(/pipil/g, 'pipli');
            key = key.replace(/behali/g, 'baholi');
            key = key.replace(/bohali/g, 'baholi');
            key = key.replace(/jhandolla/g, 'jadola');
            // 4. Strip all non-alphanumeric characters (spaces, hyphens, etc.)
            const fuzzyKey = key.replace(/[^a-z0-9]/gi, '');

            const standardNames = {
                'devidasspura': 'Vill Devidasspura',
                'pipli': 'Vill Pipli',
                'kirmich': 'Vill Kirmich',
                'baholi': 'Vill Baholi',
                'jadola': 'Vill Jadola',
                'ramsaranmajra': 'Vill Ramsaran Majra',
                'jyotisar': 'Vill Jyotisar',
                'bargatthalipur': 'Vill Bargat Thalipur',
                'mathana': 'Vill Mathana',
                'bhoresaidan': 'Vill Bhore Saidan'
            };

            if (standardNames[fuzzyKey]) {
                return standardNames[fuzzyKey];
            }

            // Fallback to standardizing prefix to "Vill "
            const villageRegex = /^(?:village|vill\s*\.?|v\.?p\.?o\s*\.?)\s+/i;
            if (villageRegex.test(val)) {
                const rawName = val.replace(villageRegex, '').trim();
                return `Vill ${rawName}`;
            }

            return val;
        };

        const replaceRules = (str) => {
            if (!str || typeof str !== 'string') return '';
            let cleaned = str.trim();
            
            // Sec -> Sector
            cleaned = cleaned.replace(/\bsec\b/gi, 'Sector');
            cleaned = cleaned.replace(/\bsect\b/gi, 'Sector');
            
            // Ph -> Phase
            cleaned = cleaned.replace(/\bph\b/gi, 'Phase');
            
            // Lmk -> Landmark
            cleaned = cleaned.replace(/\blmk\b/gi, 'Landmark');
            
            return cleaned.trim();
        };

        const stateRules = (state) => {
            if (!state) return '';
            const normalized = state.trim().toLowerCase();
            const statesMap = {
                'hr': 'Haryana',
                'haryana': 'Haryana',
                'up': 'Uttar Pradesh',
                'uttar pradesh': 'Uttar Pradesh',
                'uttar pardesh': 'Uttar Pradesh',
                'dl': 'Delhi',
                'delhi': 'Delhi',
                'dehli': 'Delhi',
                'wb': 'West Bengal',
                'west bengal': 'West Bengal',
                'paschim bangal': 'West Bengal',
                'uk': 'Uttarakhand',
                'uttarakhand': 'Uttarakhand',
                'uttrakhand': 'Uttarakhand',
                'pb': 'Punjab',
                'punjab': 'Punjab',
                'rj': 'Rajasthan',
                'rajasthan': 'Rajasthan',
                'rajsthan': 'Rajasthan',
                'chandigarh ut': 'Chandigarh',
                'chandigarh': 'Chandigarh',
                'hp': 'Himachal Pradesh',
                'himachal pradesh': 'Himachal Pradesh',
                'himachal pardesh': 'Himachal Pradesh',
                'mh': 'Maharashtra',
                'maharastra': 'Maharashtra',
                'ka': 'Karnataka',
                'karnatka': 'Karnataka',
                'tn': 'Tamil Nadu',
                'tamilnadu': 'Tamil Nadu'
            };
            return statesMap[normalized] || state.trim();
        };

        const cityRules = (cityVal) => {
            if (!cityVal || typeof cityVal !== 'string') return { city: '', extraLocation: '', extraTehsil: '' };
            let val = cityVal.trim();
            let normalized = val.toLowerCase();

            const spellingMap = {
                'gurgaon': 'Gurugram',
                'sonepat': 'Sonipat',
                'yamuna nagar': 'Yamunanagar',
                'yamun nagar': 'Yamunanagar',
                'hissar': 'Hisar',
                'ambala city': 'Ambala',
                'ambala cantt': 'Ambala',
                'chandigarh, india': 'Chandigarh'
            };

            if (spellingMap[normalized]) {
                return { city: spellingMap[normalized], extraLocation: '', extraTehsil: '' };
            }

            const subCityMap = {
                'pehowa': { district: 'Kurukshetra', field: 'tehsil' },
                'ladwa': { district: 'Kurukshetra', field: 'tehsil' },
                'shahbad markanda': { district: 'Kurukshetra', field: 'tehsil' },
                'shahbad': { district: 'Kurukshetra', field: 'tehsil' },
                'thanesar': { district: 'Kurukshetra', field: 'tehsil' },
                'pipli': { district: 'Kurukshetra', field: 'location' },
                'jyotisar': { district: 'Kurukshetra', field: 'location' },
                'bhore saidan': { district: 'Kurukshetra', field: 'location' },
                'umri': { district: 'Kurukshetra', field: 'location' },
                'dudhla': { district: 'Kurukshetra', field: 'location' },
                'bargat thalipur': { district: 'Yamunanagar', field: 'location' },
                'sanghour': { district: 'Kurukshetra', field: 'location' },
                'cheeka': { district: 'Kaithal', field: 'location' },
                'pundri': { district: 'Kaithal', field: 'location' },
                'lahli': { district: 'Rohtak', field: 'location' },
                'gharaunda': { district: 'Karnal', field: 'location' },
                'bapoli': { district: 'Panipat', field: 'location' },
                'majra roran': { district: 'Karnal', field: 'location' },
                'hassanpur': { district: 'Karnal', field: 'location' },
                'khekra': { district: 'Baghpat', field: 'location' },
                'dwarka': { district: 'Delhi', field: 'location' },
                'rohini': { district: 'Delhi', field: 'location' },
                'nilokheri': { district: 'Karnal', field: 'location' },
                'assandh': { district: 'Karnal', field: 'tehsil' },
                'dhand': { district: 'Kaithal', field: 'location' },
                'narwana': { district: 'Jind', field: 'tehsil' },
                'indri': { district: 'Karnal', field: 'tehsil' },
                'gohana': { district: 'Sonipat', field: 'tehsil' },
                'shahibabad': { district: 'Ghaziabad', field: 'location' },
                'nahan': { district: 'Sirmaur', field: 'location' },
                'jagadhri': { district: 'Yamunanagar', field: 'location' },
                'barara': { district: 'Ambala', field: 'tehsil' },
                'kaul': { district: 'Kaithal', field: 'location' },
                'peedal': { district: 'Kaithal', field: 'location' },
                'bahari': { district: 'Kaithal', field: 'location' },
                'bapdi': { district: 'Yamunanagar', field: 'location' },
                'udarsi': { district: 'Karnal', field: 'location' }
            };

            if (subCityMap[normalized]) {
                const target = subCityMap[normalized];
                return {
                    city: target.district,
                    extraLocation: target.field === 'location' ? val : '',
                    extraTehsil: target.field === 'tehsil' ? val : ''
                };
            }

            return { city: val, extraLocation: '', extraTehsil: '' };
        };

        let cleanedState = stateRules(parsed.state);
        const cityInfo = cityRules(parsed.tehsil || parsed.city);

        if (cityInfo.city && cityInfo.city.toLowerCase() === 'ghaziabad') {
            cleanedState = 'Uttar Pradesh';
        }
        
        let finalLocation = cleanLocation(replaceRules(parsed.location || parsed.area));
        if (cityInfo.extraLocation) {
            finalLocation = cleanLocation(cityInfo.extraLocation);
        }

        let finalTehsil = replaceRules(parsed.tehsil);
        if (cityInfo.extraTehsil) {
            finalTehsil = cityInfo.extraTehsil;
        }

        return {
            houseNo: cleanHouseNo(parsed.houseNo),
            street: replaceRules(parsed.street),
            area: replaceRules(parsed.area),
            location: finalLocation,
            tehsil: finalTehsil,
            pincode: parsed.pincode || '',
            state: cleanedState,
            city: cityInfo.city || replaceRules(parsed.city),
            country: parsed.country || 'India'
        };
    }

    /**
     * Cleans AI output and parses JSON safely.
     */
    _cleanAndParseJSON(text) {
        if (!text) return this._getEmptyAddress();
        
        let cleaned = text.trim();
        // Remove markdown JSON codeblock markers if present
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
        }

        try {
            const parsed = JSON.parse(cleaned);
            // Ensure all fields exist
            return {
                houseNo: parsed.houseNo || '',
                street: parsed.street || '',
                area: parsed.area || '',
                location: parsed.location || '',
                tehsil: parsed.tehsil || '',
                pincode: parsed.pincode || '',
                state: parsed.state || '',
                country: parsed.country || 'India'
            };
        } catch (e) {
            console.error(`[AddressParsingService] JSON parsing failed. Content was: "${cleaned}"`, e.message);
            
            // Regex fallback if JSON parsing failed completely
            const extractField = (field) => {
                const regex = new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i');
                const match = cleaned.match(regex);
                return match ? match[1] : '';
            };

            return {
                houseNo: extractField('houseNo'),
                street: extractField('street'),
                area: extractField('area'),
                location: extractField('location'),
                tehsil: extractField('tehsil'),
                pincode: extractField('pincode'),
                state: extractField('state'),
                country: extractField('country') || 'India'
            };
        }
    }

    _getEmptyAddress() {
        return {
            houseNo: '',
            street: '',
            area: '',
            location: '',
            tehsil: '',
            pincode: '',
            state: '',
            country: 'India'
        };
    }
}

export default new AddressParsingService();
