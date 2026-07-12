import re

filepath = 'backend/routes/stage.routes.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

import_stmt = "import { getHealth, getFailedTransitions, dryRunTest } from '../controllers/stageEngine.controller.js';\n"
if 'getHealth' not in content:
    content = content.replace("import { authenticate }", import_stmt + "import { authenticate }")

new_routes = """
// ── Observability ────────────────────────────────────────────────────────────
// GET /api/stage-engine/health
router.get('/health', getHealth);

// GET /api/stage-engine/failed
router.get('/failed', getFailedTransitions);

// POST /api/stage-engine/test
router.post('/test', dryRunTest);
"""

if 'router.get(\'/health\', getHealth)' not in content:
    content = content.replace("export default router;", new_routes + "\nexport default router;")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Routes patched successfully")
else:
    print("Routes already patched")
