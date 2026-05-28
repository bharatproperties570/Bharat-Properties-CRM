import connectDB from "./src/config/db.js";
import mongoose from "mongoose";
import Intake from "./models/Intake.js";
import connectorRegistry from "./services/intakeConnectors/ConnectorRegistry.js";
import aiVerificationEngine from "./services/intakeVerification/AIVerificationEngine.js";
import intakeAIAssistantEngine from "./services/intakeVerification/IntakeAIAssistantEngine.js";

async function processAll() {
    await connectDB();
    console.log("Connected to database. Fetching queued/raw intakes...");

    const queuedIntakes = await Intake.find({ status: { $in: ["Queued", "Raw Received", "Processing", "Failed"] } });
    console.log(`Found ${queuedIntakes.length} intakes to process.`);

    let successCount = 0;
    let failCount = 0;

    for (const intake of queuedIntakes) {
        try {
            console.log(`Processing intake ${intake._id} (source: ${intake.source}, type: ${intake.source_type})...`);
            
            const sourceType = intake.source_type || 'other';
            const connector = connectorRegistry.getConnector(sourceType);
            
            // Reconstruct raw data payload
            const rawData = intake.raw_source_data || { text: intake.content, source: intake.source };
            
            const normalizedData = await connector.process(rawData);
            Object.assign(intake, normalizedData);

            const verificationResult = await aiVerificationEngine.verify(intake);
            Object.assign(intake, verificationResult);

            const aiAssistantResult = intakeAIAssistantEngine.analyze(intake);
            intake.ai_assistant = aiAssistantResult;

            intake.status = 'Processed';
            await intake.save();
            console.log(`Successfully processed intake ${intake._id}`);
            successCount++;
        } catch (err) {
            console.error(`Failed to process intake ${intake._id}:`, err);
            try {
                intake.status = 'Failed';
                intake.error_log.push({
                    message: err.message.substring(0, 1000),
                    stack: (err.stack || '').substring(0, 2000)
                });
                
                if (err.message.includes("BSONObj size") || err.message.includes("invalid size")) {
                    intake.description = (intake.description || '').substring(0, 1000);
                    intake.content = (intake.content || '').substring(0, 1000);
                    intake.raw_source_data = undefined;
                    intake.extracted_entities = undefined;
                }
                
                await intake.save();
            } catch (saveErr) {
                console.error(`Fatal error: Could not even save failed status for ${intake._id}:`, saveErr);
            }
            failCount++;
        }
    }

    console.log(`All done! Processed successfully: ${successCount}, Failed: ${failCount}`);
    process.exit(0);
}

processAll();
