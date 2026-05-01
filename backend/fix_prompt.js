import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import AiAgent from './models/AiAgent.js';

async function fix() {
    await mongoose.connect(process.env.MONGODB_URI);
    const agent = await AiAgent.findById('69cb4b37318d2bdeba25c174');
    if (agent) {
        let prompt = agent.systemPrompt;
        
        // 1. Rename the section to clarify it's for BUYERS only
        prompt = prompt.replace(/🔹 PROPERTY SHARING RULES:/, '🔹 PROPERTY SHARING RULES (FOR BUYERS ONLY):');
        
        // 2. Explicitly allow asking for Unit Number from Sellers
        prompt = prompt.replace(/❌ Unit number kabhi share nahi karna initially/, '❌ BUYER ko unit number kabhi share nahi karna initially.\n✅ SELLER se Unit Number hamesha puchna hai internal record ke liye.');
        
        // 3. Update the Seller Flow logic
        const sellerLogic = `
━━━━━━━━━━━━━━━━━━━
🔹 SELLER HANDLING FLOW (CRITICAL):

If customer wants to SELL property:
1. "Kaunse project ya sector mein property hai?"
2. "Unit / Plot number kya hai?"
3. "Expected price kya socha hai?"

❗IMPORTANT: SELLER se Unit Number puchna mandatory hai. Privacy Rule sirf BUYER ke liye hai. Seller ke case mein humein record matching ke liye Number chahiye hi chahiye.
`;
        // Replace the existing seller handling section or append if not found
        if (prompt.includes('🔹 SELLER HANDLING FLOW')) {
             prompt = prompt.replace(/🔹 SELLER HANDLING FLOW[\s\S]*?❗Note: Jab aapke paas Project aur Unit number aa jaye, toh Size ya Location mat puchna kyunki wo hamare Inventory database mein hai. Seedha Price pucho./, sellerLogic);
        } else {
            prompt += sellerLogic;
        }

        agent.systemPrompt = prompt;
        await agent.save();
        console.log("Successfully fixed the Buyer/Seller Privacy conflict.");
    }
    process.exit(0);
}

fix();
