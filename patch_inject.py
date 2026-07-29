import os

files_to_patch = [
    "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddDealModal.jsx",
    "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Leads/views/LeadMatchingPage.jsx",
    "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Inventory/views/InventoryMatchingPage.jsx"
]

for file_path in files_to_patch:
    if not os.path.exists(file_path):
        print(f"Skipping {file_path} (not found)")
        continue
    
    with open(file_path, "r") as f:
        content = f.read()

    # In LeadMatchingPage and InventoryMatchingPage, it looks like this:
    # <SendMessageModal isOpen={isMessageOpen} onClose={() => setIsMessageOpen(false)} initialRecipients={recipients} initialTemplateId={initialTemplateId} initialChannel={initialChannel} initialProperties={selectedProperties} onSend={() => setIsMessageOpen(false)} />
    # We will just replace "<SendMessageModal " with "<SendMessageModal triggerContext='deal_match' "
    
    # We only want to patch instances that are actually components, not imports
    content = content.replace("<SendMessageModal ", "<SendMessageModal triggerContext='deal_match' ")
    content = content.replace("<SendMessageModal\n", "<SendMessageModal triggerContext='deal_match'\n")

    with open(file_path, "w") as f:
        f.write(content)

print("Injected triggerContext into all messaging modal usages.")
