import varService from './services/VariableResolutionService.js';
const map = varService.resolveNamed({ lead: { _id: '12345' } });
console.log('Token:', map.siteVisitToken);
