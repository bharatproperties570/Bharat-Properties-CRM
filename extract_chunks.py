import json

with open("stage_page_edits.txt", "r") as f:
    lines = f.readlines()

output = []
for idx, line in enumerate(lines):
    try:
        data = json.loads(line.strip())
        if 'tool_calls' in data:
            for call in data['tool_calls']:
                if call['name'] in ['replace_file_content', 'multi_replace_file_content']:
                    args = call['args']
                    if isinstance(args, str): args = json.loads(args)
                    if 'StagePage.jsx' in args.get('TargetFile', ''):
                        if call['name'] == 'replace_file_content':
                            output.append(f"--- Chunk {idx} ---\n" + args['ReplacementContent'])
                        elif call['name'] == 'multi_replace_file_content':
                            for i, chunk in enumerate(args.get('ReplacementChunks', [])):
                                output.append(f"--- Chunk {idx}.{i} ---\n" + chunk['ReplacementContent'])
    except:
        pass

with open("extracted_chunks.jsx", "w") as f:
    f.write("\n\n".join(output))
print("Extracted", len(output), "chunks")
