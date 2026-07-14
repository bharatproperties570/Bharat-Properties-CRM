import re

with open('src/context/PropertyConfigContext.jsx', 'r') as f:
    lines = f.readlines()

out_lines = []
activity = ""
purpose = ""

for line in lines:
    # Track activity and purpose based on indentation or keywords if possible
    # We can just look at name: '...'
    m_act = re.search(r"name:\s*'([^']+)'", line)
    if m_act:
        val = m_act.group(1)
        if val in ['Call', 'Email', 'Site Visit', 'Meeting', 'Task', 'WhatsApp']:
            activity = val
        else:
            purpose = val
    
    # Process outcome line
    m_out = re.search(r"(\{\s*label:\s*'([^']+)'.*?stage:\s*'([^']+)'\s*\})", line)
    if m_out:
        full_obj = m_out.group(1)
        label = m_out.group(2)
        stage = m_out.group(3)
        
        forms = []
        if stage == 'Booked':
            forms = ["Booking Form", "KYC Form"]
        elif stage == 'Negotiation':
            forms = ["Offer Form"]
        elif 'Price' in label or 'Quotation' in purpose or 'Quotation' in label:
            forms = ["Quotation Form"]
        elif 'Requirement' in purpose or 'Requirement' in label:
            forms = ["Requirement Form"]
        elif activity == 'Site Visit' and stage in ['Opportunity', 'Qualified']:
            forms = ["Site Visit Form"]
        elif activity == 'Meeting' and stage in ['Opportunity', 'Qualified']:
            forms = ["Meetings Form"]
            
        if forms:
            if 'requiredForms' not in full_obj:
                forms_str = "['" + "', '".join(forms) + "']"
                new_obj = full_obj.replace(' }', f", requiredForms: {forms_str} }}")
                line = line.replace(full_obj, new_obj)
    
    out_lines.append(line)

with open('src/context/PropertyConfigContext.jsx', 'w') as f:
    f.writelines(out_lines)

print("Updated forms successfully")
