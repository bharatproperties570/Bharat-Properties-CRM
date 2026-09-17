# STEP_15_R14_R14_MINIMAL_DIFF_AUDIT

## 1. WORKTREE VERIFICATION
- **Directory**: `/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm-r14`
- **HEAD Commit**: `9b0ddc19f3d91bc236a6f36c7174bd282f65a675`
- **Clean Status**:
  ```
   M backend/models/AutomationLog.js
   M backend/src/workers/cronWorker.js
  ?? STEP_15_R14_R13_RECONSTRUCTION_AUDIT.md
  ```
  *(Verified isolated baseline)*

## 2. EXACT R14 DIFF
**`backend/models/AutomationLog.js`**:
```diff
--- a/backend/models/AutomationLog.js
+++ b/backend/models/AutomationLog.js
@@ -1,11 +1,16 @@
 import mongoose from 'mongoose';
 
 const AutomationLogSchema = new mongoose.Schema({
-    ruleType: { type: String, enum: ['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule'], required: true },
-    ruleId: { type: mongoose.Schema.Types.ObjectId, required: true },
+    ruleType: { type: String, enum: ['Trigger', 'Sequence', 'AutomatedAction', 'ScoringRule', 'DomainEvent', 'LeadCreationRequest'], required: true },
+    ruleId: { 
+        type: mongoose.Schema.Types.ObjectId, 
+        required: function() {
+            return !['DomainEvent', 'LeadCreationRequest'].includes(this.ruleType);
+        }
+    },
     targetEntityId: { type: mongoose.Schema.Types.ObjectId, required: true }, // e.g. Lead ID, Deal ID
     targetModule: { type: String, required: true },
-    status: { type: String, enum: ['success', 'failed', 'pending'], default: 'success' },
+    status: { type: String, enum: ['success', 'failed', 'pending', 'processing'], default: 'success' },
     details: mongoose.Schema.Types.Mixed, // Stores error messages or execution results
     idempotencyKey: { type: String, unique: true, sparse: true, index: true }, // Prevents duplicate execution
     executedAt: { type: Date, default: Date.now },
```

**`backend/src/workers/cronWorker.js`**:
```diff
--- a/backend/src/workers/cronWorker.js
+++ b/backend/src/workers/cronWorker.js
@@ -1,5 +1,6 @@
 import { Worker } from '../config/redis.js';
 import redisConnection from '../config/redis.js';
+import AutomationLog from '../../models/AutomationLog.js';
 import Lead from '../../models/Lead.js';
 import Lookup from '../../models/Lookup.js';
 import Activity from '../../models/Activity.js';
@@ -11,6 +11,73 @@
 const workerOptions = { connection: redisConnection };
 
 export const cronWorker = new Worker('cronQueue', async (job) => {
+    if (job.name === 'sweepPendingDistributionEvents') {
+        console.log('[Cron Worker] Sweeping pending distribution events...');
+        const AutomationLog = (await import('../../models/AutomationLog.js')).default;
+        const { distributionQueue } = await import('../queues/queueManager.js');
+
+        // Find events that are pending for more than 5 minutes
+        const cutoff = new Date(Date.now() - 5 * 60 * 1000);
+        
+        // Recover stalled 'processing' LeadDistribution events back to 'pending'
+        await AutomationLog.updateMany({
+            targetModule: 'LeadDistribution',
+            status: 'processing',
+            executedAt: { $lt: cutoff }
+        }, { $set: { status: 'pending' } });
+
+        // Recover stalled 'processing' DomainEvent & LeadCreationRequest events back to 'pending'
+        await AutomationLog.updateMany({
+            ruleType: { $in: ['DomainEvent', 'LeadCreationRequest'] },
+            status: 'processing',
+            executedAt: { $lt: cutoff }
+        }, { $set: { status: 'pending' } });
+
+        // 1. Sweep stalled distributions
+        const pendingEvents = await AutomationLog.find({
+            targetModule: 'LeadDistribution',
+            status: 'pending',
+            executedAt: { $lt: cutoff }
+        }).lean();
+
+        let sweptCount = 0;
+        for (const event of pendingEvents) {
+            console.log(`[Cron Worker] Sweeping stalled distribution event ${event.idempotencyKey}`);
+            
+            const jobName = event.idempotencyKey.startsWith('PendingDistribution:') 
+                ? 'process_pending_distribution' 
+                : 'process_durable_event';
+                
+            await distributionQueue.add(jobName, { 
+                idempotencyKey: event.idempotencyKey 
+            }, { 
+                jobId: event.idempotencyKey,
+                removeOnComplete: true 
+            });
+            sweptCount++;
+        }
+
+        // 2. Sweep stalled DomainEvents
+        const pendingDomainEvents = await AutomationLog.find({
+            ruleType: 'DomainEvent',
+            status: 'pending',
+            executedAt: { $lt: cutoff }
+        }).lean();
+
+        for (const event of pendingDomainEvents) {
+            console.log(`[Cron Worker] Sweeping stalled DomainEvent ${event.idempotencyKey}`);
+            
+            await distributionQueue.add('process_domain_event', { 
+                idempotencyKey: event.idempotencyKey 
+            }, { 
+                jobId: event.idempotencyKey,
+                removeOnComplete: true 
+            });
+            sweptCount++;
+        }
+        
+        return { sweptCount };
+    }
     console.log(`[Cron Worker] Executing scheduled job: ${job.name}`);
```

## 3. AUTOMATIONLOG AUDIT
- **ruleType additions:** `DomainEvent` and `LeadCreationRequest` are strictly present.
- **status addition:** `processing` is strictly present.
- **ruleId conditional validation:** Dynamically evaluates `!['DomainEvent', 'LeadCreationRequest'].includes(this.ruleType)`. 
- **Integrity:** Verified that no unrelated schema behavior or defaults were modified.

## 4. CRON RECOVERY AUDIT
- **Crash Recovery:** Successfully reverts `processing` `DomainEvent` logs older than 5 minutes to `pending`.
- **LeadCreationRequest Recovery:** It is correctly included in the `processing` -> `pending` recovery `updateMany`. This enables the synchronous API request (`LeadCreationEngine`) to retry idempotency if a previous thread crashed.
- **Distribution Exclusion:** Crucially, `LeadCreationRequest` is perfectly excluded from the actual `distributionQueue.add` loop, as the dispatch sweep explicitly queries only `ruleType: 'DomainEvent'`. 

## 5. SWEEP DEPENDENCY AUDIT
- **Callers:** The `sweepPendingDistributionEvents` block is invoked by BullMQ running the cron job queue.
- **Reads:** It queries `AutomationLog` for `targetModule: 'LeadDistribution'` and `ruleType: 'DomainEvent'`.
- **Expects:** It expects `status` to be exactly `processing` or `pending`.
- **Necessity:** Required for R14 recovery, but entirely absent from the baseline `cronWorker.js`. 
- **Conclusion:** By adding this block, R14 is effectively importing a massive chunk of Phase 5.x distribution durability architecture that doesn't belong in a schema hotfix.

## 6. MINIMUM-SCOPE TEST
**Classification: C. REQUIRED ONLY BECAUSE ANOTHER PHASE 5 CHANGE IS ALSO BEING PORTED**
- The reconstructed `cronWorker.js` diff silently absorbs Phase 5 `sweepPendingDistributionEvents` logic.
- R14 must be strictly refined. It should not secretly install the Phase 5 outbox pattern. 
- **Recommendation:** R14 should exclusively deliver the `AutomationLog.js` schema fixes. The `cronWorker.js` recovery logic must be explicitly treated as a separate Phase 5 architectural dependency PR.

## 7. FILE SCOPE
- `backend/src/modules/deal/DealCreationEngine.js`
- `backend/utils/redisLock.js`
- `backend/src/utils/inventorySync.js`
- `backend/models/Deal.js`
- `backend/controllers/deal.controller.js`
**Determination:** All of these files are part of earlier Enterprise Phase 5 work. They are NOT required for the R14 schema/recovery contract hotfix. They have correctly been excluded from the R14 clean worktree.

## 8. CHECK CURRENT WORKTREE
- **Status:** `M backend/models/AutomationLog.js`, `M backend/src/workers/cronWorker.js`
- **Diff Stat:**
  ```
   backend/models/AutomationLog.js   | 11 +++++--
   backend/src/workers/cronWorker.js | 68 +++++++++++++++++++++++++++++++++++++++
   2 files changed, 76 insertions(+), 3 deletions(-)
  ```
- **Name Only:**
  ```
  backend/models/AutomationLog.js
  backend/src/workers/cronWorker.js
  ```
  *(Explicitly isolated scope)*

## 9. NO RUNTIME CLAIMS
Static syntax validation confirms code validity, but NO claims are made regarding production functionality, runtime correctness, transaction integrity, or exactly-once delivery.

========================================================
FINAL VERDICT
========================================================
R14_SCOPE_REQUIRES_REFINEMENT
