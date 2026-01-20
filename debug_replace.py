
import os

file_path = '/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddContactModal.jsx'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Ranges to replace (1-based inclusive, so need to convert to 0-based exclusive)
# Reverse order is ensuring indices don't shift for subsequent operations

# ContactDetails: 2256 to 2381
# 0-based: 2255 to 2381 (exclusive? No, 2381 is the line to delete. So 2255:2381)
# 1-based start 2256 -> index 2255.
# 1-based end 2381 -> index 2380.
# slice [2255 : 2381] (since slice end is exclusive, 2381 means up to index 2380)

ranges = [
    (2256, 2381, "                                <div style={{padding: '20px', color: '#666'}}>ContactDetails Tab Debugging...</div>\n"),
    (1942, 2254, "                                <div style={{padding: '20px', color: '#666'}}>Other Tab Debugging...</div>\n"),
    (1472, 1940, "                                <div style={{padding: '20px', color: '#666'}}>Personal Tab Debugging...</div>\n")
]

# Process in reverse order of line number is irrelevant if we just slice correctly?
# No, if we modify the list, indices shift. So MUST do generated list or careful slicing.
# It's better to just do it in descending order of start_line.
ranges.sort(key=lambda x: x[0], reverse=True)

for start, end, replacement in ranges:
    # Convert 1-based to 0-based
    # Start: 1472 -> index 1471
    # End: 1940 -> index 1939 (We want to delete this line too)
    # Slice: [1471 : 1940] (end+1? No. line 1940 is at index 1939. slice ends at 1940)
    
    start_idx = start - 1
    end_idx = end  # Python slice end is exclusive, so `end` covers up to `end - 1`
    
    print(f"Replacing lines {start} to {end} (indices {start_idx}:{end_idx})")
    print(f"Original content start: {lines[start_idx].strip()}")
    print(f"Original content end: {lines[end_idx-1].strip()}")
    
    lines[start_idx:end_idx] = [replacement]

with open(file_path, 'w') as f:
    f.writelines(lines)

print("Updates complete.")
