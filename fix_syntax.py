with open('src/pages/Leads/LeadsPage.jsx', 'r') as f:
    lines = f.readlines()

# delete lines 1775 to 1789 (0-indexed 1774 to 1789, because slice end is exclusive)
del lines[1774:1789]

with open('src/pages/Leads/LeadsPage.jsx', 'w') as f:
    f.writelines(lines)
