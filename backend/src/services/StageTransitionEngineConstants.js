export const DEFAULT_STAGE_RULES = [
    { id: 'sv_int_opp', activityType: 'Site Visit', outcome: 'Interested', newStage: 'Opportunity', requiredFields: ['budget', 'timeline'], priority: 10, active: true },
    { id: 'meet_int_opp', activityType: 'Meeting', outcome: 'Interested', newStage: 'Opportunity', requiredFields: ['budget', 'timeline'], priority: 9, active: true },
    { id: 'call_int_work', activityType: 'Call', outcome: 'Interested', newStage: 'Working', requiredFields: [], priority: 8, active: true },
    { id: 'sv_neg_neg', activityType: 'Site Visit', outcome: 'Negotiation', newStage: 'Negotiation', requiredFields: ['budgetMin', 'budgetMax'], priority: 11, active: true },
    { id: 'meet_neg_neg', activityType: 'Meeting', outcome: 'Negotiation', newStage: 'Negotiation', requiredFields: ['budgetMin', 'budgetMax'], priority: 10, active: true },
    { id: 'any_ni_dorm', activityType: '*', outcome: 'Not Interested', newStage: 'Dormant', requiredFields: [], priority: 1, active: true },
    { id: 'any_nr_stalled', activityType: '*', outcome: 'No Response', newStage: 'Stalled', requiredFields: [], priority: 1, active: true },
    { id: 'any_booked', activityType: '*', outcome: 'Booked', newStage: 'Booked', requiredFields: ['bookingAmount', 'bookingDate'], priority: 100, active: true },
    { id: 'any_lost', activityType: '*', outcome: 'Lost', newStage: 'Lost', requiredFields: [], priority: 1, active: true },
    { id: 'any_unqualified', activityType: '*', outcome: 'Unqualified', newStage: 'Unqualified', requiredFields: [], priority: 1, active: true }
];
