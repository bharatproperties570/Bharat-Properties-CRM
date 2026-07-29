import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/pages/Settings/views/MessagingSettingsPage.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Add deal_match to systemContext options
target_contexts = """                    {[
                        { value: 'lead_match_full', label: 'Lead Match (Full Details)' },
                        { value: 'lead_match_short', label: 'Lead Match (Short Details)' },
                        { value: 'marketing_blast', label: 'Marketing Blast' },
                        { value: 'welcome', label: 'Welcome/Auto-Reply' }
                    ].map(ctx => {"""

replace_contexts = """                    {[
                        { value: 'lead_match_full', label: 'Lead Match (Full Details)' },
                        { value: 'lead_match_short', label: 'Lead Match (Short Details)' },
                        { value: 'deal_match', label: 'Deal Match (Auto-Dispatch & Centre)' },
                        { value: 'marketing_blast', label: 'Marketing Blast' },
                        { value: 'welcome', label: 'Welcome/Auto-Reply' }
                    ].map(ctx => {"""

content = content.replace(target_contexts, replace_contexts)

# 2. Add enforcement logic in handleSaveTemplate
target_save = """                let updatedList;
                setAllTemplates(prev => {
                    const currentList = prev[templateType];
                    if (data.id) {
                        updatedList = currentList.map(t => t.id === data.id ? savedData : t);
                    } else {
                        updatedList = [...currentList, { ...savedData, id: `local_${Date.now()}` }];
                    }
                    return { ...prev, [templateType]: updatedList };
                });"""

replace_save = """                let updatedList;
                setAllTemplates(prev => {
                    const currentList = prev[templateType];
                    
                    // 🚨 ENFORCEMENT LOGIC: 1-to-1 mapping for deal_match
                    let sanitizedList = [...currentList];
                    if (savedData.systemContext?.includes('deal_match')) {
                        let strippedCount = 0;
                        sanitizedList = sanitizedList.map(t => {
                            if (t.id !== data.id && t.systemContext?.includes('deal_match')) {
                                strippedCount++;
                                return {
                                    ...t,
                                    systemContext: t.systemContext.filter(ctx => ctx !== 'deal_match')
                                };
                            }
                            return t;
                        });
                        if (strippedCount > 0) {
                            setTimeout(() => {
                                toast.success(`Deal Match context was removed from ${strippedCount} other template(s) in this channel.`);
                            }, 500);
                        }
                    }

                    if (data.id) {
                        updatedList = sanitizedList.map(t => t.id === data.id ? savedData : t);
                    } else {
                        updatedList = [...sanitizedList, { ...savedData, id: `local_${Date.now()}` }];
                    }
                    return { ...prev, [templateType]: updatedList };
                });"""

content = content.replace(target_save, replace_save)

with open(file_path, "w") as f:
    f.write(content)

print("MessagingSettingsPage.jsx patched successfully.")
