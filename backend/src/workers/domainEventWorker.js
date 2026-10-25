// Re-export the composed domainEventWorker from the trusted bootstrap boundary
export { domainEventWorker } from '../../utils/ServerAuthorityProof.js';
export { processDomainEventJob as processDomainEvent } from './domainEventWorkerLogic.js';
