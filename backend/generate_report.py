import json

with open('/home/ubuntu/bharat-properties-crm/backend/db_audit_report.json') as f:
    audit = json.load(f)

# Hardcoded classifications based on name and schema
classifications = {
    'users': 'Core CRM', 'teams': 'Core CRM', 'roles': 'Core CRM', 'companies': 'Core CRM',
    'leads': 'Core CRM', 'contacts': 'Core CRM', 'deals': 'Transactional', 'bookings': 'Transactional',
    'portfolios': 'Post Sale', 'inventories': 'Core CRM', 'projects': 'Core CRM',
    'activities': 'Core CRM', 'conversations': 'Communication', 'smslogs': 'Communication',
    'notifications': 'System', 'auditlogs': 'Analytics', 'lookups': 'Reference/Lookup',
    'systemsettings': 'System'
}

print("### A. Complete Collection Inventory")
print("| Collection | Approx Count | Avg Size (bytes) | Total Size (bytes) | Classification |")
print("| :--- | :--- | :--- | :--- | :--- |")

for name, stats in sorted(audit.items()):
    cls = classifications.get(name, 'Unknown')
    print(f"| `{name}` | {stats['count']} | {int(stats['avgObjSize'])} | {stats['size']} | {cls} |")

print("\n### B. Index Audit (Top 10)")
for name, stats in sorted(audit.items()):
    if stats['count'] > 0 and len(stats['indexes']) > 1:
        print(f"**{name}**")
        for idx in stats['indexes']:
            print(f"- {idx}")

