const matches = (inventoryId) => ['inventory', 'match', { inventoryId }];
const params = { inventoryId: '123' };
console.log(matches(params));
