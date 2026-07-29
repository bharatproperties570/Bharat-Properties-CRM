import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/services/AddressParsingService.js"

with open(file_path, "r") as f:
    content = f.read()

# 1. Update _extractHouseNoAndClean
target_extract = """    _extractHouseNoAndClean(rawAddress) {
        const rules = ["""

replace_extract = """    _extractHouseNoAndClean(rawAddress) {
        // SPECIAL STRATEGY 0: Number/Sector combo like "1227/5 U.E" or "156/13 URBAN ESTATE"
        const specialMatch = rawAddress.match(/\\b([0-9]+)\\/([0-9]+[A-Z]?)\\s*(?:U\\.?E\\.?|URBAN\\s+ESTATE|H\\.?\\s*B\\.?\\s*COLONY|HOUSING\\s+BOARD\\s+COLONY|SECTOR|SEC|SACTOR)\\b/i);
        if (specialMatch) {
            return {
                houseNo: specialMatch[1],
                extractedSector: specialMatch[2],
                cleanedAddress: rawAddress.replace(specialMatch[0], ' ')
            };
        }

        const rules = ["""

content = content.replace(target_extract, replace_extract)

# 2. Update _applyMasterRules
target_apply = """    _applyMasterRules(rawAddress) {
        const result = this._getEmptyAddress();
        
        let { houseNo, cleanedAddress } = this._extractHouseNoAndClean(rawAddress);
        if (houseNo) result.houseNo = houseNo;"""

replace_apply = """    _applyMasterRules(rawAddress) {
        const result = this._getEmptyAddress();
        
        let { houseNo, extractedSector, cleanedAddress } = this._extractHouseNoAndClean(rawAddress);
        if (houseNo) result.houseNo = houseNo;
        if (extractedSector) result.location = `Sector ${extractedSector}`;"""

content = content.replace(target_apply, replace_apply)

# We should also replace `{ houseNo: extracted, cleanedAddress: cleanedAddress }` with `{ houseNo: extracted, extractedSector: null, cleanedAddress: cleanedAddress }` 
# in `_extractHouseNoAndClean` to be perfectly consistent, though it's optional in JS.
target_return = """        return { houseNo: extracted, cleanedAddress: cleanedAddress };"""
replace_return = """        return { houseNo: extracted, extractedSector: null, cleanedAddress: cleanedAddress };"""
content = content.replace(target_return, replace_return)


with open(file_path, "w") as f:
    f.write(content)

print("Patched AddressParsingService.js!")
