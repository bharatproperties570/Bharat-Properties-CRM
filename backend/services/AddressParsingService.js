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
            states: new Map(),
            idToLookup: new Map()
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

        this.regexStreet = /(?:Road|Street|Gali|Lane|Marg|Chowk|Near\s+[^,]+|Opposite\s+[^,]+|Opp\.\s+[^,]+|Behind\s+[^,]+|Beside\s+[^,]+|c\/o\s+[^,]+)/i;
        this.regexArea = /(?:Ward\s*No\.?\s*[0-9]+|[^,]*Colony|[^,]*Enclave|[^,]*Nagar|[^,]*Vihar|[^,]*Extension|Phase\s*[0-9A-Za-z]+|Block\s*[0-9A-Za-z]+|Pocket\s*[0-9A-Za-z]+|Tower\s*[0-9A-Za-z]+|[^,]*Apartment|[^,]*Society)/i;
        this.regexLocation = /(?:VPO\s+[^,]+|Village\s+[^,]+|Vill\s+[^,]+|Sector\s*[0-9A-Za-z]+|Sec\s*[0-9A-Za-z]+|Urban\s+Estate|Industrial\s+Area|Model\s+Town|HUDA\s+Sector\s*[0-9A-Za-z]+|HSVP\s+Sector\s*[0-9A-Za-z]+)/i;
        this.regexPincode = /\b([0-9]{6})\b/;
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
                
                this.masterCache.idToLookup.set(l._id.toString(), l);
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
            // Strip R/O, C/O, S/O, W/O, D/O prefixes
            const cleanedRawAddress = rawAddress.replace(/^(?:R\/O|C\/O|W\/O|S\/O|D\/O)\s*[-:]?\s*/i, '').trim();
            
            let structured = this._applyMasterRules(cleanedRawAddress);
            let normalized = this._normalizeStructuredAddress(structured);
            
            if (!normalized.city && !normalized.location && !normalized.tehsil) {
                console.log(`[AddressParsingService] Master Rules failed to find location data. Falling back to AI LLM for: "${rawAddress.substring(0, 30)}..."`);
                const aiResult = await this._applyAIFallback(rawAddress);
                if (aiResult) {
                    normalized = this._normalizeStructuredAddress(aiResult);
                }
            }

            // Phase 1 Enrichment: Master Data Traversal
            normalized = await this._enrichFromMasterData(normalized);

            // Phase 2 Enrichment: AI Internet/Knowledge-base Search
            if (!normalized.pincode || !normalized.city || !normalized.state || !normalized.tehsil) {
                normalized = await this._enrichFromAILLM(normalized);
            }

            // Phase 3: Master Data Alignment (Fix field types based on Master Data globally)
            normalized = await this._alignFieldsWithMasterData(normalized);

            // Phase 4: Auto-Learn to Master Data
            await this._syncToMasterData(normalized);

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

    _extractHouseNoAndClean(rawAddress) {
        const rules = [
            // STRATEGY 1: Direct H.NO patterns
            /(?:R\/O|C\/O|VPO|AT|PROF)?\s*(?:H\.?\s*N[OO]\.?|HOUSE\s*NO\.?)\s*[-:,\s]*([0-9]+[A-Z/.\\-]*)/i,
            // STRATEGY 2: KOTHI NO., FLAT NO., UNIT NO., Q.NO.
            /(?:KOTHI|FLAT|UNIT|Q|PLOT|SCO|BOOTH|SHOP|KHASRA|APARTMENT)\.?\s*N[OO]\.?\s*[-:,\s]*([0-9]+[A-Z/.\\-]*)/i,
            // STRATEGY 3: Letter-Number at Start
            /^([A-Z]-?\d+[A-Z]?)\s+(?:SECTOR|URBAN|ESTATE)/i,
            // STRATEGY 4: Numbers Before SECTOR/ROAD
            /,\s*([0-9]+[A-Z]?)\s*(?:SECTOR|ROAD|LANE|STREET)/i,
            // STRATEGY 5: After C/O Person Name
            /C\/O\s+[A-Z\s]+\s+([0-9]+[A-Z/.\\-]*)(?:\s+SECTOR|\s+URBAN)/i,
            // STRATEGY 6: Number-Letter Combos
            /\b([0-9]+\s*[-/]?\s*[A-Z]+)\s+(?:SECTOR|URBAN|ESTATE)/i,
            // STRATEGY 7: Hyphenated Numbers (Slash Format)
            /\b([0-9]+\/[0-9A-Z]+)\s+(?:SECTOR|URBAN)/i,
            // STRATEGY 8: Numbers Before U/E or U.E
            /\b([0-9]+[A-Z]?)\s+(?:U\.E|U\/E|URBAN\s+ESTATE)/i,
            // STRATEGY 9: "SECTOR N, NO M" Pattern
            /SECTOR\s+\d+\s*,\s*(?:NO|NUMBER|#)\.?\s*([0-9]+[A-Z]?)/i,
            // STRATEGY 10: Number at Start Before Comma
            /^([0-9]+[A-Z]?)\s*,\s*(?:SECTOR|URBAN)/i,
            // STRATEGY 11: Standalone Numbers (LAST RESORT)
            /\b([0-9]{2,4})\b(?:\s+(?:SECTOR|URBAN|ESTATE|DISTT))/i
        ];

        let extracted = '';
        let cleanedAddress = rawAddress;

        for (let i = 0; i < rules.length; i++) {
            const match = rawAddress.match(rules[i]);
            if (match && match[1]) {
                let rawVal = match[1].trim();
                
                let cleanedVal = rawVal.replace(/[^A-Za-z0-9/-]/g, '');
                cleanedVal = cleanedVal.replace(/(?:SECTOR|URBAN|ESTATE|DISTT|HOUSE|NO|HNO)\b/ig, '');

                if (/\d/.test(cleanedVal)) {
                    extracted = cleanedVal;
                    if (i === 0 || i === 1) {
                        cleanedAddress = rawAddress.replace(match[0], ' ');
                    } else if (i === 8) { 
                        cleanedAddress = rawAddress.replace(match[0], match[0].replace(match[1], ' '));
                    } else {
                        cleanedAddress = rawAddress.replace(match[1], ' ');
                    }
                    break;
                }
            }
        }
        return { houseNo: extracted, cleanedAddress: cleanedAddress };
    }

    _extractPostOfficeAndClean(rawAddress) {
        const regex = /(?:P\.?\s*O\.?|V\.?\s*P\.?\s*O\.?|POST\s+OFFICE)\s+([A-Za-z\s]+?)(?:\s*[-,]|DISTT|DISTRICT|TEHSIL|TEH|$)/i;
        const match = rawAddress.match(regex);
        let extracted = '';
        let cleanedAddress = rawAddress;

        if (match && match[1]) {
            extracted = match[1].trim();
            // Remove just the extracted part from the address, or remove the entire match depending on context.
            // But since VPO is often combined with the village name, we should remove the match so it doesn't pollute.
            cleanedAddress = rawAddress.replace(match[0], ' ');
        }

        return { postOffice: extracted, cleanedAddress: cleanedAddress };
    }

    _applyMasterRules(rawAddress) {
        const result = this._getEmptyAddress();
        
        let { houseNo, cleanedAddress } = this._extractHouseNoAndClean(rawAddress);
        if (houseNo) result.houseNo = houseNo;
        
        const poData = this._extractPostOfficeAndClean(cleanedAddress);
        if (poData.postOffice) {
            result.postOffice = poData.postOffice;
            // Also assign it to location if location isn't set, as VPO implies Village
            if (/V\.?P\.?O/i.test(cleanedAddress)) {
                result.location = 'Vill ' + poData.postOffice;
            }
        }
        cleanedAddress = poData.cleanedAddress;
        let remainingTokens = cleanedAddress.split(',').map(t => {
            let token = t.trim();
            // Clean leading/trailing punctuation except specific chars
            token = token.replace(/^[^a-zA-Z0-9(]+/, '').replace(/[^a-zA-Z0-9)]+$/, '');
            return token.trim();
        }).filter(t => t.length > 0);

        let unassignedTokens = [];

        // SAS Nagar -> Mohali
        remainingTokens = remainingTokens.map(token => {
            if (/S\.?A\.?S\.?\s*Nagar/i.test(token)) return token.replace(/S\.?A\.?S\.?\s*Nagar/ig, 'Mohali');
            return token;
        });

        // District
        remainingTokens = remainingTokens.map(token => {
            const distMatch = token.match(/\b(?:Distt|District|Dist)\.?\s+([A-Za-z\s]+)\b/i);
            if (distMatch) {
                let extractedCity = distMatch[1].trim();
                
                // Cross-reference with master data to fix casing
                if (this.masterDataInitialized) {
                    const lowerCity = extractedCity.toLowerCase();
                    for (const [key, cityVal] of this.masterCache.cities.entries()) {
                        if (key === lowerCity) {
                            extractedCity = cityVal;
                            break;
                        }
                    }
                }
                
                result.city = extractedCity;
                
                // Auto-map state based on extracted city
                const lowerCity = extractedCity.toLowerCase();
                for (const mappedCity of Object.keys(this.statesMapping)) {
                    if (lowerCity.includes(mappedCity) && !result.state) {
                        result.state = this.statesMapping[mappedCity];
                        break;
                    }
                }
                
                const newToken = token.replace(distMatch[0], '').trim();
                return newToken.length > 0 ? newToken : null;
            }
            return token;
        }).filter(Boolean);

        // Tehsil
        remainingTokens = remainingTokens.map(token => {
            const tehsilMatch = token.match(/\b(?:Tehsil|Teh|Tq)\.?\s+([A-Za-z\s]+)\b/i);
            if (tehsilMatch) {
                let extractedTehsil = tehsilMatch[1].trim();
                
                // Cross-reference with master data to fix casing
                if (this.masterDataInitialized) {
                    const lowerTehsil = extractedTehsil.toLowerCase();
                    for (const [key, tehsilVal] of this.masterCache.tehsils.entries()) {
                        if (key === lowerTehsil) {
                            extractedTehsil = tehsilVal;
                            break;
                        }
                    }
                }
                
                result.tehsil = extractedTehsil;
                const newToken = token.replace(tehsilMatch[0], '').trim();
                return newToken.length > 0 ? newToken : null;
            }
            return token;
        }).filter(Boolean);

        // Vill (if not caught by VPO)
        remainingTokens = remainingTokens.map(token => {
            const villMatch = token.match(/^(?:Village|Vill)\s+([A-Za-z\s]+)/i);
            if (villMatch) {
                if (!result.location) result.location = 'Vill ' + villMatch[1].trim();
                const newToken = token.replace(villMatch[0], '').trim();
                return newToken.length > 0 ? newToken : null;
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

            // Check if token ends with a known master city (Glued token split)
            if (this.masterDataInitialized && !result.city) {
                const lowerForSplit = token.toLowerCase();
                for (const [key, cityVal] of this.masterCache.cities.entries()) {
                    if (lowerForSplit.endsWith(` ${key}`)) {
                        result.city = cityVal;
                        token = token.slice(0, -(key.length + 1)).trim();
                        break;
                    }
                }
            }
            
            // Check if token ends with a known state (Glued token split)
            const lowerForStateSplit = token.toLowerCase();
            const knownStatesArray = ['haryana', 'punjab', 'chandigarh', 'delhi', 'uttar pradesh', 'himachal pradesh', 'uttarakhand', 'maharashtra', 'karnataka', 'tamil nadu', 'rajasthan', 'west bengal'];
            for (const known of knownStatesArray) {
                if (lowerForStateSplit.endsWith(` ${known}`)) {
                    if (!result.state) result.state = known;
                    token = token.slice(0, -(known.length + 1)).trim();
                    break;
                }
            }

            let lowerToken = token.toLowerCase();

            // House No fallback (if not caught by 11 strategies)
            if (!result.houseNo) {
                const hnMatch = token.match(/^(?:House\s*No\.?|H\.?No\.?|Plot\s*No\.?|SCO\s*No\.?|SCO|Booth\s*No\.?|Booth|Shop\s*No\.?|Flat\s*No\.?|Flat|Apartment\s*No\.?|Unit\s*No\.?|Khasra\s*No\.?)\s*[:#-]?\s*([A-Za-z0-9-/]+)/i);
                if (hnMatch) {
                    result.houseNo = hnMatch[1].replace(/[^A-Za-z0-9/-]/g, '').trim();
                    const remainder = token.replace(hnMatch[0], '').trim();
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

            // Urban Estate explicitly goes to Area
            if (/\b(?:U\/?\.?E\.?|Urban\s+Estate)\b/i.test(token)) {
                if (!result.area) result.area = 'Urban Estate';
                else result.area += `, Urban Estate`;
                token = token.replace(/\b(?:U\/?\.?E\.?|Urban\s+Estate)\b/ig, '').trim();
                if (!token) return null;
                lowerToken = token.toLowerCase();
            }

            // Location Regex
            if (token.match(this.regexLocation)) {
                let formattedLoc = token.replace(/\b(?:Sec-?\.?\s*)(\d+[A-Za-z]?)(?:-?[A-Za-z])?\b/ig, (match, p1) => {
                    return match.replace(/Sec-?\.?\s*/i, 'Sector ');
                });
                
                if (!result.location) result.location = formattedLoc;
                else result.location += `, ${formattedLoc}`;
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
                if (lowerToken === city) {
                    if (!result.city) result.city = city; // Fixed: use city name instead of whole token
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
            if (unassignedTokens.length > 0 && !result.houseNo) {
                const first = unassignedTokens[0];
                if (/\d/.test(first) || /^[A-Z]-[A-Z0-9]+$/i.test(first) || first.length <= 3) {
                    result.houseNo = unassignedTokens.shift();
                }
            }

            unassignedTokens.forEach(token => {
                if (!result.location) result.location = token;
                else if (!result.area) result.area = token;
                else if (!result.street) result.street = token;
                else result.location += `, ${token}`; 
            });
        }

        return result;
    }

    async _applyAIFallback(rawAddress) {
        const systemPrompt = `You are an expert Indian Real Estate Data Extraction AI. Parse the unstructured address string into a strict JSON structure.
Rules you MUST follow:
1. "houseNo": Flat/house/plot/shop number, building/apartment name, block, phase.
2. "street": Street name, road, lane, landmark, near-by reference. Also put 'c/o', 'Opposite', 'Behind' ONLY here.
3. "area": Put terms like 'Ward No', 'Colony', 'Phase', 'Urban Estate', 'U/E' ONLY here.
4. "location": If the word starts with 'Village' or 'VPO' or is a village name, put it here and ALWAYS prepend "Vill " to it. Standardize Sector to "Sector X".
5. "city": If you see 'SAS Nagar', output 'Mohali'. Only actual Cities/Districts go here.
6. Do NOT drop any text. If a text does not fit any logical field, append it to 'street' or 'area'.
7. "pincode": Extract the 6 digit pincode. If missing but Post Office is known, output the accurate pincode for that PO.
8. "tehsil", "state", "country": Output accordingly. Words prefixed with Teh/Tehsil/Tq MUST be assigned to 'tehsil', never to 'city'. "country" defaults to "India".
9. "postOffice": If you detect 'PO', 'P.O.', 'P. O.', or 'Post Office', extract it. Fix spelling mistakes for PO and Tehsil based on standard Indian postal data priority.

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
                'nilokheri': { district: 'Karnal', field: 'tehsil' },
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

        if (finalLocation && /^(?:VPO|Village|Vill)\s+/i.test(finalLocation) && !/^Vill\s/i.test(finalLocation)) {
            finalLocation = finalLocation.replace(/^(?:VPO|Village|Vill)\s+/i, 'Vill ');
        } else if (finalLocation && /village|gaon|vpo|vill/i.test(finalLocation) && !/^Vill\s/i.test(finalLocation)) {
            if (!/^Vill\s/i.test(finalLocation)) {
                finalLocation = 'Vill ' + finalLocation.replace(/village|gaon|vpo|vill/ig, '').trim();
            }
        }

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

    async _enrichFromMasterData(normalized) {
        if (!this.masterDataInitialized || !this.masterCache.idToLookup) return normalized;

        const findLookupValue = (val, map) => {
            if (!val) return null;
            const normalizedVal = val.toLowerCase().trim();
            for (const [_, lookupObj] of this.masterCache.idToLookup.entries()) {
                if (lookupObj.lookup_value.toLowerCase().trim() === normalizedVal) {
                    return lookupObj;
                }
            }
            return null;
        };

        let startNode = null;
        if (normalized.location) startNode = findLookupValue(normalized.location, this.masterCache.locations);
        if (!startNode && normalized.tehsil) startNode = findLookupValue(normalized.tehsil, this.masterCache.tehsils);
        if (!startNode && normalized.city) startNode = findLookupValue(normalized.city, this.masterCache.cities);

        if (startNode) {
            // Re-align the field type of the startNode itself
            const actualType = startNode.lookup_type.toLowerCase();
            if (['city', 'tehsil', 'location', 'state'].includes(actualType)) {
                normalized[actualType] = startNode.lookup_value;
            }

            // Pull Pincode from Address Master if missing
            if (!normalized.pincode) {
                if (startNode.code && /^[0-9]{6}$/.test(startNode.code)) {
                    normalized.pincode = startNode.code;
                } else if (startNode.metadata && startNode.metadata.pincode) {
                    normalized.pincode = startNode.metadata.pincode;
                }
            }

            let currentNode = startNode;
            while (currentNode && currentNode.parent_lookup_id) {
                const parentId = currentNode.parent_lookup_id.toString();
                const parentNode = this.masterCache.idToLookup.get(parentId);
                if (!parentNode) break;

                // Check parent for Pincode if still missing
                if (!normalized.pincode) {
                    if (parentNode.code && /^[0-9]{6}$/.test(parentNode.code)) {
                        normalized.pincode = parentNode.code;
                    } else if (parentNode.metadata && parentNode.metadata.pincode) {
                        normalized.pincode = parentNode.metadata.pincode;
                    }
                }

                if (parentNode.lookup_type === 'Tehsil' && !normalized.tehsil) {
                    normalized.tehsil = parentNode.lookup_value;
                } else if (parentNode.lookup_type === 'City' && !normalized.city) {
                    normalized.city = parentNode.lookup_value;
                } else if (parentNode.lookup_type === 'State' && !normalized.state) {
                    normalized.state = parentNode.lookup_value;
                }
                currentNode = parentNode;
            }
        }
        return normalized;
    }

    async _alignFieldsWithMasterData(normalized) {
        if (!this.masterDataInitialized || !this.masterCache.idToLookup) return normalized;

        const checkAndMove = (fieldVal, currentField) => {
            if (!fieldVal) return;
            const val = fieldVal.toLowerCase().trim();
            // Search all Master Data globally
            let foundNode = null;
            for (const [_, lookupObj] of this.masterCache.idToLookup.entries()) {
                if (lookupObj.lookup_value.toLowerCase().trim() === val) {
                    foundNode = lookupObj;
                    break;
                }
            }

            if (foundNode && foundNode.lookup_type.toLowerCase() !== currentField.toLowerCase()) {
                // Value exists in Master Data under a DIFFERENT type. Let's move it to correct field.
                const correctField = foundNode.lookup_type.toLowerCase();
                
                if (['city', 'tehsil', 'location', 'state'].includes(correctField)) {
                    normalized[correctField] = foundNode.lookup_value;
                    // Clear the wrong field ONLY IF it currently holds this exact value
                    if (normalized[currentField] === fieldVal) {
                        normalized[currentField] = '';
                    }
                }
            }
        };

        // Align each field. We must copy values to avoid overwriting during checks
        const origCity = normalized.city;
        const origTehsil = normalized.tehsil;
        const origLocation = normalized.location;
        const origState = normalized.state;

        checkAndMove(origCity, 'city');
        checkAndMove(origTehsil, 'tehsil');
        checkAndMove(origLocation, 'location');
        checkAndMove(origState, 'state');

        return normalized;
    }

    async _enrichFromAILLM(normalized) {
        // If we don't even have a location or street, AI won't be able to infer anything useful.
        if (!normalized.location && !normalized.street && !normalized.area) return normalized;

        const systemPrompt = `You are an expert Indian Geography and Real Estate Assistant.
Your task is to enrich partial address data by finding missing geographic details (Tehsil, City/District, State, Pincode) using your knowledge base.
You will be given a JSON object with partial address data.
Respond ONLY with a valid JSON object containing the ENRICHED fields merged with the ORIGINAL fields. Do not add explanations.
Ensure that:
1. 'city' represents the District.
2. 'tehsil' represents the Tehsil/Taluka/Mandal. Do NOT assign known Tehsils to the 'city' field.
3. 'pincode' is a 6-digit Indian Pincode. If 'pincode' is missing but 'postOffice' or 'location' is known, search your knowledge base and accurately fill the 'pincode'.
4. 'state' is the Indian state.
5. If the location is a village, ALWAYS prepend 'Vill ' to its name (e.g. 'Vill Sham Garh').
6. Correct any spelling mistakes in Post Office or Tehsil names based on official Indian postal records.
If you cannot confidently determine a missing field, leave it empty.`;

        const userPrompt = `Partial Address JSON:\n${JSON.stringify(normalized, null, 2)}`;

        try {
            console.log(`[AddressParsingService] Enriching address via AI LLM...`);
            const rawResponse = await UnifiedAIService.generate(userPrompt, { systemPrompt, temperature: 0.1 });
            const aiEnriched = this._cleanAndParseJSON(rawResponse);
            
            if (aiEnriched) {
                // Merge AI findings into our normalized object, prioritizing existing data
                normalized.location = normalized.location || aiEnriched.location || '';
                normalized.tehsil = normalized.tehsil || aiEnriched.tehsil || '';
                normalized.city = normalized.city || aiEnriched.city || '';
                normalized.state = normalized.state || aiEnriched.state || '';
                normalized.pincode = normalized.pincode || aiEnriched.pincode || '';
                if (!normalized.country || normalized.country === 'India') {
                     normalized.country = aiEnriched.country || 'India';
                }

                // Enforce Vill prefix logic
                if (normalized.location && /^(?:VPO|Village|Vill)\s+/i.test(normalized.location) && !/^Vill\s/i.test(normalized.location)) {
                    normalized.location = normalized.location.replace(/^(?:VPO|Village|Vill)\s+/i, 'Vill ');
                } else if (normalized.location && /village|gaon|vpo|vill/i.test(normalized.location) && !/^Vill\s/i.test(normalized.location)) {
                    // Fallback to prepend Vill if it's not at the start but contains village keywords
                    if (!/^Vill\s/i.test(normalized.location)) {
                        normalized.location = 'Vill ' + normalized.location.replace(/village|gaon|vpo|vill/ig, '').trim();
                    }
                }
            }
        } catch (error) {
            console.error(`[AddressParsingService] AI Enrichment failed:`, error.message);
        }
        
        return normalized;
    }

    async _syncToMasterData(normalized) {
        if (!this.masterDataInitialized || mongoose.connection.readyState !== 1) return;

        let stateId = null, cityId = null, tehsilId = null, locationId = null;

        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const getOrCreate = async (type, value, map, parentId, parentValue) => {
            if (!value) return null;
            const normalizedVal = value.toLowerCase().trim();

            // 1. Check memory cache first
            for (const [_, lookupObj] of this.masterCache.idToLookup.entries()) {
                if (lookupObj.lookup_type === type && lookupObj.lookup_value.toLowerCase().trim() === normalizedVal) {
                    return lookupObj._id;
                }
            }

            // 2. Concurrency Control: Check if it's already pending creation by another concurrent request
            const pendingKey = `${type}_${normalizedVal}`;
            if (!this._pendingCreations) this._pendingCreations = new Map();
            if (this._pendingCreations.has(pendingKey)) {
                return await this._pendingCreations.get(pendingKey);
            }

            // 3. Create the promise to handle DB lookup and insert
            const creationPromise = (async () => {
                const Lookup = getLookupModel();
                // Check DB
                let existing = await Lookup.findOne({
                    lookup_type: type,
                    lookup_value: { $regex: new RegExp(`^${escapeRegex(value.trim())}$`, 'i') }
                }).lean();

                if (!existing) {
                    existing = await Lookup.create({
                        lookup_type: type,
                        lookup_value: value.trim(),
                        parent_lookup_id: parentId || null,
                        parent_lookup_value: parentValue || null,
                        isActive: true
                    });
                    console.log(`[AddressParsingService] Auto-learned new ${type}: ${value}`);
                }

                // Update caches
                this.masterCache.idToLookup.set(existing._id.toString(), existing);
                if (type === 'State') this.masterCache.states.set(normalizedVal, existing.lookup_value);
                if (type === 'City') this.masterCache.cities.set(normalizedVal, existing.lookup_value);
                if (type === 'Tehsil') this.masterCache.tehsils.set(normalizedVal, existing.lookup_value);
                if (type === 'Location') this.masterCache.locations.set(normalizedVal, existing.lookup_value);

                return existing._id;
            })();

            this._pendingCreations.set(pendingKey, creationPromise);
            const resultId = await creationPromise;
            // Clean up the pending queue after resolution
            this._pendingCreations.delete(pendingKey);
            return resultId;
        };

        try {
            stateId = await getOrCreate('State', normalized.state, this.masterCache.states, null, null);
            cityId = await getOrCreate('City', normalized.city, this.masterCache.cities, stateId, normalized.state);
            tehsilId = await getOrCreate('Tehsil', normalized.tehsil, this.masterCache.tehsils, cityId || stateId, normalized.city || normalized.state);
            locationId = await getOrCreate('Location', normalized.location, this.masterCache.locations, tehsilId || cityId || stateId, normalized.tehsil || normalized.city || normalized.state);
        
            // Auto-update Pincode in Master Data if we have it and the lowest level node doesn't
            if (normalized.pincode) {
                const targetId = locationId || tehsilId || cityId;
                if (targetId) {
                    const targetNode = this.masterCache.idToLookup.get(targetId.toString());
                    if (targetNode && (!targetNode.code || !/^[0-9]{6}$/.test(targetNode.code))) {
                        targetNode.code = normalized.pincode;
                        await getLookupModel().updateOne({ _id: targetId }, { $set: { code: normalized.pincode } });
                        console.log(`[AddressParsingService] Auto-updated Pincode ${normalized.pincode} for ${targetNode.lookup_value}`);
                    }
                }
            }
        } catch (error) {
            console.error(`[AddressParsingService] Auto-Learn Failed:`, error.message);
        }
    }

    async evaluateConflictViaAI(diffs, existingAddress, incomingAddress) {
        // Prepare data for LLM
        const addressFields = ['Address PINCODE', 'Address STATE', 'Address CITY', 'Address AREA', 'Address LOCATION', 'Address STREET'];
        const targetDiffs = diffs.filter(d => addressFields.includes(d.field));
        
        if (targetDiffs.length === 0) return {}; // No address fields to auto-resolve

        const systemPrompt = `You are an expert Indian Address Verification System.
Your job is to resolve data conflicts between an existing 'System' address and an incoming 'CSV' address.
You must analyze the conflicting fields and decide which one is correct based on real-world Indian geography (e.g., verifying if a Pincode matches a City, or if a State matches a City).

Rules:
1. Return a valid JSON object ONLY. Do not include any explanations or markdown formatting like \`\`\`json.
2. The JSON keys must be the exact field names provided in the conflict list.
3. The JSON values must be either "KEEP" (if System is correct/better), "UPDATE" (if CSV is correct/better), or "MANUAL" (if you cannot confidently decide or both are wrong).
4. If one value is empty/null and the other is a valid real-world value, choose the valid one.
5. If both are valid but represent the same place (e.g., "Sec 7" vs "Sector 7"), prefer "KEEP" to avoid unnecessary updates.
6. A 6-digit Indian Pincode is better than no pincode.
7. Treat "Tehsil", "Taluka", and "Mandal" as equivalent concepts.

Example Output:
{
  "Address PINCODE": "UPDATE",
  "Address CITY": "KEEP",
  "Address LOCATION": "MANUAL"
}`;

        const userPrompt = `
System Address (Current):
${JSON.stringify(existingAddress || {}, null, 2)}

CSV Address (Incoming):
${JSON.stringify(incomingAddress || {}, null, 2)}

Conflicting Fields to Resolve:
${JSON.stringify(targetDiffs, null, 2)}

Based on the full context of both addresses, output the JSON resolution mapping.`;

        try {
            console.log(`[AddressParsingService] Auto-resolving ${targetDiffs.length} address conflicts via AI LLM...`);
            const rawResponse = await UnifiedAIService.generate(userPrompt, { systemPrompt, temperature: 0.1 });
            const decisionMap = this._cleanAndParseJSON(rawResponse);
            return decisionMap || {};
        } catch (error) {
            console.error(`[AddressParsingService] AI Conflict Resolution failed:`, error.message);
            return {};
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
