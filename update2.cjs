const fs = require('fs');
const path = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/controllers/inventory.controller.js';
const lines = fs.readFileSync(path, 'utf8').split('\n');

const startStr = '// 🚀 [HARDENED] Search for existing contact (Mobile first, then Legal Identity)';
const endStr = '// 🚀 [FIXED] Cache by BOTH Mobile and Composite key to prevent intra-batch duplicates';

const startIndex = lines.findIndex(l => l.includes(startStr));
const endIndex = lines.findIndex(l => l.includes(endStr));

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find markers!");
    console.log(startIndex, endIndex);
    process.exit(1);
}

const replacement = `                        // 🚀 [HARDENED] Search for existing contact (Mobile first, then Legal Identity)
                        let contactByMobile = mobile ? await Contact.findOne({ 'phones.number': mobile }).populate('personalAddress.location') : null;
                        
                        // 🚀 [HARDENED] Name Normalization for matching (Strip Sh., Shri, Late, Mr. etc)
                        const normalizeName = (n) => String(n || '').replace(/^(Sh\\.|Shri|Sh|Mr\\.|Mr|Mrs\\.|Mrs|Late|Lt\\.)\\s+/i, '').trim();
                        const normName = normalizeName(name);
                        const normFather = normalizeName(fatherName);

                        let contactByLegal = null;
                        if (normName && !contactByMobile) {
                            const legalQuery = { 
                                name: { $regex: new RegExp(\`^\\\\s*(\${escapeRegExp(name)}|\${escapeRegExp(normName)})\\\\s*$\`, 'i') }
                            };
                            
                            // 🚀 [SENIOR] Tier 2 & 3 Matching logic
                            const matchConditions = [];
                            
                            if (normFather) {
                                matchConditions.push({ fatherName: { $regex: new RegExp(\`^\\\\s*(\${escapeRegExp(fatherName)}|\${escapeRegExp(normFather)})\\\\s*$\`, 'i') } });
                            }
                            
                            if (hNo || locality || ownerCity) {
                                const addrConditions = [];
                                if (hNo) addrConditions.push({ 'personalAddress.hNo': { $regex: new RegExp(\`^\\\\s*\${escapeRegExp(hNo)}\\\\s*$\`, 'i') } });
                                if (locality) {
                                    const resolvedLocId = await cachedResolveLookup('Area', locality) || await cachedResolveLookup('Location', locality);
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
                                contactByLegal = await Contact.findOne(legalQuery).populate('personalAddress.location');
                            }
                        }

                        const existingContact = contactByMobile || contactByLegal;

                        // Evaluate Ownership Conflict skipping early
                        const resolution = resolutions?.[rowKey]?.owner || resolutions?.[rowKey]?.ownership;
                        if (resolution === 'SKIP_ROW') {
                            results.errors.push({ row: i + 1, item: unitNo, reason: "Row skipped by user resolution choice" });
                            continue;
                        }

                        if (existingContact) {
                            // 🚀 [ENTERPRISE] Auto-Merge Logic (No Data Mismatch Conflict UI)
                            if (!dryRun) {
                                let needsSave = false;

                                if (name && existingContact.name !== name) {
                                    existingContact.name = name;
                                    needsSave = true;
                                }
                                if (fatherName && existingContact.fatherName !== fatherName) {
                                    existingContact.fatherName = fatherName;
                                    needsSave = true;
                                }

                                if (alternateMobile) {
                                    if (!existingContact.phones) existingContact.phones = [];
                                    const hasAlt = existingContact.phones.some(p => p.number === alternateMobile);
                                    if (!hasAlt) {
                                        existingContact.phones.push({ type: 'Alternate', number: alternateMobile });
                                        needsSave = true;
                                    }
                                }

                                const resolvedAddress = await resolveHierarchicalAddress(personalAddress);
                                if (!existingContact.personalAddress) existingContact.personalAddress = {};
                                
                                const addrFields = ['hNo', 'street', 'area', 'city', 'state', 'pincode'];
                                addrFields.forEach(f => {
                                    if (resolvedAddress[f] && existingContact.personalAddress[f] !== resolvedAddress[f]) {
                                        existingContact.personalAddress[f] = resolvedAddress[f];
                                        needsSave = true;
                                    }
                                });
                                
                                if (resolvedAddress.location && (!existingContact.personalAddress.location || existingContact.personalAddress.location.toString() !== resolvedAddress.location.toString())) {
                                    existingContact.personalAddress.location = resolvedAddress.location;
                                    needsSave = true;
                                }

                                if (needsSave) {
                                    existingContact.markModified('personalAddress');
                                    await existingContact.save();
                                }
                            }
                            
                            ownerId = existingContact._id.toString();
                            results.contactsFound++;
                            results.duplicates.push({ name: existingContact.name, mobile: mobile || existingContact.phones?.[0]?.number, _id: existingContact._id });
                        } else {
                            if (dryRun) {
                                ownerId = "SIMULATED_ID";
                                results.contactsCreated++;
                            } else {
                                const resolvedAddress = await resolveHierarchicalAddress(personalAddress);
                                const newPhones = [];
                                if (mobile) newPhones.push({ number: mobile, type: 'Personal' });
                                if (alternateMobile && alternateMobile !== mobile) newPhones.push({ number: alternateMobile, type: 'Alternate' });

                                const newContact = await Contact.create({
                                    name: name || 'Unknown Owner', fatherName: fatherName,
                                    phones: newPhones,
                                    emails: email ? [{ address: email, type: 'Personal' }] : [],
                                    personalAddress: resolvedAddress, ...assignmentUpdate, source: commonSource,
                                    tags: ['Property Owner', propertyTag]
                                });
                                ownerId = newContact._id.toString();
                                results.contactsCreated++;
                            }
                        }
`;

const newLines = [
    ...lines.slice(0, startIndex),
    replacement,
    ...lines.slice(endIndex)
];

fs.writeFileSync(path, newLines.join('\n'));
console.log("Successfully updated deduplication logic.");
