import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/backend/controllers/lead.controller.js"

with open(file_path, "r") as f:
    content = f.read()

search_logic = """export const matchLeads = async (req, res) => {
    try {
        const {
            dealId,
            budgetFlexibility = 20,
            sizeFlexibility = 20,
            showOtherCities: showOtherCitiesParam
        } = req.query;

        const showOtherCities = showOtherCitiesParam === 'true';

        if (!dealId) {
            return res.status(400).json({ success: false, error: "dealId is required" });
        }"""

replace_logic = """export const matchLeads = async (req, res) => {
    try {
        const {
            dealId,
            budgetFlexibility = 20,
            sizeFlexibility = 20,
            showOtherCities: showOtherCitiesParam
        } = req.query;

        const showOtherCities = showOtherCitiesParam === 'true';
        let deal;

        if (req.method === 'POST' && req.body && req.body.deal) {
            deal = req.body.deal;
        } else if (dealId) {
            deal = await Deal.findById(dealId).populate('inventoryId').lean();
            if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
        } else {
            return res.status(400).json({ success: false, error: "dealId or deal data is required" });
        }"""

content = content.replace(search_logic, replace_logic)


search_deal_fetch = """        const deal = await Deal.findById(dealId).populate('inventoryId').lean();
        if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });"""

content = content.replace(search_deal_fetch, "        // deal is already populated above")

with open(file_path, "w") as f:
    f.write(content)

print("Backend matchLeads Patching complete.")
