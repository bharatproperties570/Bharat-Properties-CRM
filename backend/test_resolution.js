import VariableResolutionService from './services/VariableResolutionService.js';
import mongoose from 'mongoose';

const enrichedContext = {
    fullName: 'Test Broker',
    firstName: 'Test',
    hideUnit: false,
    hidePrice: false,
    matchedProperties: [
        {
            inventoryId: {
                projectName: 'Super Project 1',
                sector: 'Sector 50',
                price: { value: 15000000 },
                size: { value: 1200, unit: 'Sq.Ft.' },
                unitNo: 'A-101',
                latitude: 28.5,
                longitude: 77.2
            },
            price: 15000000
        },
        {
            inventoryId: {
                projectName: 'Mega Project 2',
                sector: 'Sector 60',
                price: { value: 25000000 },
                size: { value: 1500, unit: 'Sq.Ft.' },
                unitNo: 'B-202',
                latitude: 28.6,
                longitude: 77.3
            },
            price: 25000000
        }
    ]
};

const mapping = {
    "1": "customer_name",
    "2": "property_list_detailed"
};

const result = VariableResolutionService.resolveForLeads(enrichedContext, mapping);
console.log(result);
