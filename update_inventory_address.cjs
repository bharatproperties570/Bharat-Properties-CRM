const fs = require('fs');
const path = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/controllers/inventory.controller.js';
let content = fs.readFileSync(path, 'utf8');

const startMarker = "let hNo = String(ownerHouseNo || '').trim();";
const endMarker = "// 2. Resolve/Create Owner (With Legal Identity & Assignment)";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find markers!");
    process.exit(1);
}

const replacement = `let hNo = String(ownerHouseNo || '').trim();
                let street = String(ownerStreet || '').trim();
                let area = String(ownerArea || '').trim();
                let locality = String(ownerLocality || '').trim();
                let city = String(ownerCity || '').trim();
                let state = String(ownerState || '').trim();
                let pincode = String(ownerPinCode || '').trim();

                let fullAddress = row.address || row.ownerAddress || row.fullAddress || row['Full Address'] || row['Address'] || '';
                
                // 🚀 [HARDENED ENTERPRISE LOOPHOLE FIX]
                // Previously, if users mapped "City: Vill Pawti" or "City: Thanesar", it bypassed the AddressParsingService
                // and polluted the City Master Data. Now, we force ALL mapped fields through the AddressParsingService to enforce strict taxonomy.
                const combinedAddressToParse = [hNo, street, area, locality, city, state, pincode, fullAddress]
                    .filter(Boolean)
                    .join(', ');

                if (combinedAddressToParse) {
                    try {
                        const parsed = await AddressParsingService.parseAddress(combinedAddressToParse);
                        
                        // Override raw mapped fields with strictly validated Master Data fields
                        hNo = parsed.houseNo || hNo;
                        street = parsed.street || street;
                        area = parsed.area || area;
                        locality = parsed.location || parsed.area || locality;
                        
                        // Special fix for City vs Tehsil confusion
                        if (parsed.tehsil && !parsed.city && !city) {
                            // If it parsed a tehsil but no city, keep city empty
                        } else if (parsed.city) {
                            city = parsed.city;
                        }

                        state = parsed.state || state;
                        pincode = parsed.pincode || pincode;

                    } catch (parseErr) {
                        console.error("[BULK_OWNER_UPDATE] Address parse fallback failed:", parseErr.message);
                    }
                }

                const personalAddress = {
                    hNo: hNo || '',
                    street: street || '',
                    location: locality || '',
                    area: area || '',
                    city: city || '',
                    state: state || '',
                    pincode: pincode || ''
                };

                `;

content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
fs.writeFileSync(path, content);
console.log("Updated inventory.controller.js address parsing.");
