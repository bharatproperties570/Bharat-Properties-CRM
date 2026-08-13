import { EventEmitter } from 'events';

class AutomationEventBus extends EventEmitter {}

// Global singleton
const eventBus = new AutomationEventBus();

export default eventBus;
