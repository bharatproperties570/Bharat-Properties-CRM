import re

with open('src/context/PropertyConfigContext.jsx', 'r') as f:
    content = f.read()

# Clean up the useMemo block
value_obj_regex = re.compile(r'    const value = React\.useMemo\(\(\) => \(\{(.*?)\}\), \[(.*?)\]\);', re.DOTALL)
match = value_obj_regex.search(content)

if match:
    obj_content = match.group(1)
    
    # We just need to reliably extract all keys from the object content
    # Remove all comments
    no_comments = re.sub(r'//.*', '', obj_content)
    
    # Extract keys
    keys = [k.strip() for k in no_comments.split(',') if k.strip()]
    
    deps_string = ", ".join(keys)
    
    new_value = f'    const value = React.useMemo(() => ({{{obj_content}}}), [{deps_string}]);'
    content = content.replace(match.group(0), new_value)
    
    with open('src/context/PropertyConfigContext.jsx', 'w') as f:
        f.write(content)
    print(f"Formatted successfully with {len(keys)} deps.")
else:
    print("Could not find value object")
