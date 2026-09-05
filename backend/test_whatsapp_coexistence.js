// Mock testing for Coexistence
import { extractCoexistenceChanges } from './utils/whatsappWebhook.utils.js';

const mockWebhook = {
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WABA_ID_123",
      "changes": [
        {
          "field": "smb_message_echoes",
          "value": {
            "metadata": { "phone_number_id": "PHONE_ID_123" },
            "message_echoes": [
              {
                "id": "wamid.123",
                "from": "919999999999",
                "to": "918888888888",
                "timestamp": "1725510000",
                "type": "text",
                "text": { "body": "Echo Message" }
              }
            ]
          }
        },
        {
          "field": "messages",
          "value": {
            "messages": [{ "id": "wamid.456" }]
          }
        }
      ]
    }
  ]
};

const changes = extractCoexistenceChanges(mockWebhook);
console.log("Extracted Coexistence Changes:", JSON.stringify(changes, null, 2));

if (changes.length !== 1 || changes[0].field !== 'smb_message_echoes') {
  console.error("FAILED to extract coexistence changes properly");
  process.exit(1);
} else {
  console.log("Test Passed: Extraction isolated successfully.");
}
