import mongoose from "mongoose";

const AiAgentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    role: { type: String, required: true },
    systemPrompt: { type: String, required: true },
    useCases: [{ type: String }],
    memoryAccess: [{ type: String }],
    isActive: { type: Boolean, default: true },
    provider: { type: String, default: 'openai' },
    modelName: { type: String, default: 'gpt-4o' }
}, { timestamps: true });

export default mongoose.model("AiAgent", AiAgentSchema);
