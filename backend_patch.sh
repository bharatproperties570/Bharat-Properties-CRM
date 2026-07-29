#!/bin/bash
TARGET_DIR="/home/ubuntu/bharat-properties-crm/backend/controllers"

sed -i "s/'New', 'Prospect', 'Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won', 'Closed Lost', 'Stalled'/'Incoming', 'Prospect', 'Opportunity', 'Negotiation', 'Closed (Won)', 'Closed (Lost)', 'Closed (Unqualified)'/g" $TARGET_DIR/stage.controller.js
sed -i "s/'Open', 'Quote', 'Negotiation', 'Booked', 'Closed', 'Stalled', 'Dormant'/'Incoming', 'Prospect', 'Opportunity', 'Negotiation', 'Closed (Won)', 'Closed (Lost)', 'Closed (Unqualified)'/g" $TARGET_DIR/stage.controller.js

sed -i "s/targetStages = \['Qualified', 'Opportunity', 'Negotiation', 'Booked', 'Closed Won'\]/targetStages = ['Prospect', 'Opportunity', 'Negotiation', 'Closed (Won)']/g" $TARGET_DIR/lead.controller.js
sed -i "s/targetStages = \['Prospect', 'Qualified'\]/targetStages = ['Prospect']/g" $TARGET_DIR/lead.controller.js
sed -i "s/targetStages = \['Negotiation', 'Booked'\]/targetStages = ['Negotiation', 'Closed (Won)']/g" $TARGET_DIR/lead.controller.js
sed -i "s/lookup_value: { \$regex: \/\^Dormant\$\/i }/lookup_value: { \$regex: \/\^Closed \(Lost\)\$\/i }/g" $TARGET_DIR/lead.controller.js
sed -i "s/Incoming(1) -> Prospect(2) -> Qualified(3) -> Opportunity(4) -> Negotiation(5) -> Booked(6) -> Closed Won(7)/Incoming(1) -> Prospect(2) -> Opportunity(3) -> Negotiation(4) -> Closed (Won)(5)/g" $TARGET_DIR/lead.controller.js

sed -i "s/status === 'New'/status === 'Incoming'/gi" $TARGET_DIR/activity.controller.js
sed -i "s/lookup_value: \/New\/i/lookup_value: \/Incoming\/i/g" $TARGET_DIR/activity.controller.js

sed -i "s/existingContact.stage || 'New'/existingContact.stage || 'Incoming'/g" $TARGET_DIR/contact.controller.js
sed -i "s/item.stage || 'New'/item.stage || 'Incoming'/g" $TARGET_DIR/contact.controller.js
sed -i "s/findLookupIds(\/\^Booked\$\/i, 'Stage')/findLookupIds(\/\^Negotiation\$\/i, 'Stage')/g" $TARGET_DIR/contact.controller.js

sed -i "s/findLookupIds(\/\^Qualified\$\/i, 'Status')/findLookupIds(\/\^Prospect\$\/i, 'Stage')/g" $TARGET_DIR/lead.controller.js
sed -i "s/type: 'Status', value: { \$regex: \/\^Qualified\$\/i }/type: 'Stage', value: { \$regex: \/\^Prospect\$\/i }/g" $TARGET_DIR/lead.controller.js
