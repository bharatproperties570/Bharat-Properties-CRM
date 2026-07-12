import re

filepath = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/controllers/lead.controller.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
import_stmt = "import { checkLeadQualifiedStatus } from '../utils/leadDataCompleteness.js';\n"
if 'checkLeadQualifiedStatus' not in content:
    content = content.replace("import Lead from '../models/Lead.js';", import_stmt + "import Lead from '../models/Lead.js';")

# Find where finalLead is fetched
target = "const finalLead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate(leadPopulateFields);"
replacement = """const finalLead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate(leadPopulateFields);

        // 🧠 DATA COMPLETENESS AUTO-QUALIFICATION
        if (finalLead && checkLeadQualifiedStatus(finalLead)) {
            const qualifiedStatusLookup = await Lookup.findOne({ type: 'Status', value: { $regex: /^Qualified$/i } });
            if (qualifiedStatusLookup) {
                const isCurrentlyQualified = finalLead.status && finalLead.status._id && finalLead.status._id.toString() === qualifiedStatusLookup._id.toString();
                if (!isCurrentlyQualified) {
                    finalLead.status = qualifiedStatusLookup._id;
                    await Lead.findByIdAndUpdate(finalLead._id, { status: qualifiedStatusLookup._id });
                }
            }
        }
"""

if "DATA COMPLETENESS AUTO-QUALIFICATION" not in content:
    content = content.replace(target, replacement)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Lead controller patched successfully")
else:
    print("Lead controller already patched")
