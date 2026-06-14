const fs = require('fs');
const path = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/controllers/inventory.controller.js';
let content = fs.readFileSync(path, 'utf8');

// The block to replace starts around line 2483: "// 🚀 [HARDENED] Search for existing contact"
// And ends at line 2603: "results.conflicts.push(...); ownerId = \"CONFLICT_PENDING\"; } else {"
// Actually, it goes all the way down to:
// "if (!ownerId && !results.errors.find(e => e.row === i + 1)) { ownerId = await createNewContact({...}) }"

// Let's use regex to extract and replace the block safely.
const startMarker = "// 🚀 [HARDENED] Search for existing contact (Mobile first, then Legal Identity)";
const endMarker = "// 3. Check for Ownership Conflict & Update Inventory";

let startIndex = content.indexOf(startMarker);
let endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find markers!");
    process.exit(1);
}

const replacement = `// 🚀 [HARDENED] Search for existing contact (Mobile first, then Legal Identity)
                        let contactByMobile = mobile ? await Contact.findOne({ 'phones.number': mobile }).populate('personalAddress.location') : null;
                        
                        // 🚀 [HARDENED] Name Normalization for matching (Strip Sh., Shri, Late, Mr. etc)
                        const normalizeName = (n) => String(n || '').replace(/^(Sh\\.|Shri|Sh|Mr\\.|Mr|Mrs\\.|Mrs|Late|Lt\\.)\\s+/i, '').trim();
                        const normName = normalizeName(name);
                        const normFather = normalizeName(fatherName);

                        let contactByLegal = null;
                        if (normName) {
                            const legalQuery = { 
                                name: { $regex: new RegExp(\`^\\\\s*(\${escapeRegExp(name)}|\${escapeRegExp(normName)})\\\\s*$\`, 'i') }
                            };
                            
                            // 🚀 [SENIOR] Tier 2 & 3 Matching logic
                            const matchConditions = [];
                            
                            // Condition A: Name + exact Father Name match
                            if (normFather) {
                                matchConditions.push({ fatherName: { $regex: new RegExp(\`^\\\\s*(\${escapeRegExp(fatherName)}|\${escapeRegExp(normFather)})\\\\s*$\`, 'i') } });
                            }
                            
                            // Condition B: Name + Address match (If FatherName is missing or mismatches)
                            if (hNo || locality || ownerCity) {
                                const addrConditions = [];
                                if (hNo) addrConditions.push({ 'personalAddress.hNo': { $regex: new RegExp(\`^\\\\s*\${escapeRegExp(hNo)}\\\\s*$\`, 'i') } });
                                if (locality) {
                                    const resolvedLocId = await cachedResolveLookup('Area', locality);
                                    if (resolvedLocId) addrConditions.push({ 'personalAddress.location': resolvedLocId });
                                }
                                if (ownerCity) addrConditions.push({ 'personalAddress.city': { $regex: new RegExp(\`^\\\\s*\${escapeRegExp(ownerCity)}\\\\s*$\`, 'i') } });
                                
                                if (addrConditions.length > 0) {
                                    matchConditions.push({ $and: addrConditions });
                                }
                            }
                            
                            if (matchConditions.length > 0) {
                                legalQuery.$or = matchConditions;
                                contactByLegal = await Contact.findOne(legalQuery).populate('personalAddress.location');
                            } else if (!mobile) {
                                // 🚀 [FIXED] If no mobile, no father name, no address provided, fallback to matching just by name
                                contactByLegal = await Contact.findOne(legalQuery).populate('personalAddress.location');
                            }
                        }

                        let existingContact = contactByMobile || contactByLegal;

                        if (existingContact) {
                            // 🚀 [ENTERPRISE] Auto-Merge Logic (No Data Mismatch Conflict UI)
                            // We assume it's the exact same person. We just update missing/changed fields.
                            let needsSave = false;

                            // Merge Name/FatherName
                            if (name && existingContact.name !== name) {
                                existingContact.name = name;
                                needsSave = true;
                            }
                            if (fatherName && existingContact.fatherName !== fatherName) {
                                existingContact.fatherName = fatherName;
                                needsSave = true;
                            }

                            // Merge Alternate Mobile
                            if (alternateMobile) {
                                const hasAlt = existingContact.phones && existingContact.phones.some(p => p.number === alternateMobile);
                                if (!hasAlt) {
                                    if (!existingContact.phones) existingContact.phones = [];
                                    existingContact.phones.push({ type: 'Work', number: alternateMobile });
                                    needsSave = true;
                                }
                            }

                            // Merge Address
                            const addrFields = ['hNo', 'street', 'area', 'city', 'state', 'pincode'];
                            if (!existingContact.personalAddress) existingContact.personalAddress = {};
                            addrFields.forEach(f => {
                                if (personalAddress[f] && existingContact.personalAddress[f] !== personalAddress[f]) {
                                    existingContact.personalAddress[f] = personalAddress[f];
                                    needsSave = true;
                                }
                            });
                            
                            // Merge Location (ObjectId)
                            if (locality) {
                                const resolvedLocId = await cachedResolveLookup('Location', locality) || await cachedResolveLookup('Area', locality);
                                if (resolvedLocId && (!existingContact.personalAddress.location || existingContact.personalAddress.location.toString() !== resolvedLocId.toString())) {
                                    existingContact.personalAddress.location = resolvedLocId;
                                    needsSave = true;
                                }
                            }

                            // Save if modified
                            if (needsSave) {
                                await existingContact.save();
                            }
                            
                            ownerId = existingContact._id.toString();
                            results.contactsFound++;
                            results.duplicates.push({ name: 'Merged Contact', mobile: mobile || 'N/A' });
                            
                        } else {
                            // Create New Contact
                            const newContact = new Contact({
                                name: name || 'Unknown',
                                fatherName: fatherName || '',
                                type: 'Individual',
                                assignedTo: rowAssignedTo,
                                owner: rowAssignedTo,
                                team: Array.isArray(rowTeam) ? rowTeam : [rowTeam],
                                visibleTo: rowVisibleTo,
                                source: commonSource,
                                createdBy: req.user.id,
                                tenantId: req.user.tenantId
                            });

                            if (mobile) newContact.phones = [{ type: 'Mobile', number: mobile }];
                            if (alternateMobile) {
                                if (!newContact.phones) newContact.phones = [];
                                newContact.phones.push({ type: 'Work', number: alternateMobile });
                            }
                            if (email) newContact.emails = [{ type: 'Personal', address: email }];

                            newContact.personalAddress = personalAddress;
                            if (locality) {
                                const resolvedLocId = await cachedResolveLookup('Location', locality) || await cachedResolveLookup('Area', locality);
                                if (resolvedLocId) newContact.personalAddress.location = resolvedLocId;
                            }

                            await newContact.save();
                            ownerId = newContact._id.toString();
                            results.contactsCreated++;
                        }
                    }

                    // Handle Conflict Resolution Actions early if it's SKIP_ROW
                    const resolution = resolutions?.[rowKey]?.owner || resolutions?.[rowKey]?.ownership;
                    if (resolution === 'SKIP_ROW') {
                        results.errors.push({ row: i + 1, item: unitNo, reason: "Row skipped by user resolution choice" });
                        continue;
                    }

                    `;

let newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);

fs.writeFileSync(path, newContent);
console.log("Successfully updated deduplication logic.");
