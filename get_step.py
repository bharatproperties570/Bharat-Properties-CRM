import json
import sys

log_file = '/Users/bharatproperties/.gemini/antigravity/brain/9c9ecb84-4d5d-45a9-afe5-d919e89194bb/.system_generated/logs/transcript_full.jsonl'
step_idx = int(sys.argv[1])
with open(log_file, 'r') as f:
    for line in f:
        try:
            step = json.loads(line)
            if step.get('step_index') == step_idx:
                print(json.dumps(step, indent=2))
                break
        except:
            pass
