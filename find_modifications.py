import json

log_file = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/logs/transcript_full.jsonl'
with open(log_file, 'r') as f:
    for line in f:
        try:
            step = json.loads(line)
            if 'tool_calls' in step:
                for call in step['tool_calls']:
                    if call['name'] == 'run_command':
                        cmd = call['args'].get('CommandLine', '')
                        if 'src/utils/crmHooks.js' in cmd:
                            if 'sed ' in cmd or 'patch ' in cmd or 'python' in cmd:
                                print(f"Step {step['step_index']}: {cmd[:100]}")
                    elif call['name'] == 'replace_file_content':
                        if 'src/utils/crmHooks.js' in call['args'].get('TargetFile', ''):
                            print(f"Step {step['step_index']}: replace_file_content")
        except:
            pass
