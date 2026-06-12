import UnifiedAIService from './UnifiedAIService.js';
import mongoose from 'mongoose';

const getLookupModel = () => {
    // Gracefully handle model loading to prevent "OverwriteModelError"
    try {
        return mongoose.model('Lookup');
    } catch {
        const LookupSchema = new mongoose.Schema({
            lookup_type: { type: String, required: true, index: true },
            lookup_value: { type: String, required: true },
            code: { type: String, default: null },
            parent_lookup_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lookup', default: null },
            parent_lookup_value: { type: String, default: null },
            isActive: { type: Boolean, default: true },
            order: { type: Number, default: 0 },
            metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
        }, { timestamps: true });
        return mongoose.model('Lookup', LookupSchema);
    }
};

class AddressParsingService {
    constructor() {
        this.cache = new Map();
        this.masterDataInitialized = false;
        this.initializing = false;

        this.masterCache = {
            cities: new Map(),
            tehsils: new Map(),
            locations: new Map(),
            states: new Map()
        };

        // --- KEYWORDS & MAPPINGS ---
        this.statesMapping = {
            'mohali': 'Punjab',
            'chandigarh': 'Chandigarh',
            'kurukshetra': 'Haryana',
            'panchkula': 'Haryana',
            'panipat': 'Haryana',
            'karnal': 'Haryana',
            'ambala': 'Haryana',
            'gurugram': 'Haryana',
            'gurgaon': 'Haryana',
            'faridabad': 'Haryana',
            'delhi': 'Delhi',
            'new delhi': 'Delhi',
            'noida': 'Uttar Pradesh',
            'greater noida': 'Uttar Pradesh',
            'ghaziabad': 'Uttar Pradesh',
            'zirakpur': 'Punjab',
            'kharar': 'Punjab',
            'dera bassi': 'Punjab'
        };

        this.tehsilMapping = {
            'dera bassi': 'Dera Bassi',
            'derabassi': 'Dera Bassi',
            'zirakpur': 'Dera Bassi',
            'kharar': 'Kharar',
            'kurukshetra': 'Thanesar',
            'thanesar': 'Thanesar',
            'amin': 'Thanesar',
            'pipli': 'Thanesar'
        };

        this.regexHouseNo = /^(?:House\s*No\.?|H\.?No\.?|Plot\s*No\.?|SCO\s*No\.?|SCO|Booth\s*No\.?|Booth|Shop\s*No\.?|Flat\s*No\.?|Flat|Apartment\s*No\.?|Unit\s*No\.?|Khasra\s*No\.?)\s*[:#-]?\s*([A-Za-z0-9-/]+)/i;
        this.regexStreet = /(?:Road|Street|Gali|Lane|Marg|Chowk|Near\s+[^,]+|Opposite\s+[^,]+|Opp\.\s+[^,]+|Behind\s+[^,]+|Beside\s+[^,]+|c\/o\s+[^,]+)/i;
        this.regexArea = /(?:Ward\s*No\.?\s*[0-9]+|[^,]*Colony|[^,]*Enclave|[^,]*Nagar|[^,]*Vihar|[^,]*Extension|Phase\s*[0-9A-Za-z]+|Block\s*[0-9A-Za-z]+|Pocket\s*[0-9A-Za-z]+|Tower\s*[0-9A-Za-z]+|[^,]*Apartment|[^,]*Society)/i;
        this.regexLocation = /(?:VPO\s+[^,]+|Village\s+[^,]+|Vill\s+[^,]+|Sector\s*[0-9A-Za-z]+|Sec\s*[0-9A-Za-z]+|Urban\s+Estate|Industrial\s+Area|Model\s+Town|HUDA\s+Sector\s*[0-9A-Za-z]+|HSVP\s+Sector\s*[0-9A-Za-z]+)/i;
        this.regexPincode = /\b([1-9][0-9]{5})\b/;
    }

    async initializeMasterData() {
        if (this.masterDataInitialized || this.initializing) return;
        this.initializing = true;
        
        try {
            // Check if mongoose is connected
            if (mongoose.connection.readyState !== 1) {
                console.warn('[AddressParsingService] Database not connected. Skipping Master Data Cache.');
                return;
            }

            const Lookup = getLookupModel();
            const lookups = await Lookup.find({
                lookup_type: { $in: ['City', 'Tehsil', 'Location', 'State'] },
                isActive: true
            }).lean();

            lookups.forEach(l => {
                if (!l.lookup_value) return;
                const val = l.lookup_value.toLowerCase().trim();
                if (val.length < 3) return; // Skip very short generic terms

                if (l.lookup_type === 'City') this.masterCache.cities.set(val, l.lookup_value);
                if (l.lookup_type === 'Tehsil') this.masterCache.tehsils.set(val, l.lookup_value);
                if (l.lookup_type === 'Location') this.masterCache.locations.set(val, l.lookup_value);
                if (l.lookup_type === 'State') this.masterCache.states.set(val, l.lookup_value);
            });
            
            console.log(`[AddressParsingService] Master Data Cache Loaded: ${this.masterCache.cities.size} Cities, ${this.masterCache.tehsils.size} Tehsils, ${this.masterCache.locations.size} Locations.`);
            this.masterDataInitialized = true;
        } catch (err) {
            console.error('[AddressParsingService] Failed to load Master Data:', err.message);
        } finally {
            this.initializing = false;
        }
    }

    shouldParse(val) {
        if (!val || typeof val !== 'string') return false;
        const trimmed = val.trim();
        if (trimmed.length < 10) return false;
        const spaceCount = (trimmed.match(/\s/g) || []).length;
        if (spaceCount < 2) return false;
        const hasIndicators = /sector|sec|phase|ph|house|flat|plot|h\.?no|near|opposite|opp|landmark|road|gali|lane|kurukshetra|gurgaon|gurugram|delhi|ghaziabad|street|ward/i.test(trimmed);
        return hasIndicators || spaceCount >= 3;
    }

    async parseAddress(rawAddress) {
        if (!rawAddress || typeof rawAddress !== 'string' || !rawAddress.trim()) {
            return this._getEmptyAddress();
        }

        if (!this.masterDataInitialized && mongoose.connection.readyState === 1) {
            await this.initializeMasterData();
        }

        const normalizedKey = rawAddress.trim().toLowerCase();
        if (this.cache.has(normalizedKey)) {
            return this.cache.get(normalizedKey);
        }

        try {
            let structured = this._applyMasterRules(rawAddress);
            let normalized = this._normalizeStructuredAddress(structured);
            
            if (!normalized.city && !normalized.location && !normalized.tehsil) {
                console.log(`[AddressParsingService] Master Rules failed to find location data. Falling back to AI LLM for: "${rawAddress.substring(0, 30)}..."`);
                const aiResult = await this._applyAIFallback(rawAddress);
                if (aiResult) {
                    normalized = this._normalizeStructuredAddress(aiResult);
                }
            }

            this.cache.set(normalizedKey, normalized);
            return normalized;
        } catch (error) {
            console.error(`[AddressParsingService] Error parsing address:`, error.message);
            return this._getEmptyAddress();
        }
    }

    async parseAddressesInBatch(addresses, chunkSize = 10) {
        if (!addresses || !Array.isArray(addresses)) return [];
        console.log(`[AddressParsingService] Batch parsing ${addresses.length} addresses in chunks of ${chunkSize}...`);
        
        // Ensure cache is loaded before batch processing
        if (!this.masterDataInitialized && mongoose.connection.readyState === 1) {
            await this.initializeMasterData();
        }

        const results = [];
        for (let i = 0; i < addresses.length; i += chunkSize) {
            const chunk = addresses.slice(i, i + chunkSize);
            const chunkPromises = chunk.map(addr => this.parseAddress(addr));
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }
        return results;
    }

    _applyMasterRules(rawAddress) {
        const result = this._getEmptyAddress();
        
        let remainingTokens = rawAddress.split(',').map(t => t.trim()).filter(t => t.length > 0);
        let unassignedTokens = [];

        // SAS Nagar -> Mohali
        remainingTokens = remainingTokens.map(token => {
            if (/S\.?A\.?S\.?\s*Nagar/i.test(token)) return token.replace(/S\.?A\.?S\.?\s*Nagar/ig, 'Mohali');
            return token;
        });

        // VPO
        remainingTokens = remainingTokens.map(token => {
            const vpoMatch = token.match(/^VPO\s+(.+)/i);
            if (vpoMatch) {
                result.location = vpoMatch[1].trim();
                result.postOffice = vpoMatch[1].trim();
                return null;
            }
            return token;
        }).filter(Boolean);

        // Vill
        remainingTokens = remainingTokens.map(token => {
            const villMatch = token.match(/^(?:Village|Vill)\s+(.+)/i);
            if (villMatch) {
                result.location = villMatch[1].trim();
                return null;
            }
            return token;
        }).filter(Boolean);

        // Pincode
        remainingTokens = remainingTokens.map(token => {
            const pinMatch = token.match(this.regexPincode);
            if (pinMatch) {
                result.pincode = pinMatch[1];
                const newToken = token.replace(this.regexPincode, '').trim();
                return newToken.length > 0 ? newToken : null;
            }
            return token;
        }).filter(Boolean);

        // Token Iteration
        remainingTokens = remainingTokens.map(token => {
            let matched = false;
            const lowerToken = token.toLowerCase();

            // House No
            if (!result.houseNo) {
                const hnMatch = token.match(this.regexHouseNo);
                if (hnMatch) {
                    result.houseNo = hnMatch[0].trim();
                    const remainder = token.replace(this.regexHouseNo, '').trim();
                    if (remainder.length > 0) unassignedTokens.push(remainder);
                    matched = true;
                    return null;
                }
            }

            // Street
            if (token.match(this.regexStreet)) {
                if (!result.street) result.street = token;
                else result.street += `, ${token}`;
                matched = true;
                return null;
            }

            // Area
            if (token.match(this.regexArea)) {
                if (token.toLowerCase() !== 'mohali') {
                    if (!result.area) result.area = token;
                    else result.area += `, ${token}`;
                    matched = true;
                    return null;
                }
            }

            // Location Regex
            if (token.match(this.regexLocation)) {
                if (!result.location) result.location = token;
                else result.location += `, ${token}`;
                matched = true;
                return null;
            }

            // Dynamic Location from Master Data
            if (this.masterDataInitialized) {
                for (const [key, locVal] of this.masterCache.locations.entries()) {
                    if (lowerToken === key || lowerToken.includes(` ${key}`) || lowerToken.includes(`${key} `)) {
                        if (!result.location) result.location = locVal;
                        else result.location += `, ${locVal}`;
                        matched = true;
                        return null; // Exact match found, consume token
                    }
                }
            }

            // Check Hardcoded States Mapping for City
            let cityMatched = false;
            for (const city of Object.keys(this.statesMapping)) {
                if (lowerToken.includes(city)) {
                    if (!result.city) result.city = token; // Keep original casing
                    matched = true;
                    cityMatched = true;
                    if (!result.state) result.state = this.statesMapping[city];
                    return null;
                }
            }
            if (cityMatched) return null;

            // Dynamic City from Master Data
            if (this.masterDataInitialized) {
                for (const [key, cityVal] of this.masterCache.cities.entries()) {
                    if (lowerToken === key) {
                        if (!result.city) result.city = cityVal;
                        matched = true;
                        cityMatched = true;
                        return null;
                    }
                }
            }
            if (cityMatched) return null;

            // Known States
            const knownStates = ['haryana', 'punjab', 'chandigarh', 'delhi', 'uttar pradesh'];
            if (knownStates.some(s => lowerToken === s)) {
                result.state = token;
                return null;
            }

            // Dynamic State from Master Data
            if (this.masterDataInitialized) {
                for (const [key, stateVal] of this.masterCache.states.entries()) {
                    if (lowerToken === key) {
                        if (!result.state) result.state = stateVal;
                        return null;
                    }
                }
            }

            if (lowerToken === 'india' || lowerToken === 'bharat') {
                result.country = 'India';
                return null;
            }

            if (!matched && token.length > 0) {
                unassignedTokens.push(token);
            }
            
            return matched ? (token.length > 0 ? token : null) : token;
        }).filter(Boolean);

        // Tehsil resolution
        if (!result.tehsil) {
            const lookupValue = (result.location || result.postOffice || result.city || '').toLowerCase();
            let tehsilFound = false;
            
            // From hardcoded
            for (const [key, tehsil] of Object.entries(this.tehsilMapping)) {
                if (lookupValue.includes(key)) {
                    result.tehsil = tehsil;
                    tehsilFound = true;
                    break;
                }
            }

            // From dynamic Master Data
            if (!tehsilFound && this.masterDataInitialized) {
                for (const [key, tehsilVal] of this.masterCache.tehsils.entries()) {
                    if (lookupValue.includes(key)) {
                        result.tehsil = tehsilVal;
                        break;
                    }
                }
            }
        }

        if (!result.country) result.country = 'India';

        if (unassignedTokens.length > 0) {
            if (unassignedTokens.length > 0 && !result.houseNo && /^[\d\w-]+$/.test(unassignedTokens[0])) {
                result.houseNo = unassignedTokens.shift();
            }

            unassignedTokens.forEach(token => {
                if (!result.area) result.area = token;
                else if (!result.street) result.street = token;
                else result.area += `, ${token}`; 
            });
        }

        return result;
    }

    async _applyAIFallback(rawAddress) {
        const systemPrompt = `You are an expert Indian Real Estate Data Extraction AI. Parse the unstructured address string into a strict JSON structure.
Rules you MUST follow:
1. "houseNo": Flat/house/plot/shop number, building/apartment name, block, phase.
2. "street": Street name, road, lane, landmark, near-by reference. Also put 'c/o', 'Opposite', 'Behind' ONLY here.
3. "area": Put terms like 'Ward No', 'Colony', 'Phase' ONLY here.
4. "location": If the word starts with 'Village' or 'VPO', put it here.
5. "city": If you see 'SAS Nagar', output 'Mohali'.
6. Do NOT drop any text. If a text does not fit any logical field, append it to 'street' or 'area'.
7. "pincode": Extract the 6 digit pincode.
8. "tehsil", "state", "country": Output accordingly. "country" defaults to "India".
9. "postOffice": Determine if possible based on VPO keywords.

You MUST respond ONLY with a valid JSON object matching the schema. No explanations, no markdown wrappers, no backticks.
Schema structure:
{
  "houseNo": "string",
  "street": "string",
  "area": "string",
  "location": "string",
  "tehsil": "string",
  "city": "string",
  "postOffice": "string",
  "pincode": "string",
  "state": "string",
  "country": "string"
}`;
        const userPrompt = `Address: "${rawAddress}"`;
        try {
            const rawResponse = await UnifiedAIService.generate(userPrompt, { systemPrompt, temperature: 0.1 });
            return this._cleanAndParseJSON(rawResponse);
        } catch (error) {
            console.error(`[AddressParsingService] AI LLM Fallback failed:`, error.message);
            return null;
        }
    }

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
            
            let key = val.toLowerCase().trim();
            key = key.replace(/^(?:village|vill\s*\.?|v\.?p\.?o\s*\.?)\s+/i, '');
            key = key.replace(/\s+post\s+office.*$/gi, '');
            key = key.replace(/\s+p\.?o\.?.*$/gi, '');
            key = key.replace(/\s+district.*$/gi, '');
            key = key.replace(/\s+near.*$/gi, '');
            key = key.replace(/\s+via.*$/gi, '');
            key = key.replace(/jayotisar/g, 'jyotisar');
            key = key.replace(/kirmach/g, 'kirmich');
            key = key.replace(/pipil/g, 'pipli');
            key = key.replace(/behali/g, 'baholi');
            key = key.replace(/bohali/g, 'baholi');
            key = key.replace(/jhandolla/g, 'jadola');
            
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

            if (standardNames[fuzzyKey]) return standardNames[fuzzyKey];

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
            cleaned = cleaned.replace(/\bsec\b/gi, 'Sector');
            cleaned = cleaned.replace(/\bsect\b/gi, 'Sector');
            cleaned = cleaned.replace(/\bph\b/gi, 'Phase');
            cleaned = cleaned.replace(/\blmk\b/gi, 'Landmark');
            return cleaned.trim();
        };

        const stateRules = (state) => {
            if (!state) return '';
            const normalized = state.trim().toLowerCase();
            const statesMap = {
                'hr': 'Haryana', 'haryana': 'Haryana',
                'up': 'Uttar Pradesh', 'uttar pradesh': 'Uttar Pradesh', 'uttar pardesh': 'Uttar Pradesh',
                'dl': 'Delhi', 'delhi': 'Delhi', 'dehli': 'Delhi',
                'wb': 'West Bengal', 'west bengal': 'West Bengal', 'paschim bangal': 'West Bengal',
                'uk': 'Uttarakhand', 'uttarakhand': 'Uttarakhand', 'uttrakhand': 'Uttarakhand',
                'pb': 'Punjab', 'punjab': 'Punjab',
                'rj': 'Rajasthan', 'rajasthan': 'Rajasthan', 'rajsthan': 'Rajasthan',
                'chandigarh ut': 'Chandigarh', 'chandigarh': 'Chandigarh',
                'hp': 'Himachal Pradesh', 'himachal pradesh': 'Himachal Pradesh', 'himachal pardesh': 'Himachal Pradesh',
                'mh': 'Maharashtra', 'maharastra': 'Maharashtra',
                'ka': 'Karnataka', 'karnatka': 'Karnataka',
                'tn': 'Tamil Nadu', 'tamilnadu': 'Tamil Nadu'
            };
            return statesMap[normalized] || state.trim();
        };

        const cityRules = (cityVal) => {
            if (!cityVal || typeof cityVal !== 'string') return { city: '', extraLocation: '', extraTehsil: '' };
            let val = cityVal.trim();
            let normalized = val.toLowerCase();

            const spellingMap = {
                'gurgaon': 'Gurugram', 'sonepat': 'Sonipat', 'yamuna nagar': 'Yamunanagar',
                'yamun nagar': 'Yamunanagar', 'hissar': 'Hisar', 'ambala city': 'Ambala',
                'ambala cantt': 'Ambala', 'chandigarh, india': 'Chandigarh'
            };

            if (spellingMap[normalized]) return { city: spellingMap[normalized], extraLocation: '', extraTehsil: '' };

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
        if (cityInfo.extraLocation) finalLocation = cleanLocation(cityInfo.extraLocation);

        let finalTehsil = replaceRules(parsed.tehsil);
        if (cityInfo.extraTehsil) finalTehsil = cityInfo.extraTehsil;

        return {
            houseNo: cleanHouseNo(parsed.houseNo),
            street: replaceRules(parsed.street),
            area: replaceRules(parsed.area),
            location: finalLocation,
            tehsil: finalTehsil,
            pincode: parsed.pincode || '',
            state: cleanedState,
            city: cityInfo.city || replaceRules(parsed.city),
            country: parsed.country || 'India',
            postOffice: parsed.postOffice || ''
        };
    }

    _cleanAndParseJSON(text) {
        if (!text) return null;
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            return {
                houseNo: parsed.houseNo || parsed.houseNumber || '',
                street: parsed.street || '',
                area: parsed.area || '',
                location: parsed.location || '',
                tehsil: parsed.tehsil || '',
                city: parsed.city || '',
                postOffice: parsed.postOffice || '',
                pincode: parsed.pincode || '',
                state: parsed.state || '',
                country: parsed.country || 'India'
            };
        } catch (e) {
            console.error(`[AddressParsingService] JSON parsing failed: "${cleaned}"`);
            return null;
        }
    }

    _getEmptyAddress() {
        return {
            houseNo: '', street: '', area: '', location: '', tehsil: '',
            pincode: '', state: '', city: '', country: 'India', postOffice: ''
        };
    }
}

export default new AddressParsingService();
