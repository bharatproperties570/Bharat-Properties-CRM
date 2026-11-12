/**
 * WorkerHeartbeat Model
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks live health of BullMQ workers for operational monitoring.
 */
import mongoose from 'mongoose';

const HEALTH_STATUSES = ['healthy', 'slow', 'stalled', 'offline', 'shutting_down'];

const workerHeartbeatSchema = new mongoose.Schema({
  workerId:           { type: String, required: true, unique: true, index: true },
  workerType:         { type: String, required: true },
  hostname:           { type: String },
  processId:          { type: Number },
  queueName:          { type: String, index: true },
  startedAt:          { type: Date, default: Date.now },
  lastHeartbeatAt:    { type: Date, default: Date.now, index: true },
  currentJobId:       { type: String },
  currentOperationId: { type: mongoose.Schema.Types.ObjectId, ref: 'OperationsJob' },
  activeConcurrency:  { type: Number, default: 0 },
  completedJobs:      { type: Number, default: 0 },
  failedJobs:         { type: Number, default: 0 },
  workerVersion:      { type: String, default: '1.0.0' },
  healthStatus:       { type: String, enum: HEALTH_STATUSES, default: 'healthy' },
  metadata:           { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'workerheartbeats'
});

// TTL: auto-expire entries with no heartbeat for 5 minutes
workerHeartbeatSchema.index({ lastHeartbeatAt: 1 }, { expireAfterSeconds: 300 });

export { HEALTH_STATUSES };
const WorkerHeartbeat = mongoose.model('WorkerHeartbeat', workerHeartbeatSchema);
export default WorkerHeartbeat;
