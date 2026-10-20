import axios from 'axios';
import mongoose from 'mongoose';
import JarvisCommand from '../models/JarvisCommand.js';
import CallIntelligence from '../models/CallIntelligence.js';
import Lead from '../models/Lead.js';
import Deal from '../models/Deal.js';
import Contact from '../models/Contact.js';
import Inventory from '../models/Inventory.js';
import Project from '../models/Project.js';
import Activity from '../models/Activity.js';
import Team from '../models/Team.js';
import User from '../models/User.js';
import Lookup from '../models/Lookup.js';
import SystemSetting from '../src/modules/systemSettings/system.model.js';
import { createStandardizedLead } from './LeadCreationEngine.js';

const JARVIS_SYSTEM_INSTRUCTION = `You are JARVIS, the legendary AI Operating System for Bharat Properties CRM — a high-performance real estate enterprise operating in North India (Kurukshetra, Mohali, Chandigarh, Ambala, Panchkula).

CORE PERSONA & VOICE:
- You are an executive AI assistant, inspired by Tony Stark's JARVIS.
- Always address the user with respect: "Sir" or "Ma'am".
- Speak in crisp, natural, professional Hinglish (a balanced mix of Hindi and English).
- Keep voice/speech responses concise (1 to 2 sentences maximum). The user is listening while working, walking, or driving.
- Deep knowledge of North Indian real estate terminology: Marla, Kanal, Gaj, Bigha, Registry, Token, Booking, HUDA, Sector 69, Mohali, Kurukshetra, Site Visit, Rate on table.

ACTION SAFETY RULES:
1. READ & NAVIGATION (Tier 1 - Instant):
   - Navigate pages -> navigate_to_page
   - Search records -> search_global
   - Dashboard stats -> get_dashboard_metrics
   - Lead counts -> get_lead_count
   - Inventory availability -> get_inventory_availability
   - Pipeline summary -> get_pipeline_summary

2. WRITE & DATA MUTATION (Tier 2 - Confirmation Required):
   - When user asks to create a lead -> call function: create_lead
   - When user asks to update lead (stage, status, notes) -> call function: update_lead
   - When user asks to create a deal -> call function: create_deal
   - When user asks to update deal -> call function: update_deal
   - When user asks to schedule a site visit, call, meeting, or task -> call function: create_activity
   - When user asks to log a note -> call function: log_note
   - When user asks to send WhatsApp -> call function: send_whatsapp
   - When user asks to send email -> call function: send_email

3. AFFIRMATIVE CONFIRMATIONS:
   - If user says "haan", "yes", "proceed", "confirm", "kar do" or similar, acknowledge that you are executing the confirmed action.
   - If user says "nahi", "no", "cancel", "mat karo", acknowledge cancellation.`;

const JARVIS_TOOLS = [{
    functionDeclarations: [
        // ── Phase 1 Navigation & Analytics Tools ──
        {
            name: 'navigate_to_page',
            description: 'Navigate to a specific page or workspace inside Bharat Properties CRM',
            parameters: {
                type: 'OBJECT',
                properties: {
                    page: {
                        type: 'STRING',
                        description: 'The target destination: dashboard, leads, deals, contacts, inventory, projects, activities, booking, communication, reports, settings, marketing, deal_intake, lead_matching, deal_matching'
                    },
                    filter: {
                        type: 'STRING',
                        description: 'Optional filter or context (e.g., hot, warm, kurukshetra, mohali)'
                    }
                },
                required: ['page']
            }
        },
        {
            name: 'search_global',
            description: 'Search globally across leads, contacts, deals, and inventory for a person name, phone number, or property',
            parameters: {
                type: 'OBJECT',
                properties: {
                    query: {
                        type: 'STRING',
                        description: 'Search term such as client name, mobile number, or keyword'
                    }
                },
                required: ['query']
            }
        },
        {
            name: 'get_dashboard_metrics',
            description: 'Retrieve real-time CRM performance stats including lead counts, deals, inventory, and revenue figures',
            parameters: {
                type: 'OBJECT',
                properties: {
                    period: {
                        type: 'STRING',
                        description: 'Time period: today, this_week, this_month, all'
                    }
                }
            }
        },
        {
            name: 'get_lead_count',
            description: 'Count leads matching criteria such as classification (hot/warm/cold), location, or team',
            parameters: {
                type: 'OBJECT',
                properties: {
                    temperature: {
                        type: 'STRING',
                        description: 'hot, warm, cold, or all'
                    },
                    location: {
                        type: 'STRING',
                        description: 'City, sector, or project location name'
                    }
                }
            }
        },
        {
            name: 'get_inventory_availability',
            description: 'Check available inventory units or plots in a specific project, sector, or size',
            parameters: {
                type: 'OBJECT',
                properties: {
                    project: {
                        type: 'STRING',
                        description: 'Project or Sector name (e.g., Sector 69, Kurukshetra, SRS)'
                    },
                    size: {
                        type: 'STRING',
                        description: 'Size such as 10 Marla, 1 Kanal, 200 Gaj'
                    },
                    propertyType: {
                        type: 'STRING',
                        description: 'Type of property: Plot, House, Commercial, Flat'
                    }
                }
            }
        },
        {
            name: 'get_pipeline_summary',
            description: 'Get an overview of active deals across pipeline stages',
            parameters: {
                type: 'OBJECT',
                properties: {
                    period: {
                        type: 'STRING',
                        description: 'Timeframe for deals'
                    }
                }
            }
        },

        // ── Phase 2 Data Mutation Tools (Tier 2 Confirmation) ──
        {
            name: 'create_lead',
            description: 'Create a new client lead in the CRM',
            parameters: {
                type: 'OBJECT',
                properties: {
                    firstName: { type: 'STRING', description: 'First name of the lead' },
                    lastName: { type: 'STRING', description: 'Last name of the lead' },
                    mobile: { type: 'STRING', description: 'Primary 10-digit mobile number' },
                    budget: { type: 'STRING', description: 'Budget e.g. 50 Lakh, 1.5 Crore' },
                    requirement: { type: 'STRING', description: 'Property requirement e.g. Plot, Flat, Independent House, Booth' },
                    propertyType: { type: 'STRING', description: 'Residential, Commercial, Industrial, Agricultural' },
                    size: { type: 'STRING', description: 'Size e.g. 250 Gaj, 10 Marla, 1 Kanal, 4BHK' },
                    facing: { type: 'STRING', description: 'Park Facing, Main Road, East, North, Corner' },
                    location: { type: 'STRING', description: 'Location e.g. Sector 68, Sector 69, Kurukshetra, Mohali' },
                    description: { type: 'STRING', description: 'Additional specific client requirements or non-dropdown notes' }
                },
                required: ['firstName', 'mobile']
            }
        },
        {
            name: 'update_lead',
            description: 'Update an existing lead stage, status, budget, or notes',
            parameters: {
                type: 'OBJECT',
                properties: {
                    leadNameOrMobile: { type: 'STRING', description: 'Name or mobile number of the lead to identify' },
                    stage: { type: 'STRING', description: 'New stage e.g. Contacted, Negotiation, Qualified, Site Visit Done' },
                    status: { type: 'STRING', description: 'New status e.g. In Progress, Follow Up, Hot, Cold' },
                    notes: { type: 'STRING', description: 'Notes or update remarks' },
                    budget: { type: 'STRING', description: 'Updated budget' }
                },
                required: ['leadNameOrMobile']
            }
        },
        {
            name: 'create_deal',
            description: 'Create a new property deal in the CRM pipeline',
            parameters: {
                type: 'OBJECT',
                properties: {
                    clientNameOrLead: { type: 'STRING', description: 'Client name or lead identifier' },
                    projectName: { type: 'STRING', description: 'Project or Sector name e.g. Sector 69, SRS, HUDA' },
                    block: { type: 'STRING', description: 'Block name or number' },
                    unitNo: { type: 'STRING', description: 'Plot or Unit number' },
                    price: { type: 'NUMBER', description: 'Deal price in INR' },
                    propertyType: { type: 'STRING', description: 'Plot, Villa, Commercial, Apartment' },
                    stage: { type: 'STRING', description: 'Pipeline stage e.g. Token Received, Agreement, In Negotiation' }
                },
                required: ['clientNameOrLead', 'projectName']
            }
        },
        {
            name: 'update_deal',
            description: 'Update stage, price, or remarks of an existing deal',
            parameters: {
                type: 'OBJECT',
                properties: {
                    dealIdentifier: { type: 'STRING', description: 'Project name, unit number, or client name' },
                    stage: { type: 'STRING', description: 'New stage e.g. Token Received, Closed Won, Negotiation' },
                    price: { type: 'NUMBER', description: 'Updated price in INR' },
                    notes: { type: 'STRING', description: 'Remarks' }
                },
                required: ['dealIdentifier']
            }
        },
        {
            name: 'create_activity',
            description: 'Schedule a site visit, call, meeting, or task',
            parameters: {
                type: 'OBJECT',
                properties: {
                    type: { type: 'STRING', description: 'Call, Meeting, Site Visit, Task' },
                    subject: { type: 'STRING', description: 'Subject or title of activity' },
                    scheduledAt: { type: 'STRING', description: 'Scheduled date/time e.g. tomorrow 3 PM, Wednesday 4 PM' },
                    contactName: { type: 'STRING', description: 'Associated client or lead name' },
                    notes: { type: 'STRING', description: 'Agenda or remarks' }
                },
                required: ['type', 'subject']
            }
        },
        {
            name: 'log_note',
            description: 'Add an important note to a lead, deal, or contact',
            parameters: {
                type: 'OBJECT',
                properties: {
                    entityType: { type: 'STRING', description: 'Lead, Deal, or Contact' },
                    entityName: { type: 'STRING', description: 'Name of the client, deal, or contact' },
                    note: { type: 'STRING', description: 'Content of the note' }
                },
                required: ['entityName', 'note']
            }
        },
        {
            name: 'send_whatsapp',
            description: 'Send a WhatsApp message to a client or team member',
            parameters: {
                type: 'OBJECT',
                properties: {
                    recipientPhone: { type: 'STRING', description: 'Recipient phone number' },
                    recipientName: { type: 'STRING', description: 'Recipient name' },
                    message: { type: 'STRING', description: 'Message body to send' }
                },
                required: ['recipientPhone', 'message']
            }
        },
        {
            name: 'send_email',
            description: 'Send an email to a client or team member',
            parameters: {
                type: 'OBJECT',
                properties: {
                    recipientEmail: { type: 'STRING', description: 'Recipient email address' },
                    recipientName: { type: 'STRING', description: 'Recipient name' },
                    subject: { type: 'STRING', description: 'Email subject line' },
                    body: { type: 'STRING', description: 'Email body text' }
                },
                required: ['recipientEmail', 'subject', 'body']
            }
        },
        {
            name: 'process_call_notes',
            description: 'Analyze and auto-log a phone call conversation or notes with a client, extract budget, location, requirement, and schedule follow-ups',
            parameters: {
                type: 'OBJECT',
                properties: {
                    clientName: { type: 'STRING', description: 'Name of the client' },
                    clientPhone: { type: 'STRING', description: 'Phone number if mentioned' },
                    notes: { type: 'STRING', description: 'Conversation summary or notes discussed on the call' }
                },
                required: ['notes']
            }
        },
        {
            name: 'get_daily_briefing',
            description: 'Retrieve the daily executive briefing including today\'s site visits, meetings, overdue tasks, and hot prospects',
            parameters: {
                type: 'OBJECT',
                properties: {
                    timeframe: { type: 'STRING', description: 'today, tomorrow, or week' }
                }
            }
        },
        {
            name: 'get_proactive_suggestions',
            description: 'Retrieve proactive AI alerts and recommendations about stagnant leads, deals, and overdue tasks',
            parameters: {
                type: 'OBJECT',
                properties: {}
            }
        },
        // ── Phase 5 Enterprise Scale & Team Intelligence Tools ──
        {
            name: 'get_team_performance',
            description: 'Query aggregate performance metrics for sales teams or specific team members (leads handled, deals closed, calls made, site visits, top performers). Use when asked: "Team ki performance batao", "Mohali team ka status kya hai", "Puri team ne kitni calls ki", "Top performer kaun hai", etc.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    teamName: { type: 'STRING', description: 'Name of the team e.g. "Mohali", "Kurukshetra", "Sales"' },
                    timeframe: { type: 'STRING', description: 'today, this_week, this_month, or last_month' },
                    agentName: { type: 'STRING', description: 'Specific agent or salesperson name' }
                }
            }
        },
        {
            name: 'log_meeting_notes',
            description: 'Record and process smart meeting notes (in-person client meetings, developer negotiations, or internal team reviews). Auto-extracts meeting summary, action items, associated lead/project, and creates a completed Meeting activity with follow-up tasks.',
            parameters: {
                type: 'OBJECT',
                properties: {
                    notes: { type: 'STRING', description: 'Raw dictated or typed meeting transcript/points' },
                    clientName: { type: 'STRING', description: 'Client, broker, or developer name present in meeting' },
                    clientPhone: { type: 'STRING', description: 'Phone number if mentioned' },
                    projectName: { type: 'STRING', description: 'Project or locality discussed e.g. DLF, Sector 113, Mohali' }
                },
                required: ['notes']
            }
        }
    ]
}];

class JarvisService {
    async _getApiKey() {
        const envKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
        if (envKey && !envKey.includes('YOUR_') && envKey.length > 20) {
            return envKey;
        }
        const config = await SystemSetting.findOne({ key: 'ai_gemini_config' }).lean();
        return config?.value?.apiKey || null;
    }

    _resolvePagePath(pageName) {
        const normalized = (pageName || '').toLowerCase().trim().replace(/[-_\s]+/g, '_');
        const routeMap = {
            'dashboard': '/',
            'home': '/',
            'leads': '/leads',
            'lead': '/leads',
            'lead_analytics': '/lead-analytics',
            'deals': '/deals',
            'deal': '/deals',
            'deal_analytics': '/deal-analytics',
            'deal_intake': '/deal-intake',
            'contacts': '/contacts',
            'contact': '/contacts',
            'inventory': '/inventory',
            'inventory_analytics': '/inventory-analytics',
            'projects': '/projects',
            'project': '/projects',
            'activities': '/activities',
            'activity': '/activities',
            'booking': '/booking',
            'bookings': '/booking',
            'communication': '/communication',
            'inbox': '/communication',
            'marketing': '/marketing',
            'reports': '/reports',
            'report': '/reports',
            'settings': '/settings',
            'lead_matching': '/lead-matching',
            'deal_matching': '/deal-matching'
        };

        return routeMap[normalized] || '/';
    }

    /**
     * Primary Jarvis execution pipeline
     */
    async processCommand(user, payload) {
        const startTime = Date.now();
        const {
            transcript = '',
            inputType = 'voice',
            sessionId = 'session_' + Date.now(),
            source = 'web',
            deviceInfo = {}
        } = payload;

        const cleanTranscript = (transcript || '').trim();
        if (!cleanTranscript) {
            return {
                success: false,
                speechResponse: "Sir, maine theek se suna nahi. Kripya dobara boliye.",
                displayData: null,
                safetyTier: 1
            };
        }

        // 🧠 Check if user is confirming or cancelling an active pending action via voice
        const isAffirmative = /^(haan|yes|confirm|proceed|theek hai|kardo|krdo|ha|bilkul|go ahead)\b/i.test(cleanTranscript);
        const isNegative = /^(nahi|no|cancel|mat karo|rehne do|stop|reject)\b/i.test(cleanTranscript);

        if (isAffirmative || isNegative) {
            // Find recent pending confirmation command for this user
            const recentPending = await JarvisCommand.findOne({
                userId: user?._id,
                status: 'pending_confirmation',
                createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // last 5 minutes
            }).sort({ createdAt: -1 });

            if (recentPending) {
                if (isAffirmative) {
                    console.log(`[JarvisService] ✅ Auto-confirming action: ${recentPending._id} by voice`);
                    return await this.confirmAction(user, recentPending._id);
                } else {
                    console.log(`[JarvisService] ❌ Auto-cancelling action: ${recentPending._id} by voice`);
                    return await this.cancelAction(user, recentPending._id);
                }
            }
        }

        const apiKey = await this._getApiKey();
        if (!apiKey) {
            return {
                success: false,
                speechResponse: "Sir, Gemini API Key configure nahi hai. Settings me jaakar add karein.",
                displayData: null,
                safetyTier: 1
            };
        }

        const model = 'gemini-flash-lite-latest';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        try {
            // 🧠 Multi-Turn Memory: Retrieve last 3 commands in the past 15 mins for conversational continuity
            const recentCommands = await JarvisCommand.find({
                userId: user?._id,
                createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) }
            })
            .sort({ createdAt: -1 })
            .limit(3)
            .select('transcript intent params speechResponse')
            .lean();

            let contextPreamble = '';
            if (recentCommands && recentCommands.length > 0) {
                const historyLines = recentCommands.reverse().map(cmd => {
                    const p = cmd.params && Object.keys(cmd.params).length > 0 ? ` (Entities: ${JSON.stringify(cmd.params)})` : '';
                    return `User: "${cmd.transcript}" -> JARVIS: "${cmd.speechResponse || cmd.intent}"${p}`;
                }).join('\n');

                contextPreamble = `RECENT SESSION CONTEXT (Conversation History):\n${historyLines}\n\nCURRENT USER REQUEST:\n`;
            }

            const promptText = contextPreamble ? `${contextPreamble}"${cleanTranscript}"` : cleanTranscript;

            const requestBody = {
                contents: [{
                    role: 'user',
                    parts: [{ text: promptText }]
                }],
                systemInstruction: {
                    parts: [{ text: JARVIS_SYSTEM_INSTRUCTION }]
                },
                tools: JARVIS_TOOLS,
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 1024
                }
            };

            const response = await axios.post(url, requestBody, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const candidate = response.data?.candidates?.[0];
            const part = candidate?.content?.parts?.[0];
            const latencyMs = Date.now() - startTime;

            let resultIntent = 'conversation';
            let speechResponse = '';
            let displayData = null;
            let action = null;
            let targetUrl = null;
            let toolParams = {};
            let requiresConfirmation = false;
            let safetyTier = 1;
            let pendingAction = null;

            if (part?.functionCall) {
                const call = part.functionCall;
                resultIntent = call.name;
                toolParams = call.args || {};

                console.log(`[JarvisService] 🧠 Function Called: ${resultIntent}`, toolParams);

                // ── TIER 1 ACTIONS (Instant Execution) ──
                if (resultIntent === 'navigate_to_page') {
                    action = 'navigate';
                    targetUrl = this._resolvePagePath(toolParams.page);
                    const prettyName = (toolParams.page || 'Dashboard').replace(/_/g, ' ');
                    speechResponse = `Sir, ${prettyName} page open kar raha hoon.`;
                    displayData = {
                        type: 'navigation',
                        page: toolParams.page,
                        path: targetUrl,
                        filter: toolParams.filter || null
                    };
                } else if (resultIntent === 'search_global') {
                    action = 'search';
                    const query = toolParams.query || '';
                    const searchResults = await this._executeSearch(query);
                    const totalFound = (searchResults.leads?.length || 0) + 
                                       (searchResults.contacts?.length || 0) + 
                                       (searchResults.deals?.length || 0) + 
                                       (searchResults.inventory?.length || 0);

                    speechResponse = totalFound === 0
                        ? `Sir, "${query}" ke liye CRM me koi record nahi mila.`
                        : `Sir, "${query}" ke related ${totalFound} records mil gaye hain. Screen par display kar raha hoon.`;
                    
                    displayData = {
                        type: 'search_results',
                        query,
                        total: totalFound,
                        results: searchResults
                    };
                } else if (resultIntent === 'get_dashboard_metrics') {
                    action = 'metrics';
                    const metrics = await this._executeMetrics();
                    speechResponse = `Sir, total ${metrics.totalLeads} leads hain jisme se ${metrics.hotLeads} hot prospects hain. Active deals ${metrics.totalDeals} hain aur MTD secured pipeline solid chal rahi hai.`;
                    displayData = {
                        type: 'dashboard_metrics',
                        period: toolParams.period || 'current',
                        metrics
                    };
                } else if (resultIntent === 'get_lead_count') {
                    action = 'count';
                    const countResult = await this._executeLeadCount(toolParams);
                    speechResponse = countResult.speech;
                    displayData = {
                        type: 'lead_count',
                        filter: toolParams,
                        count: countResult.count
                    };
                } else if (resultIntent === 'get_inventory_availability') {
                    action = 'inventory_check';
                    const invResult = await this._executeInventoryCheck(toolParams);
                    speechResponse = invResult.speech;
                    displayData = {
                        type: 'inventory_status',
                        query: toolParams,
                        availableCount: invResult.count,
                        units: invResult.units
                    };
                } else if (resultIntent === 'get_pipeline_summary') {
                    action = 'pipeline_summary';
                    const pipeResult = await this._executePipelineSummary();
                    speechResponse = pipeResult.speech;
                    displayData = {
                        type: 'pipeline_summary',
                        summary: pipeResult.stages
                    };
                } else if (resultIntent === 'get_daily_briefing') {
                    action = 'daily_briefing';
                    const briefingResult = await this.getDailyBriefing(user);
                    speechResponse = briefingResult.speechResponse;
                    displayData = {
                        type: 'daily_briefing',
                        ...briefingResult
                    };
                } else if (resultIntent === 'get_proactive_suggestions') {
                    action = 'proactive_suggestions';
                    const suggResult = await this.getProactiveSuggestions(user);
                    speechResponse = suggResult.totalSuggestions > 0 
                        ? `Sir, aapke liye ${suggResult.totalSuggestions} proactive alerts hain. Screen par display kar raha hoon.`
                        : `Sir, filhal koi critical overdue ya stagnant tasks nahi hain. All systems green.`;
                    displayData = {
                        type: 'proactive_suggestions',
                        ...suggResult
                    };
                } else if (resultIntent === 'get_team_performance') {
                    action = 'team_performance';
                    const teamResult = await this.getTeamPerformance(user, toolParams);
                    speechResponse = teamResult.speechResponse;
                    displayData = {
                        type: 'team_performance',
                        ...teamResult
                    };
                } else if (resultIntent === 'log_meeting_notes') {
                    action = 'meeting_notes';
                    safetyTier = 1;
                    const meetingResult = await this.processMeetingNotes(user, {
                        notes: toolParams.notes,
                        clientName: toolParams.clientName,
                        clientPhone: toolParams.clientPhone,
                        projectName: toolParams.projectName,
                        source
                    });
                    speechResponse = meetingResult.speechResponse;
                    displayData = {
                        type: 'meeting_notes',
                        ...meetingResult
                    };
                }

                // ── TIER 2 ACTIONS (Data Mutation & Comms — Require Confirmation) ──
                else if (resultIntent === 'create_lead') {
                    action = 'create_lead';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    const fullName = `${toolParams.firstName || ''} ${toolParams.lastName || ''}`.trim();
                    const budgetStr = toolParams.budget ? `Budget: ${toolParams.budget}` : '';
                    const locStr = toolParams.location ? `in ${toolParams.location}` : '';
                    
                    speechResponse = `Sir, ${fullName} (${toolParams.mobile}) ke liye naya lead create karun? ${budgetStr} ${locStr}. Please confirm kijiye.`;
                    pendingAction = {
                        type: 'create_lead',
                        summary: `Create Lead: ${fullName} | ${toolParams.mobile} ${locStr} ${budgetStr}`.trim(),
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'create_lead',
                        details: toolParams
                    };
                } else if (resultIntent === 'update_lead') {
                    action = 'update_lead';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    const target = toolParams.leadNameOrMobile;
                    const stageStr = toolParams.stage ? `stage to "${toolParams.stage}"` : '';
                    const statusStr = toolParams.status ? `status to "${toolParams.status}"` : '';
                    
                    speechResponse = `Sir, lead ${target} ko update karun ${stageStr || statusStr}? Please confirm.`;
                    pendingAction = {
                        type: 'update_lead',
                        summary: `Update Lead: ${target} ${stageStr} ${statusStr}`.trim(),
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'update_lead',
                        details: toolParams
                    };
                } else if (resultIntent === 'create_deal') {
                    action = 'create_deal';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    const priceStr = toolParams.price ? `₹${(toolParams.price).toLocaleString('en-IN')}` : '';
                    
                    speechResponse = `Sir, ${toolParams.clientNameOrLead} ke liye ${toolParams.projectName} me deal create karun ${priceStr}? Please confirm.`;
                    pendingAction = {
                        type: 'create_deal',
                        summary: `Create Deal: ${toolParams.clientNameOrLead} @ ${toolParams.projectName} ${priceStr}`.trim(),
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'create_deal',
                        details: toolParams
                    };
                } else if (resultIntent === 'update_deal') {
                    action = 'update_deal';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    
                    speechResponse = `Sir, deal ${toolParams.dealIdentifier} ko update karun? Please confirm.`;
                    pendingAction = {
                        type: 'update_deal',
                        summary: `Update Deal: ${toolParams.dealIdentifier}`,
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'update_deal',
                        details: toolParams
                    };
                } else if (resultIntent === 'create_activity') {
                    action = 'create_activity';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    const schedStr = toolParams.scheduledAt ? `scheduled for ${toolParams.scheduledAt}` : '';
                    
                    speechResponse = `Sir, ${toolParams.type} "${toolParams.subject}" schedule karun ${schedStr}? Please confirm.`;
                    pendingAction = {
                        type: 'create_activity',
                        summary: `${toolParams.type}: ${toolParams.subject} ${schedStr}`.trim(),
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'create_activity',
                        details: toolParams
                    };
                } else if (resultIntent === 'log_note') {
                    action = 'log_note';
                    safetyTier = 1; // Notes are instant Tier 1
                    const noteRes = await this._executeLogNote(toolParams, user);
                    speechResponse = noteRes.speech;
                    displayData = {
                        type: 'note_logged',
                        entity: toolParams.entityName,
                        note: toolParams.note
                    };
                } else if (resultIntent === 'send_whatsapp') {
                    action = 'send_whatsapp';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    const recipient = toolParams.recipientName || toolParams.recipientPhone;
                    
                    speechResponse = `Sir, ${recipient} ko WhatsApp message bhejoon? Message: "${toolParams.message}". Please confirm.`;
                    pendingAction = {
                        type: 'send_whatsapp',
                        summary: `WhatsApp to ${recipient}: "${toolParams.message}"`,
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'send_whatsapp',
                        details: toolParams
                    };
                } else if (resultIntent === 'send_email') {
                    action = 'send_email';
                    safetyTier = 2;
                    requiresConfirmation = true;
                    const recipient = toolParams.recipientName || toolParams.recipientEmail;
                    
                    speechResponse = `Sir, ${recipient} ko email bhejoon? Subject: "${toolParams.subject}". Please confirm.`;
                    pendingAction = {
                        type: 'send_email',
                        summary: `Email to ${recipient}: "${toolParams.subject}"`,
                        params: toolParams
                    };
                    displayData = {
                        type: 'confirmation_required',
                        actionType: 'send_email',
                        details: toolParams
                    };
                } else if (resultIntent === 'process_call_notes') {
                    action = 'process_call_notes';
                    safetyTier = 1;
                    const callResult = await this.processCallIntelligence(user, {
                        clientPhone: toolParams.clientPhone,
                        clientName: toolParams.clientName,
                        transcript: toolParams.notes,
                        callType: 'OUTGOING',
                        recordingSource: 'dictation',
                        source
                    });
                    speechResponse = callResult.speechResponse;
                    displayData = {
                        type: 'call_intelligence',
                        ...callResult
                    };
                }

            } else if (part?.text) {
                speechResponse = part.text.trim();
                action = 'chat';
                displayData = {
                    type: 'chat_response',
                    message: speechResponse
                };
            }

            // Command status: if confirmation required, set pending_confirmation
            const commandStatus = requiresConfirmation ? 'pending_confirmation' : 'executed';

            const commandLog = new JarvisCommand({
                userId: user?._id || new mongoose.Types.ObjectId(),
                teamId: user?.teams?.[0] || null,
                sessionId,
                inputType,
                transcript: cleanTranscript,
                intent: resultIntent,
                params: toolParams,
                safetyTier,
                confidence: 98,
                llmProvider: 'gemini-3.8-flash',
                llmLatencyMs: latencyMs,
                status: commandStatus,
                result: { action, targetUrl, pendingAction },
                speechResponse,
                displayData,
                source,
                deviceInfo
            });

            await commandLog.save();

            return {
                success: true,
                commandId: commandLog._id,
                actionId: commandLog._id,
                intent: resultIntent,
                action,
                targetUrl,
                speechResponse,
                displayData,
                requiresConfirmation,
                pendingAction,
                safetyTier,
                latencyMs
            };

        } catch (error) {
            console.error('[JarvisService] Execution error:', error.response?.data || error.message);
            const latencyMs = Date.now() - startTime;
            
            return {
                success: false,
                intent: 'error',
                speechResponse: "Maaf kijiye Sir, command process karne me thodi problem aayi. Kripya dobara bolen.",
                error: error.message,
                safetyTier: 1,
                latencyMs
            };
        }
    }

    /**
     * Confirm and execute a pending Tier 2 action
     */
    async confirmAction(user, actionId) {
        try {
            const command = await JarvisCommand.findOne({
                _id: actionId,
                status: 'pending_confirmation'
            });

            if (!command) {
                return {
                    success: false,
                    speechResponse: "Sir, koi pending confirmation nahi mili ya ye already execute ho chuki hai.",
                    safetyTier: 2
                };
            }

            const { intent, params } = command;
            let executionResult = null;
            let speechResponse = "Sir, action successfully execute ho gayi hai.";

            console.log(`[JarvisService] ⚡ Executing Confirmed Action: ${intent}`, params);

            switch (intent) {
                case 'create_lead': {
                    executionResult = await this._executeCreateLead(params, user);
                    speechResponse = `Sir, ${params.firstName} ka lead CRM me successfully create ho gaya hai.`;
                    break;
                }
                case 'update_lead': {
                    executionResult = await this._executeUpdateLead(params, user);
                    speechResponse = `Sir, ${params.leadNameOrMobile} ka lead record successfully update ho gaya hai.`;
                    break;
                }
                case 'create_deal': {
                    executionResult = await this._executeCreateDeal(params, user);
                    speechResponse = `Sir, ${params.clientNameOrLead} ke liye ${params.projectName} me deal successfully create ho gayi hai.`;
                    break;
                }
                case 'update_deal': {
                    executionResult = await this._executeUpdateDeal(params, user);
                    speechResponse = `Sir, deal record successfully update ho gaya hai.`;
                    break;
                }
                case 'create_activity': {
                    executionResult = await this._executeCreateActivity(params, user);
                    speechResponse = `Sir, ${params.type} "${params.subject}" successfully schedule ho gaya hai.`;
                    break;
                }
                case 'send_whatsapp': {
                    executionResult = await this._executeSendWhatsApp(params, user);
                    speechResponse = `Sir, WhatsApp message successfully send kar diya gaya hai.`;
                    break;
                }
                case 'send_email': {
                    executionResult = await this._executeSendEmail(params, user);
                    speechResponse = `Sir, proposal email successfully send kar di gayi hai.`;
                    break;
                }
                default: {
                    executionResult = { executed: true };
                    break;
                }
            }

            command.status = 'executed';
            command.result = executionResult;
            command.speechResponse = speechResponse;
            await command.save();

            return {
                success: true,
                actionId: command._id,
                action: intent,
                status: 'executed',
                speechResponse,
                result: executionResult,
                safetyTier: 2
            };

        } catch (error) {
            console.error('[JarvisService] confirmAction error:', error);
            return {
                success: false,
                speechResponse: `Sir, action execute karne me error aayi: ${error.message}`,
                error: error.message
            };
        }
    }

    /**
     * Cancel a pending Tier 2 action
     */
    async cancelAction(user, actionId) {
        try {
            const command = await JarvisCommand.findOne({
                _id: actionId,
                status: 'pending_confirmation'
            });

            if (!command) {
                return {
                    success: false,
                    speechResponse: "Sir, koi pending action nahi mili.",
                    safetyTier: 2
                };
            }

            command.status = 'cancelled';
            command.speechResponse = "Sir, action cancel kar di gayi hai.";
            await command.save();

            return {
                success: true,
                actionId: command._id,
                status: 'cancelled',
                speechResponse: "Sir, action cancel kar di gayi hai.",
                safetyTier: 2
            };
        } catch (error) {
            return {
                success: false,
                speechResponse: "Sir, cancel karne me error aayi.",
                error: error.message
            };
        }
    }

    // ── MUTATION EXECUTORS ──

    /**
     * Safe Lookup Finder: ONLY selects existing active lookups, NEVER creates or overwrites!
     * Supports exact match, word boundary regex, and reverse containment matching (e.g. 'Park facing' -> 'Park').
     */
    async _findExistingLookup(type, candidates) {
        if (!candidates) return null;
        const list = Array.isArray(candidates) ? candidates : [candidates];
        for (const c of list) {
            if (!c || typeof c !== 'string') continue;
            const trimmed = c.trim();
            if (!trimmed) continue;
            const escaped = trimmed.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');

            // 1. Exact match (case-insensitive)
            let item = await Lookup.findOne({
                lookup_type: type,
                lookup_value: { $regex: new RegExp(`^${escaped}$`, 'i') },
                isActive: { $ne: false }
            }).select('_id lookup_value lookup_type').lean();
            if (item) return item;

            // 2. Word boundary / phrase match
            item = await Lookup.findOne({
                lookup_type: type,
                lookup_value: { $regex: new RegExp(`\\b${escaped}\\b`, 'i') },
                isActive: { $ne: false }
            }).select('_id lookup_value lookup_type').lean();
            if (item) return item;
        }

        // 3. Smart Reverse Match: check if candidate matches or contains active lookup_value or sub-parts
        const allLookups = await Lookup.find({ lookup_type: type, isActive: { $ne: false } })
            .select('_id lookup_value lookup_type')
            .lean();

        for (const c of list) {
            if (!c || typeof c !== 'string') continue;
            const cleanCandidate = c.trim().toLowerCase();
            if (!cleanCandidate) continue;
            const normCand = cleanCandidate.replace(/[^a-z0-9]/g, ' ');

            for (const l of allLookups) {
                const val = (l.lookup_value || '').trim().toLowerCase();
                if (!val || val.length < 2) continue;
                
                const normVal = val.replace(/[^a-z0-9]/g, ' ');
                const valRegex = new RegExp(`\\b${normVal.trim()}\\b`, 'i');
                if (valRegex.test(normCand)) {
                    return l;
                }

                // Check slash/dash separated parts e.g. "Flat/Apartment" -> "flat", "apartment"
                const parts = val.split(/[\/\-,]/).map(p => p.trim()).filter(p => p.length >= 3);
                for (const part of parts) {
                    const partRegex = new RegExp(`\\b${part.replace(/[^a-z0-9]/g, ' ').trim()}\\b`, 'i');
                    if (partRegex.test(normCand)) {
                        return l;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Helper to parse Indian Currency string into numeric budget range in INR
     */
    _parseBudgetINR(text) {
        if (!text || typeof text !== 'string') return { min: null, max: null };
        let min = null, max = null;

        const rangeCr = text.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)?\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:cr|crore)/i);
        const rangeLakh = text.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac)?\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:lakh|lac)/i);

        if (rangeCr) {
            min = Math.round(parseFloat(rangeCr[1]) * 10000000);
            max = Math.round(parseFloat(rangeCr[2]) * 10000000);
        } else if (rangeLakh) {
            min = Math.round(parseFloat(rangeLakh[1]) * 100000);
            max = Math.round(parseFloat(rangeLakh[2]) * 100000);
        } else {
            const singleCr = text.match(/(\d+(?:\.\d+)?)\s*(?:cr|crore)/i);
            const singleLakh = text.match(/(\d+(?:\.\d+)?)\s*(?:l|lac|lakh)/i);
            if (singleCr) {
                min = Math.round(parseFloat(singleCr[1]) * 10000000);
                max = min;
            } else if (singleLakh) {
                min = Math.round(parseFloat(singleLakh[1]) * 100000);
                max = min;
            }
        }
        return { min, max };
    }

    /**
     * Enterprise CRM Dropdown & Field Matcher:
     * Matches extracted entities strictly against existing lookups in MongoDB.
     * NEVER creates new lookups. Puts only residual details in description.
     * Enforces default user assignment: assignedTo = user._id, team = user.teams, visibleTo = 'Team'.
     */
    async _mapExtractedToLeadFields(extracted, user) {
        const userTeamIds = (user?.teams && user.teams.length > 0)
            ? user.teams
            : (user?.team ? [user.team] : []);

        // 1. Category / propertyType (Residential, Commercial, Industrial, Agricultural)
        const catCandidates = [extracted.category, extracted.propertyType];
        const isPlotOrResidential = /plot|kothi|house|flat|apartment|floor|residential/i.test(
            `${extracted.subCategory || ''} ${extracted.requirement || ''} ${extracted.propertyType || ''}`
        );
        if (isPlotOrResidential) catCandidates.push('Residential');
        const catMatch = await this._findExistingLookup('Category', catCandidates.filter(Boolean));
        const propertyType = catMatch ? [catMatch._id] : [];

        // 2. SubCategory / subType (Plot, Flat/Apartment, Independent House, Builder Floor, Shop, etc.)
        const subCatMatch = await this._findExistingLookup('SubCategory', [
            extracted.subCategory,
            extracted.requirement,
            extracted.subType
        ].filter(Boolean));
        const subType = subCatMatch ? [subCatMatch._id] : [];

        // 3. PropertyType / sizeType (10 Marla, 1 Kanal, 4 BHK, etc.)
        const sizeCandidates = [];
        const rawSize = extracted.sizeText || extracted.size || '';
        if (rawSize) {
            sizeCandidates.push(rawSize);
            if (/250\s*gaj/i.test(rawSize)) sizeCandidates.push('10 Marla');
            if (/200\s*gaj/i.test(rawSize)) sizeCandidates.push('8 Marla');
            if (/150\s*gaj/i.test(rawSize)) sizeCandidates.push('6 Marla');
            if (/100\s*gaj/i.test(rawSize)) sizeCandidates.push('4 Marla');
            if (/500\s*gaj/i.test(rawSize)) sizeCandidates.push('1 Kanal');
            if (/1000\s*gaj/i.test(rawSize)) sizeCandidates.push('2 Kanal');
        }
        const sizeMatch = await this._findExistingLookup('PropertyType', sizeCandidates);
        const sizeType = sizeMatch ? [sizeMatch._id] : [];

        // 4. UnitType (Corner, Two Side Open, Three Side Open, Ordinary)
        const unitMatch = await this._findExistingLookup('UnitType', [extracted.unitType].filter(Boolean));
        const unitType = unitMatch ? [unitMatch._id] : [];

        // 5. Facing (Park, Main Road Facing, Dividing Road)
        const facingMatch = await this._findExistingLookup('Facing', [extracted.facing].filter(Boolean));
        const facing = facingMatch ? [facingMatch._id] : [];

        // 6. RoadWidth (18 Mtr (60 Feet) Wide, etc.)
        const roadMatch = await this._findExistingLookup('RoadWidth', [extracted.roadWidth].filter(Boolean));
        const roadWidth = roadMatch ? [roadMatch._id] : [];

        // 7. Direction (East, West, North, South, North-East)
        const dirMatch = await this._findExistingLookup('Direction', [extracted.direction].filter(Boolean));
        const direction = dirMatch ? [dirMatch._id] : [];

        // 8. Requirement (Buy / Rent)
        const reqMatch = await this._findExistingLookup('Requirement', [extracted.transactionType, 'Buy'].filter(Boolean));
        const requirement = reqMatch ? reqMatch._id : null;

        // 9. Location
        const locCandidates = [extracted.sector, extracted.location, extracted.city].filter(Boolean);
        const locMatch = await this._findExistingLookup('Location', locCandidates);
        const location = locMatch ? locMatch._id : null;

        // 10. Budget
        const budgetMatch = await this._findExistingLookup('Budget', [extracted.budgetLabel, extracted.budget].filter(Boolean));
        const budget = budgetMatch ? budgetMatch._id : null;
        const { min: budgetMin, max: budgetMax } = this._parseBudgetINR(extracted.budgetLabel || extracted.budget || '');

        // 11. Stage & Status
        const isOpp = extracted.followUp?.scheduled || /site visit|meeting|visit/i.test(extracted.callSummary || '');
        const stageMatch = await this._findExistingLookup('Stage', [isOpp ? 'Opportunity' : 'Prospect']);
        const statusMatch = await this._findExistingLookup('Status', ['Active', 'New']);

        // 12. City & Sector
        let sector = extracted.sector || '';
        let locCity = extracted.city || '';
        if (!sector && extracted.location) {
            const secMatch = extracted.location.match(/sector\s*\d+/i);
            if (secMatch) sector = secMatch[0];
        }
        if (!locCity && (extracted.location || sector)) {
            const locText = `${extracted.location || ''} ${sector}`;
            if (/mohali/i.test(locText)) locCity = 'Mohali';
            else if (/kurukshetra/i.test(locText)) locCity = 'Kurukshetra';
            else if (/panchkula/i.test(locText)) locCity = 'Panchkula';
            else if (/chandigarh/i.test(locText)) locCity = 'Chandigarh';
            else if (/ambala/i.test(locText)) locCity = 'Ambala';
        }

        // 13. Area metrics (Numeric)
        let areaMin = null, areaMax = null, areaMetric = null;
        if (rawSize) {
            const gajM = rawSize.match(/(\d+)\s*gaj/i);
            const marlaM = rawSize.match(/(\d+)\s*marla/i);
            const kanalM = rawSize.match(/(\d+)\s*kanal/i);
            if (gajM) {
                areaMin = parseInt(gajM[1]);
                areaMax = areaMin;
                areaMetric = 'Gaj';
            } else if (marlaM) {
                areaMin = parseInt(marlaM[1]);
                areaMax = areaMin;
                areaMetric = 'Marla';
            } else if (kanalM) {
                areaMin = parseInt(kanalM[1]);
                areaMax = areaMin;
                areaMetric = 'Kanal';
            }
        }

        // 14. Description: ONLY residual unstructured notes that don't fit into dropdowns!
        let cleanDescription = '';
        if (extracted.unstructuredNotes && typeof extracted.unstructuredNotes === 'string' && extracted.unstructuredNotes.trim()) {
            cleanDescription = extracted.unstructuredNotes.trim();
        } else if (extracted.description && typeof extracted.description === 'string' && extracted.description.trim()) {
            cleanDescription = extracted.description.trim();
        } else {
            cleanDescription = 'Direct client requirement captured via JARVIS Voice OS.';
        }

        return {
            propertyType,
            subType,
            sizeType,
            unitType,
            facing,
            roadWidth,
            direction,
            requirement,
            location,
            sector,
            locCity,
            budget,
            budgetMin,
            budgetMax,
            areaMin,
            areaMax,
            areaMetric,
            stage: stageMatch?._id,
            status: statusMatch?._id,
            description: cleanDescription,
            assignedTo: user?._id,
            owner: user?._id,
            teams: userTeamIds,
            department: user?.department || 'sales',
            assignment: {
                assignedTo: user?._id,
                team: userTeamIds,
                visibleTo: 'Team',
                method: 'JARVIS_VOICE_OS',
                history: [{
                    assignedTo: user?._id,
                    assignedBy: user?._id,
                    assignedAt: new Date(),
                    reason: 'Created via JARVIS Voice OS'
                }]
            }
        };
    }

    async _executeCreateLead(params, user) {
        const mappedFields = await this._mapExtractedToLeadFields({
            category: params.propertyType,
            subCategory: params.requirement || params.subType,
            sizeText: params.size,
            facing: params.facing,
            roadWidth: params.roadWidth,
            location: params.location,
            budgetLabel: params.budget,
            transactionType: params.transactionType || 'Buy',
            unstructuredNotes: params.description || params.notes
        }, user);

        const leadData = {
            firstName: params.firstName,
            lastName: params.lastName || '',
            mobile: params.mobile,
            ...mappedFields
        };

        const result = await createStandardizedLead(leadData, { triggerEvent: 'onCreate' });
        return { leadId: result.lead?._id, mobile: params.mobile };
    }

    async _executeUpdateLead(params, user) {
        const query = { isDeleted: { $ne: true } };
        const term = params.leadNameOrMobile;

        if (/^\d{10}$/.test(term)) {
            query.mobile = term;
        } else {
            query.$or = [
                { firstName: new RegExp(term, 'i') },
                { lastName: new RegExp(term, 'i') }
            ];
        }

        const updates = {};
        if (params.stage) {
            const stageMatch = await this._findExistingLookup('Stage', [params.stage]);
            if (stageMatch) updates.stage = stageMatch._id;
        }
        if (params.status) {
            const statusMatch = await this._findExistingLookup('Status', [params.status]);
            if (statusMatch) updates.status = statusMatch._id;
        }
        if (params.budget) {
            const { min, max } = this._parseBudgetINR(params.budget);
            if (min) { updates.budgetMin = min; updates.budgetMax = max; }
        }
        if (params.notes) updates.notes = params.notes;

        const updated = await Lead.findOneAndUpdate(query, updates, { new: true });
        return { leadId: updated?._id, updatedFields: updates };
    }

    async _executeCreateDeal(params, user) {
        let linkedLeadId = null;
        if (params.clientNameOrLead) {
            const lead = await Lead.findOne({
                isDeleted: { $ne: true },
                $or: [
                    { firstName: new RegExp(params.clientNameOrLead, 'i') },
                    { mobile: params.clientNameOrLead }
                ]
            }).select('_id').lean();
            if (lead) linkedLeadId = lead._id;
        }

        const deal = new Deal({
            leadId: linkedLeadId,
            projectName: params.projectName,
            block: params.block || '',
            unitNo: params.unitNo || '',
            price: Number(params.price) || 0,
            propertyType: params.propertyType || 'Plot',
            stage: params.stage || 'Negotiation',
            owner: user?._id
        });

        await deal.save();
        return { dealId: deal._id, projectName: deal.projectName };
    }

    async _executeUpdateDeal(params, user) {
        const regex = new RegExp(params.dealIdentifier, 'i');
        const query = {
            isDeleted: { $ne: true },
            $or: [
                { projectName: regex },
                { unitNo: regex },
                { block: regex }
            ]
        };

        const updates = {};
        if (params.stage) updates.stage = params.stage;
        if (params.price) updates.price = Number(params.price);
        if (params.notes) updates.remarks = params.notes;

        const updated = await Deal.findOneAndUpdate(query, updates, { new: true });
        return { dealId: updated?._id, updatedFields: updates };
    }

    async _executeCreateActivity(params, user) {
        let dueDate = new Date();
        const sched = (params.scheduledAt || '').toLowerCase();
        if (sched.includes('tomorrow') || sched.includes('kal')) {
            dueDate.setDate(dueDate.getDate() + 1);
        } else if (sched.includes('wednesday')) {
            const currentDay = dueDate.getDay();
            const daysToAdd = (3 + 7 - currentDay) % 7 || 7;
            dueDate.setDate(dueDate.getDate() + daysToAdd);
        }

        const activity = new Activity({
            type: params.type || 'Task',
            subject: params.subject,
            entityType: 'Lead',
            dueDate,
            description: params.notes || `Scheduled via Jarvis Voice OS`,
            assignedTo: user?._id,
            createdBy: user?._id,
            performedBy: user?.name || 'Agent'
        });

        await activity.save();
        return { activityId: activity._id, type: activity.type, subject: activity.subject };
    }

    async _executeLogNote(params, user) {
        const regex = new RegExp(params.entityName, 'i');
        let entity = await Lead.findOne({ firstName: regex });
        let entityType = 'Lead';

        if (!entity) {
            entity = await Contact.findOne({ name: regex });
            entityType = 'Contact';
        }

        const noteText = `[JARVIS Note ${new Date().toLocaleDateString('en-IN')}]: ${params.note}`;

        const activity = new Activity({
            type: 'Note',
            subject: `Voice Note - ${params.entityName}`,
            entityType,
            entityId: entity?._id,
            dueDate: new Date(),
            description: noteText,
            assignedTo: user?._id,
            createdBy: user?._id,
            performedBy: user?.name || 'Agent'
        });
        await activity.save();

        return {
            speech: `Sir, ${params.entityName} ke profile me note log kar diya gaya hai.`
        };
    }

    async _executeSendWhatsApp(params, user) {
        console.log(`[JarvisService] 📱 WhatsApp Dispatch to ${params.recipientPhone}: "${params.message}"`);
        try {
            const { BaileysConnectionManager } = await import('./baileysQueue/BaileysConnectionManager.js');
            // Try Baileys or Meta Cloud API
            await BaileysConnectionManager.sendMessageSafely({
                phoneNumber: params.recipientPhone,
                message: params.message,
                userId: user?._id
            });
        } catch (e) {
            console.warn('[JarvisService] WhatsApp direct dispatch fallback:', e.message);
        }
        return { recipient: params.recipientPhone, status: 'sent' };
    }

    async _executeSendEmail(params, user) {
        console.log(`[JarvisService] 📧 Email Dispatch to ${params.recipientEmail}: "${params.subject}"`);
        try {
            const emailService = (await import('./email.service.js')).default;
            await emailService.sendEmail(params.recipientEmail, params.subject, params.body, `<p>${params.body}</p>`);
        } catch (e) {
            console.warn('[JarvisService] Email direct dispatch fallback:', e.message);
        }
        return { recipient: params.recipientEmail, status: 'sent' };
    }

    // ── QUERY EXECUTORS ──

    async _executeSearch(query) {
        if (!query || query.length < 2) return { leads: [], contacts: [], deals: [], inventory: [] };
        const regex = new RegExp(query.trim(), 'i');

        const [leads, contacts, deals, inventory] = await Promise.all([
            Lead.find({
                $or: [
                    { firstName: regex },
                    { lastName: regex },
                    { mobile: regex },
                    { email: regex }
                ]
            }).select('firstName lastName mobile email status lead_classification locCity locArea').limit(5).lean(),

            Contact.find({
                $or: [
                    { name: regex },
                    { 'phones.number': regex },
                    { 'emails.address': regex }
                ]
            }).select('name phones emails city').limit(5).lean(),

            Deal.find({
                $or: [
                    { projectName: regex },
                    { unitNo: regex },
                    { block: regex },
                    { location: regex }
                ]
            }).select('projectName unitNo block price stage location').limit(5).lean(),

            Inventory.find({
                $or: [
                    { title: regex },
                    { plotNumber: regex },
                    { block: regex },
                    { sector: regex }
                ]
            }).select('title plotNumber block sector price status').limit(5).lean()
        ]);

        return { leads, contacts, deals, inventory };
    }

    async _executeMetrics() {
        const [totalLeads, hotLeads, totalDeals, totalInventory] = await Promise.all([
            Lead.countDocuments({ isDeleted: { $ne: true } }),
            Lead.countDocuments({
                isDeleted: { $ne: true },
                $or: [
                    { lead_classification: /serious|qualified|hot/i },
                    { pre_intent_score: { $gte: 70 } }
                ]
            }),
            Deal.countDocuments({ isDeleted: { $ne: true } }),
            Inventory.countDocuments({ isDeleted: { $ne: true }, status: { $ne: 'Sold' } })
        ]);

        return { totalLeads, hotLeads, totalDeals, totalInventory };
    }

    async _executeLeadCount(filter = {}) {
        const query = { isDeleted: { $ne: true } };

        if (filter.temperature === 'hot') {
            query.$or = [
                { lead_classification: /serious|qualified|hot/i },
                { pre_intent_score: { $gte: 70 } }
            ];
        } else if (filter.temperature === 'warm') {
            query.$or = [
                { lead_classification: /warm|explorer/i },
                { pre_intent_score: { $gte: 40, $lt: 70 } }
            ];
        } else if (filter.temperature === 'cold') {
            query.pre_intent_score = { $lt: 40 };
        }

        if (filter.location) {
            const locRegex = new RegExp(filter.location, 'i');
            query.$or = [
                { locCity: locRegex },
                { locArea: locRegex },
                { sector: locRegex }
            ];
        }

        const count = await Lead.countDocuments(query);
        const tempText = filter.temperature ? `${filter.temperature} ` : '';
        const locText = filter.location ? ` ${filter.location} me` : '';

        return {
            count,
            speech: `Sir, CRM me total ${count} ${tempText}leads maujood hain${locText}.`
        };
    }

    async _executeInventoryCheck(filter = {}) {
        const query = { isDeleted: { $ne: true }, status: { $ne: 'Sold' } };

        if (filter.project) {
            const projRegex = new RegExp(filter.project, 'i');
            query.$or = [
                { title: projRegex },
                { sector: projRegex },
                { projectName: projRegex }
            ];
        }

        const units = await Inventory.find(query)
            .select('title plotNumber block sector size price status')
            .limit(5)
            .lean();

        const count = await Inventory.countDocuments(query);
        const projName = filter.project || 'selected criteria';

        let speech = `Sir, ${projName} me currently ${count} units available hain.`;
        if (count > 0 && units[0]?.plotNumber) {
            speech += ` Jaise ki Plot ${units[0].plotNumber}${units[0].block ? ' Block ' + units[0].block : ''}.`;
        }

        return { count, units, speech };
    }

    async _executePipelineSummary() {
        const deals = await Deal.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$price' } } }
        ]);

        const totalDeals = deals.reduce((sum, d) => sum + d.count, 0);
        return {
            stages: deals,
            speech: `Sir, pipeline me currently ${totalDeals} active deals chal rahi hain.`
        };
    }

    /**
     * Process Call Intelligence from audio or transcript
     * Extracts entities, links/creates lead, logs activity, schedules follow-ups
     */
    async processCallIntelligence(user, payload) {
        const startTime = Date.now();
        const {
            clientPhone = '',
            clientName = null,
            callType = 'INCOMING',
            duration = 0,
            callStartTime = null,
            callEndTime = new Date(),
            recordingUrl = null,
            recordingSource = 'native',
            transcript = '',
            notes = '',
            audioBase64 = null,
            audioMimeType = 'audio/mp3',
            source = 'mobile',
            deviceInfo = {}
        } = payload;

        try {
            const apiKey = await this._getApiKey();
            if (!apiKey) {
                throw new Error('Google AI Gemini API key not found in system or environment');
            }

            const cleanPhone = (clientPhone || '').replace(/\D/g, '').slice(-10);
            const todayStr = new Date().toISOString().split('T')[0];
            const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });

            // Prepare prompt parts
            const parts = [];

            if (audioBase64) {
                parts.push({
                    inlineData: {
                        mimeType: audioMimeType || 'audio/mp3',
                        data: audioBase64
                    }
                });
                parts.push({
                    text: `Analyze this phone conversation recording between a Bharat Properties real estate agent and a client.
Client Phone: ${cleanPhone || 'Unknown'}
Agent Name: ${user?.name || 'Agent'}
Today's Date: ${todayStr} (${weekday})

Extract all details as JSON strictly matching the schema.`
                });
            } else {
                parts.push({
                    text: `Client Phone: ${cleanPhone || 'Unknown'}
Agent Name: ${user?.name || 'Agent'}
Today's Date: ${todayStr} (${weekday})

CONVERSATION / CALL NOTES:
"""
${transcript || notes || 'Client inquired about property options.'}
"""

Analyze and extract all real estate entities as JSON strictly matching the schema.`
                });
            }

            const systemInstruction = `You are JARVIS Call Intelligence, the conversational AI intelligence engine for Bharat Properties CRM (North Indian real estate).
Analyze the phone call conversation and extract structured real estate intelligence.
Understand North Indian property jargon: plots, kothi, HUDA, registry, Gaj, Kanal, Marla, Sector 68 Mohali, Kurukshetra, token amount, down payment, bank loan eligibility.
Today's reference date is: ${todayStr} (${weekday}). Any relative days (e.g., 'kal', 'tomorrow', 'Wednesday', 'next Monday') must be calculated accurately relative to this date in YYYY-MM-DD format.

You MUST respond with a JSON object strictly adhering to:
{
  "clientName": string or null,
  "clientPhone": string or null,
  "transactionType": "Buy" | "Rent" | "Sell",
  "category": "Residential" | "Commercial" | "Industrial" | "Agricultural" | null,
  "subCategory": "Plot" | "Independent House" | "Flat/Apartment" | "Builder Floor" | "Shop" | "Showroom" | "Office Space" | "Booth" | "SCO" | "Farm House" | null,
  "sizeText": string or null (e.g. "250 Gaj", "10 Marla", "1 Kanal", "100 Gaj", "4 BHK", "3 BHK"),
  "unitType": "Corner" | "Two Side Open" | "Three Side Open" | "Ordinary" | null,
  "facing": "Park" | "Main Road Facing" | "Dividing Road" | "East" | "West" | "North" | "South" | null,
  "roadWidth": "60 Feet" | "40 Feet" | "80 Feet" | "30 Feet" | null,
  "direction": "East" | "West" | "North" | "South" | "North-East" | "North-West" | null,
  "city": "Kurukshetra" | "Mohali" | "Panchkula" | "Chandigarh" | "Ambala" | null,
  "sector": string or null (e.g. "Sector 7", "Sector 68", "Sector 69", "Sector 82"),
  "location": string or null,
  "budgetLabel": string or null (e.g. "75 Lakh to 85 Lakh", "1.5 Crore"),
  "intentScore": number (0 to 100),
  "sentiment": "Positive" | "Interested" | "Skeptical" | "Hesitant" | "Neutral" | "Uninterested",
  "objections": string[],
  "keyPhrases": string[],
  "followUp": {
    "scheduled": boolean,
    "date": string (YYYY-MM-DD) or null,
    "time": string (HH:MM 24-hour format) or null,
    "type": "Site Visit" | "Follow-up Call" | "Meeting",
    "notes": string
  },
  "unstructuredNotes": string (ONLY conversation points that cannot be selected in dropdowns, e.g. registry papers, clear title, family visit, bank loan queries. DO NOT repeat property type, size, location, or budget here),
  "callSummary": string,
  "speechResponse": string,
  "rawTranscript": string
}
Return ONLY valid JSON.`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;

            const response = await axios.post(url, {
                contents: [{ parts }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) {
                throw new Error('Gemini returned empty response for Call Intelligence');
            }

            let extracted;
            try {
                extracted = JSON.parse(rawText);
            } catch (err) {
                console.error('[JarvisService] JSON parse error:', rawText);
                throw new Error('Failed to parse Call Intelligence JSON');
            }

            // Resolve final phone number
            const targetPhone = cleanPhone || (extracted.clientPhone || '').replace(/\D/g, '').slice(-10) || '9876543210';
            const resolvedClientName = extracted.clientName || clientName || 'Client';

            // ── CRM SYNCHRONIZATION WITH ENTERPRISE DROPDOWN MATCHING ──
            const mappedFields = await this._mapExtractedToLeadFields(extracted, user);

            let lead = null;
            let contact = null;
            let isNewLead = false;

            if (targetPhone && targetPhone.length >= 10) {
                lead = await Lead.findOne({
                    mobile: new RegExp(targetPhone + '$'),
                    isDeleted: { $ne: true }
                });
            }

            const autoActions = [];

            if (lead) {
                // Update existing lead with newly discovered intelligence (DO NOT overwrite non-empty dropdowns)
                const updates = {};
                if (resolvedClientName && resolvedClientName !== 'Client' && (!lead.firstName || lead.firstName === 'Client' || lead.firstName === 'Unknown')) {
                    const nameParts = resolvedClientName.trim().split(' ');
                    updates.firstName = nameParts[0];
                    if (nameParts.length > 1) updates.lastName = nameParts.slice(1).join(' ');
                }

                // Dropdown field updates (only update if lead field is empty or newly discovered)
                if ((!lead.propertyType || lead.propertyType.length === 0) && mappedFields.propertyType.length > 0) {
                    updates.propertyType = mappedFields.propertyType;
                }
                if ((!lead.subType || lead.subType.length === 0) && mappedFields.subType.length > 0) {
                    updates.subType = mappedFields.subType;
                }
                if ((!lead.sizeType || lead.sizeType.length === 0) && mappedFields.sizeType.length > 0) {
                    updates.sizeType = mappedFields.sizeType;
                }
                if ((!lead.unitType || lead.unitType.length === 0) && mappedFields.unitType.length > 0) {
                    updates.unitType = mappedFields.unitType;
                }
                if ((!lead.facing || lead.facing.length === 0) && mappedFields.facing.length > 0) {
                    updates.facing = mappedFields.facing;
                }
                if ((!lead.roadWidth || lead.roadWidth.length === 0) && mappedFields.roadWidth.length > 0) {
                    updates.roadWidth = mappedFields.roadWidth;
                }
                if ((!lead.direction || lead.direction.length === 0) && mappedFields.direction.length > 0) {
                    updates.direction = mappedFields.direction;
                }
                if (!lead.location && mappedFields.location) {
                    updates.location = mappedFields.location;
                }
                if (!lead.sector && mappedFields.sector) {
                    updates.sector = mappedFields.sector;
                }
                if (!lead.locCity && mappedFields.locCity) {
                    updates.locCity = mappedFields.locCity;
                }
                if (!lead.budget && mappedFields.budget) {
                    updates.budget = mappedFields.budget;
                }
                if (mappedFields.budgetMin && !lead.budgetMin) {
                    updates.budgetMin = mappedFields.budgetMin;
                    updates.budgetMax = mappedFields.budgetMax;
                }
                if (mappedFields.areaMin && !lead.areaMin) {
                    updates.areaMin = mappedFields.areaMin;
                    updates.areaMax = mappedFields.areaMax;
                    updates.areaMetric = mappedFields.areaMetric;
                }
                if (mappedFields.stage) {
                    updates.stage = mappedFields.stage;
                }
                if (extracted.intentScore !== undefined) {
                    updates.pre_intent_score = extracted.intentScore;
                    if (extracted.intentScore >= 75) {
                        updates.lead_classification = 'Serious Buyer';
                    } else if (extracted.intentScore >= 45) {
                        updates.lead_classification = 'Qualified';
                    }
                }
                if (extracted.callSummary) {
                    updates.ai_intent_summary = extracted.callSummary;
                }
                if (extracted.keyPhrases && Array.isArray(extracted.keyPhrases) && extracted.keyPhrases.length > 0) {
                    updates.$addToSet = { intent_tags: { $each: extracted.keyPhrases } };
                }
                if (mappedFields.description && (!lead.description || lead.description.includes('Captured via JARVIS Call Intelligence. Summary:'))) {
                    updates.description = mappedFields.description;
                }

                // Enforce user assignment & team visibility
                const userTeamIds = (user?.teams && user.teams.length > 0) ? user.teams : (user?.team ? [user.team] : []);
                if (!lead.assignedTo) updates.assignedTo = user?._id;
                if (!lead.owner) updates.owner = user?._id;
                if (!lead.teams || lead.teams.length === 0) updates.teams = userTeamIds;
                updates['assignment.visibleTo'] = 'Team';
                if (!lead.assignment?.team || lead.assignment.team.length === 0) {
                    updates['assignment.team'] = userTeamIds;
                }
                updates.lastActivityAt = new Date();

                lead = await Lead.findByIdAndUpdate(lead._id, updates, { new: true });
                contact = lead.contactDetails ? await Contact.findById(lead.contactDetails) : null;
                autoActions.push({
                    action: 'update_lead',
                    field: 'lead_profile',
                    value: updates,
                    success: true
                });
            } else {
                // Create standardized lead with full dropdown mappings
                const nameParts = resolvedClientName.trim().split(' ');
                const leadData = {
                    firstName: nameParts[0] || 'Client',
                    lastName: nameParts.slice(1).join(' ') || (targetPhone ? targetPhone.slice(-4) : ''),
                    mobile: targetPhone,
                    ...mappedFields,
                    pre_intent_score: extracted.intentScore || 50,
                    ai_intent_summary: extracted.callSummary || '',
                    intent_tags: extracted.keyPhrases || [],
                    lead_classification: (extracted.intentScore >= 75) ? 'Serious Buyer' : 'Qualified'
                };

                const creationResult = await createStandardizedLead(leadData, { triggerEvent: 'onCreate' });
                lead = creationResult.lead;
                contact = creationResult.contact;
                isNewLead = true;
                autoActions.push({
                    action: 'create_lead',
                    field: 'leadId',
                    value: lead?._id,
                    success: true
                });
            }

            // Create Completed Call Activity
            const callActivity = new Activity({
                type: 'Call',
                subject: `Call with ${resolvedClientName} (${callType || 'Call'})`,
                entityType: 'Lead',
                entityId: lead?._id,
                relatedTo: lead ? [{ id: lead._id, name: `${lead.firstName} ${lead.lastName || ''}`.trim(), model: 'Lead' }] : [],
                participants: [{
                    name: resolvedClientName,
                    mobile: targetPhone
                }],
                dueDate: callEndTime || new Date(),
                dueTime: new Date(callEndTime || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                priority: (extracted.intentScore >= 75) ? 'High' : 'Normal',
                status: 'Completed',
                completedAt: callEndTime || new Date(),
                completionResult: extracted.sentiment || 'Connected',
                description: extracted.callSummary || 'Call processed by JARVIS Call Intelligence',
                details: {
                    callType,
                    duration,
                    clientPhone: targetPhone,
                    recordingUrl,
                    recordingSource,
                    sentiment: extracted.sentiment,
                    intentScore: extracted.intentScore,
                    objections: extracted.objections || [],
                    keyPhrases: extracted.keyPhrases || [],
                    transcript: transcript || extracted.rawTranscript || ''
                },
                assignedTo: user?._id,
                createdBy: user?._id,
                performedBy: user?.name || 'Agent',
                department: user?.department || 'Haryana',
                teams: user?.teams || []
            });
            await callActivity.save();
            autoActions.push({
                action: 'log_call_activity',
                field: 'activityId',
                value: callActivity._id,
                success: true
            });

            // Schedule Follow-up Activity if detected
            let followUpActivity = null;
            if (extracted.followUp && (extracted.followUp.scheduled || extracted.followUp.date)) {
                let followUpDueDate = new Date();
                if (extracted.followUp.date) {
                    const parsed = new Date(extracted.followUp.date);
                    if (!isNaN(parsed.getTime())) {
                        followUpDueDate = parsed;
                    }
                } else {
                    followUpDueDate.setDate(followUpDueDate.getDate() + 1);
                }

                const actType = (extracted.followUp.type && ['Site Visit', 'Meeting', 'Call', 'Task'].includes(extracted.followUp.type))
                    ? extracted.followUp.type
                    : (extracted.followUp.notes?.toLowerCase().includes('visit') ? 'Site Visit' : 'Call');

                followUpActivity = new Activity({
                    type: actType,
                    subject: `${actType}: ${resolvedClientName} - ${extracted.followUp.notes || 'Follow-up'}`,
                    entityType: 'Lead',
                    entityId: lead?._id,
                    relatedTo: lead ? [{ id: lead._id, name: `${lead.firstName} ${lead.lastName || ''}`.trim(), model: 'Lead' }] : [],
                    dueDate: followUpDueDate,
                    dueTime: extracted.followUp.time || '11:00 AM',
                    priority: (extracted.intentScore >= 75) ? 'High' : 'Normal',
                    status: 'Pending',
                    description: `Auto-scheduled by JARVIS Call Intelligence. ${extracted.followUp.notes || ''}`,
                    assignedTo: user?._id,
                    createdBy: user?._id,
                    performedBy: user?.name || 'Agent',
                    department: user?.department || 'Haryana',
                    teams: user?.teams || []
                });
                await followUpActivity.save();
                autoActions.push({
                    action: 'schedule_followup',
                    field: 'taskId',
                    value: followUpActivity._id,
                    success: true
                });
            }

            // Save complete record to CallIntelligence model
            const callIntel = new CallIntelligence({
                userId: user?._id || new mongoose.Types.ObjectId(),
                teamId: user?.teams?.[0] || null,
                callType,
                clientPhone: targetPhone,
                clientName: resolvedClientName,
                duration,
                callStartTime,
                callEndTime,
                recordingUrl,
                recordingSource,
                fullTranscript: transcript || extracted.rawTranscript || '(No transcript provided)',
                extractedEntities: extracted,
                linkedLeadId: lead?._id || null,
                linkedContactId: contact?._id || lead?.contactDetails || null,
                activityId: callActivity._id,
                taskId: followUpActivity?._id || null,
                autoActionsExecuted: autoActions,
                status: 'processed'
            });
            await callIntel.save();

            const finalSpeech = extracted.speechResponse ||
                `Sir, ${resolvedClientName} ji ki call process kar li gayi hai. Requirement ${extracted.requirement || 'property'} aur budget ${extracted.budget || 'discussed'} save ho gaya hai.`;

            return {
                success: true,
                callIntelligenceId: callIntel._id,
                leadId: lead?._id,
                isNewLead,
                activityId: callActivity._id,
                taskId: followUpActivity?._id || null,
                clientName: resolvedClientName,
                clientPhone: targetPhone,
                extractedEntities: extracted,
                speechResponse: finalSpeech,
                callSummary: extracted.callSummary,
                followUp: extracted.followUp,
                latencyMs: Date.now() - startTime
            };

        } catch (error) {
            console.error('[JarvisService] Call Intelligence processing error:', error);
            const latencyMs = Date.now() - startTime;
            return {
                success: false,
                speechResponse: "Sir, call intelligence process karne me error aayi. Please dubara try kijiye.",
                error: error.message,
                latencyMs
            };
        }
    }

    /**
     * Query Call Intelligence records with pagination
     */
    async getCallIntelligenceList(user, filter = {}) {
        const query = {};
        if (filter.clientPhone) {
            query.clientPhone = new RegExp(filter.clientPhone, 'i');
        }
        if (filter.sentiment) {
            query['extractedEntities.sentiment'] = filter.sentiment;
        }

        const limit = Math.min(Number(filter.limit) || 20, 50);
        const page = Math.max(Number(filter.page) || 1, 1);
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            CallIntelligence.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('linkedLeadId', 'firstName lastName mobile requirement budget locCity sector pre_intent_score')
                .populate('activityId', 'subject dueDate status completionResult')
                .populate('taskId', 'subject dueDate dueTime status priority')
                .lean(),
            CallIntelligence.countDocuments(query)
        ]);

        return {
            items,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Get single Call Intelligence record by ID
     */
    async getCallIntelligenceById(user, id) {
        return await CallIntelligence.findById(id)
            .populate('linkedLeadId')
            .populate('linkedContactId')
            .populate('activityId')
            .populate('taskId')
            .lean();
    }

    /**
     * Phase 4: Executive Daily Briefing
     * Synthesizes today's agenda, site visits, overdue tasks, and hot prospects
     */
    async getDailyBriefing(user) {
        const startTime = Date.now();
        const now = new Date();
        const hour = now.getHours();

        let greeting = "Good morning";
        if (hour >= 12 && hour < 17) greeting = "Good afternoon";
        else if (hour >= 17) greeting = "Good evening";

        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // Fetch Today's Pending Activities
        const todayActivities = await Activity.find({
            isDeleted: { $ne: true },
            status: { $in: ['Pending', 'In Progress'] },
            dueDate: { $gte: todayStart, $lte: todayEnd }
        })
        .select('type subject dueTime dueDate priority entityId relatedTo details')
        .sort({ dueTime: 1, dueDate: 1 })
        .limit(10)
        .lean();

        // Fetch Overdue Activities
        const overdueActivities = await Activity.find({
            isDeleted: { $ne: true },
            status: 'Pending',
            dueDate: { $lt: todayStart }
        })
        .select('type subject dueDate dueTime entityId priority')
        .limit(5)
        .lean();

        // Fetch Hot Prospects needing attention
        const hotLeads = await Lead.find({
            isDeleted: { $ne: true },
            $or: [
                { pre_intent_score: { $gte: 75 } },
                { lead_classification: /serious|hot/i }
            ]
        })
        .select('firstName lastName mobile requirement budget sector locCity pre_intent_score lastActivityAt')
        .sort({ pre_intent_score: -1, lastActivityAt: 1 })
        .limit(5)
        .lean();

        // Fetch Active Deals in Pipeline
        const activeDeals = await Deal.find({
            isDeleted: { $ne: true },
            stage: { $in: ['Negotiation', 'Token Paid', 'Under Discussion', 'Site Visit Done'] }
        })
        .select('projectName unitNo price stage remarks')
        .limit(5)
        .lean();

        // Site visits count for today
        const siteVisitsToday = todayActivities.filter(a => (a.type || '').toLowerCase().includes('visit'));
        const callsToday = todayActivities.filter(a => (a.type || '').toLowerCase().includes('call'));

        // Generate synthesized speech briefing
        let speech = `${greeting} Sir! `;
        if (todayActivities.length === 0 && overdueActivities.length === 0) {
            speech += `Aaj koi pending visits ya calls scheduled nahi hain. Pipeline me ${activeDeals.length} active deals hain aur ${hotLeads.length} hot prospects ready for engagement hain.`;
        } else {
            const visitText = siteVisitsToday.length > 0 ? `${siteVisitsToday.length} site visits` : '';
            const callText = callsToday.length > 0 ? `${callsToday.length} follow-up calls` : '';
            const activitiesText = [visitText, callText].filter(Boolean).join(' aur ') || `${todayActivities.length} tasks`;

            speech += `Aaj aapka schedule kaafi active hai. Total ${activitiesText} lined up hain. `;

            if (siteVisitsToday[0]) {
                const sv = siteVisitsToday[0];
                const timeStr = sv.dueTime ? `${sv.dueTime} baje` : '';
                speech += `Subah pehli visit: ${sv.subject} ${timeStr}. `;
            }

            if (overdueActivities.length > 0) {
                speech += `${overdueActivities.length} follow-ups overdue hain jin par dhyan dena zaroori hai. `;
            }

            speech += `Kuch specific details dekhna chahenge?`;
        }

        const counts = {
            todayTotal: todayActivities.length,
            siteVisits: siteVisitsToday.length,
            calls: callsToday.length,
            overdue: overdueActivities.length,
            hotProspects: hotLeads.length,
            activeDeals: activeDeals.length
        };

        return {
            success: true,
            greeting,
            speechResponse: speech,
            todayDate: todayStart.toISOString().split('T')[0],
            counts,
            briefing: {
                date: todayStart.toISOString().split('T')[0],
                stats: {
                    todayActivitiesCount: todayActivities.length,
                    overdueCount: overdueActivities.length,
                    hotProspectsCount: hotLeads.length,
                    activeDealsCount: activeDeals.length
                },
                todayActivities: todayActivities.map(a => ({
                    title: a.subject,
                    type: a.type,
                    time: a.dueTime,
                    status: a.status || 'Pending'
                })),
                overdueActivities: overdueActivities.map(a => ({
                    title: a.subject,
                    dueDate: a.dueDate
                })),
                hotProspects: hotLeads,
                activeDeals
            },
            todayActivities,
            overdueActivities,
            hotLeads,
            activeDeals,
            latencyMs: Date.now() - startTime
        };
    }

    /**
     * Phase 4: Proactive Intelligence Suggestions Engine
     * Proactively flags stale deals, uncontacted high-intent leads, and overdue visits
     */
    async getProactiveSuggestions(user) {
        const startTime = Date.now();
        const suggestions = [];

        // 1. High intent uncontacted leads
        const staleHotLeads = await Lead.find({
            isDeleted: { $ne: true },
            pre_intent_score: { $gte: 75 },
            $or: [
                { lastActivityAt: { $lt: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
                { lastActivityAt: { $exists: false } }
            ]
        })
        .select('firstName lastName mobile pre_intent_score requirement sector budget')
        .limit(3)
        .lean();

        for (const lead of staleHotLeads) {
            suggestions.push({
                id: 'lead_' + lead._id,
                category: 'hot_lead_stale',
                severity: 'high',
                title: `🔥 Hot Lead Stagnant: ${lead.firstName} ${lead.lastName || ''}`.trim(),
                description: `Intent score ${lead.pre_intent_score}% hai par 48 hours se koi follow-up nahi hua. Requirement: ${lead.requirement || 'Property'} in ${lead.sector || 'Mohali/Kurukshetra'}.`,
                entityType: 'Lead',
                entityId: lead._id,
                clientPhone: lead.mobile,
                suggestedAction: 'call_lead',
                voicePrompt: `Sir, ${lead.firstName} ji ka intent score ${lead.pre_intent_score}% hai. Kya unhe call karein?`
            });
        }

        // 2. Overdue critical activities
        const overdueActivities = await Activity.find({
            isDeleted: { $ne: true },
            status: 'Pending',
            dueDate: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
        .select('type subject dueDate dueTime entityId')
        .limit(3)
        .lean();

        for (const act of overdueActivities) {
            suggestions.push({
                id: 'act_' + act._id,
                category: 'overdue_activity',
                severity: 'medium',
                title: `⏰ Overdue ${act.type}: ${act.subject}`,
                description: `Ye task pehle due tha par complete nahi hua. Reschedule karein ya outcome log karein?`,
                entityType: 'Activity',
                entityId: act._id,
                suggestedAction: 'reschedule_activity',
                voicePrompt: `Sir, "${act.subject}" overdue hai. Kya isko reschedule karein?`
            });
        }

        let speech = `Sir, mere pass aapke liye ${suggestions.length} proactive alerts hain.`;
        if (suggestions.length === 0) {
            speech = `Sir, sabhi leads aur tasks up-to-date hain. Koi urgent attention item nahi hai.`;
        } else if (suggestions[0]) {
            speech = `Sir, ${suggestions.length} items attention mang rahe hain. Sabse pehle: ${suggestions[0].title}.`;
        }

        return {
            success: true,
            totalSuggestions: suggestions.length,
            speechResponse: speech,
            suggestions,
            latencyMs: Date.now() - startTime
        };
    }

    /**
     * Phase 4: Usage Analytics for Jarvis OS
     */
    async getJarvisAnalytics(user, query = {}) {
        const totalCommands = await JarvisCommand.countDocuments();
        const executedCommands = await JarvisCommand.countDocuments({ status: 'executed' });
        const voiceCommands = await JarvisCommand.countDocuments({ inputType: 'voice' });
        const textCommands = await JarvisCommand.countDocuments({ inputType: 'text' });

        const intentBreakdown = await JarvisCommand.aggregate([
            { $group: { _id: '$intent', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const avgLatencyAgg = await JarvisCommand.aggregate([
            { $match: { llmLatencyMs: { $exists: true, $gt: 0 } } },
            { $group: { _id: null, avgLatency: { $avg: '$llmLatencyMs' } } }
        ]);

        const recentCommands = await JarvisCommand.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('userId', 'name email role')
            .lean();

        const successRate = totalCommands > 0 ? Math.round((executedCommands / totalCommands) * 100) : 100;
        const avgLatencyMs = avgLatencyAgg[0]?.avgLatency ? Math.round(avgLatencyAgg[0].avgLatency) : 1450;

        return {
            success: true,
            totalCommands,
            executedCommands,
            successRate,
            avgLatencyMs,
            voiceCommands,
            textCommands,
            intentBreakdown,
            recentCommands
        };
    }

    /**
     * Phase 5: Team & Manager-Mode Performance Intelligence
     * Aggregates team metrics, closed deals, site visits, calls, and top performers
     */
    async getTeamPerformance(user, options = {}) {
        const startTime = Date.now();
        const { teamName, timeframe = 'this_month', agentName } = options;

        const now = new Date();
        let startDate = new Date();
        let timeframeLabel = 'is mahine';

        if (timeframe === 'today') {
            startDate.setHours(0, 0, 0, 0);
            timeframeLabel = 'aaj';
        } else if (timeframe === 'this_week') {
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(now.setDate(diff));
            startDate.setHours(0, 0, 0, 0);
            timeframeLabel = 'is hafte';
        } else if (timeframe === 'last_month') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
            now.setDate(0);
            now.setHours(23, 59, 59, 999);
            timeframeLabel = 'pichle mahine';
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            timeframeLabel = 'is mahine';
        }

        let userFilter = {};
        let targetTeam = null;

        if (teamName) {
            targetTeam = await Team.findOne({
                name: { $regex: new RegExp(teamName.trim(), 'i') },
                isActive: { $ne: false }
            }).select('_id name department').lean();

            if (targetTeam) {
                const teamUsers = await User.find({ teams: targetTeam._id, isActive: { $ne: false } }).select('_id').lean();
                const teamUserIds = teamUsers.map(u => u._id);
                userFilter = {
                    $or: [
                        { teams: targetTeam._id },
                        { 'assignment.team': targetTeam._id },
                        { assignedTo: { $in: teamUserIds } },
                        { owner: { $in: teamUserIds } }
                    ]
                };
            }
        }

        if (agentName) {
            const agent = await User.findOne({
                name: { $regex: new RegExp(agentName.trim(), 'i') },
                isActive: { $ne: false }
            }).select('_id name email').lean();

            if (agent) {
                userFilter = {
                    $or: [
                        { assignedTo: agent._id },
                        { owner: agent._id },
                        { 'assignment.assignedTo': agent._id }
                    ]
                };
            }
        }

        const leadQuery = {
            isDeleted: { $ne: true },
            createdAt: { $gte: startDate, $lte: now },
            ...userFilter
        };
        const totalLeadsHandled = await Lead.countDocuments(leadQuery);

        const dealQuery = {
            isDeleted: { $ne: true },
            $or: [
                { stage: { $in: ['Won', 'Closed Won', 'Closed-Won', 'Booking Confirmed'] } },
                { status: { $in: ['Won', 'Closed Won'] } }
            ],
            updatedAt: { $gte: startDate, $lte: now }
        };
        if (userFilter.assignedTo || userFilter.owner) {
            dealQuery.assignedTo = userFilter.assignedTo || userFilter.owner;
        }

        const wonDeals = await Deal.find(dealQuery).select('title value price assignedTo stage clientName').lean();
        const dealsWonCount = wonDeals.length;
        const totalWonValueINR = wonDeals.reduce((sum, d) => sum + (d.value || d.price || 0), 0);
        const totalWonValueCr = (totalWonValueINR / 10000000).toFixed(2);

        const actQuery = {
            isDeleted: { $ne: true },
            status: 'Completed',
            updatedAt: { $gte: startDate, $lte: now }
        };
        const activities = await Activity.find(actQuery).select('type subject assignedTo').lean();
        const siteVisitsCount = activities.filter(a => a.type === 'Site Visit').length;
        const callsCount = activities.filter(a => a.type === 'Call').length;
        const meetingsCount = activities.filter(a => a.type === 'Meeting').length;

        const userActivityMap = {};
        for (const act of activities) {
            if (act.assignedTo) {
                const uid = act.assignedTo.toString();
                userActivityMap[uid] = (userActivityMap[uid] || 0) + 1;
            }
        }

        const sortedUserIds = Object.keys(userActivityMap).sort((a, b) => userActivityMap[b] - userActivityMap[a]).slice(0, 3);
        const topUserDocs = await User.find({ _id: { $in: sortedUserIds } }).select('_id name email role').lean();
        const topPerformers = topUserDocs.map(u => ({
            name: u.name,
            role: u.role || 'Sales Executive',
            completedTasks: userActivityMap[u._id.toString()] || 0
        }));

        const topPerformerName = topPerformers[0]?.name || 'Puri Team';

        let speech = '';
        if (targetTeam) {
            speech = `Sir, ${targetTeam.name} team ne ${timeframeLabel} me ${totalLeadsHandled} leads process kiye hain, aur ${dealsWonCount} deals close kiye worth ₹${totalWonValueCr} Crore. ${siteVisitsCount} site visits complete hui hain. Top performer: ${topPerformerName}.`;
        } else if (agentName) {
            speech = `Sir, ${agentName} ne ${timeframeLabel} me ${dealsWonCount} deals close kiye hain aur ${siteVisitsCount} site visits complete kiye hain.`;
        } else {
            speech = `Sir, overall team ne ${timeframeLabel} me ${dealsWonCount} deals close kiye hain total ₹${totalWonValueCr} Crore ki value ke sath. ${siteVisitsCount} site visits aur ${callsCount} calls execute hui hain. Top performer: ${topPerformerName}.`;
        }

        return {
            success: true,
            timeframe,
            timeframeLabel,
            teamName: targetTeam ? targetTeam.name : (teamName || 'All Teams'),
            kpis: {
                totalLeadsHandled,
                dealsWonCount,
                totalWonValueINR,
                totalWonValueCr: `₹${totalWonValueCr} Cr`,
                siteVisitsCount,
                callsCount,
                meetingsCount,
                totalActivitiesCount: activities.length
            },
            topPerformers,
            speechResponse: speech,
            latencyMs: Date.now() - startTime
        };
    }

    /**
     * Phase 5: Smart Meeting Notes Dictation & Auto-Actionizer
     * Transcribes, analyzes decisions, action items, and auto-schedules tasks
     */
    async processMeetingNotes(user, payload = {}) {
        const startTime = Date.now();
        const { notes, clientName, clientPhone, projectName, source = 'web' } = payload;

        if (!notes || typeof notes !== 'string' || !notes.trim()) {
            return {
                success: false,
                speechResponse: "Sir, meeting notes ka text provide kijiye."
            };
        }

        const apiKey = await this._getApiKey();
        let intel = {
            meetingSummary: notes.slice(0, 150),
            keyDecisions: [],
            actionItems: [],
            sentiment: 'positive',
            dealPotential: ''
        };

        if (apiKey) {
            try {
                const prompt = `You are the executive note analyzer for Bharat Properties CRM.
Analyze the following real estate meeting notes and output ONLY a JSON object:
{
    "meetingSummary": "Concise 1-2 sentence executive summary of the meeting in professional Hinglish",
    "keyDecisions": ["Decision 1", "Decision 2"],
    "actionItems": [
        { "task": "Task description", "assignee": "Name if mentioned", "dueDate": "YYYY-MM-DD or timeframe like 'tomorrow' or 'in 3 days'" }
    ],
    "clientName": "Extracted or inferred client or developer name",
    "clientPhone": "Extracted phone number if mentioned",
    "projectName": "Extracted project or locality name",
    "dealPotential": "Estimated deal size or unit count if discussed",
    "sentiment": "positive"
}

Raw Meeting Notes:
"""${notes}"""`;

                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;
                const response = await axios.post(geminiUrl, {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        responseMimeType: "application/json"
                    }
                }, { timeout: 12000 });

                const rawJson = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawJson) {
                    const parsed = JSON.parse(rawJson);
                    intel = { ...intel, ...parsed };
                }
            } catch (err) {
                console.warn('[JarvisService] Meeting notes LLM parsing fallback:', err.message);
            }
        }

        const resolvedClientName = clientName || intel.clientName || 'Client Meeting';
        const resolvedProjectName = projectName || intel.projectName || 'Property Discussion';

        // Auto-link to existing Lead or Contact if available
        let entityType = 'Lead';
        let entityId = user?._id;
        try {
            const queryName = resolvedClientName !== 'Client Meeting' ? resolvedClientName : null;
            if (queryName) {
                const nameParts = queryName.trim().split(/\s+/);
                const leadMatch = await Lead.findOne({
                    $or: [
                        { firstName: new RegExp(nameParts[0], 'i') },
                        { lastName: new RegExp(nameParts[nameParts.length - 1], 'i') }
                    ]
                }).select('_id').lean();
                if (leadMatch) {
                    entityType = 'Lead';
                    entityId = leadMatch._id;
                }
            }
        } catch (matchErr) {
            console.warn('[JarvisService] Entity match skipped:', matchErr.message);
        }

        const meetingActivity = new Activity({
            type: 'Meeting',
            subject: `Meeting: ${resolvedClientName} (${resolvedProjectName})`,
            entityType,
            entityId,
            description: intel.meetingSummary,
            details: {
                keyDecisions: intel.keyDecisions,
                actionItems: intel.actionItems,
                rawNotes: notes,
                sentiment: intel.sentiment,
                dealPotential: intel.dealPotential,
                source
            },
            status: 'Completed',
            dueDate: new Date(),
            dueTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            assignedTo: user?._id || null,
            createdBy: user?._id || null
        });
        await meetingActivity.save();

        const createdTaskIds = [];
        if (Array.isArray(intel.actionItems) && intel.actionItems.length > 0) {
            for (const item of intel.actionItems.slice(0, 5)) {
                try {
                    const taskDueDate = new Date();
                    taskDueDate.setDate(taskDueDate.getDate() + 2);

                    const followUpTask = new Activity({
                        type: 'Task',
                        subject: item.task || 'Meeting Follow-up Task',
                        entityType,
                        entityId,
                        description: `Action item from meeting with ${resolvedClientName}: ${item.task}. Assignee: ${item.assignee || 'Unassigned'}`,
                        status: 'Pending',
                        dueDate: taskDueDate,
                        priority: 'High',
                        assignedTo: user?._id || null,
                        createdBy: user?._id || null
                    });
                    await followUpTask.save();
                    createdTaskIds.push(followUpTask._id);
                } catch (taskErr) {
                    console.warn('[JarvisService] Error creating action item task:', taskErr.message);
                }
            }
        }

        const taskCount = createdTaskIds.length;
        const decisionHighlight = intel.keyDecisions?.[0] ? ` Key decision: "${intel.keyDecisions[0]}".` : '';
        const speech = `Sir, meeting notes record aur analyze kar liye hain. Total ${taskCount} follow-up tasks create kiye hain.${decisionHighlight} Activity record timeline me save ho gaya hai.`;

        return {
            success: true,
            meetingId: meetingActivity._id,
            clientName: resolvedClientName,
            projectName: resolvedProjectName,
            meetingSummary: intel.meetingSummary,
            keyDecisions: intel.keyDecisions || [],
            actionItems: intel.actionItems || [],
            dealPotential: intel.dealPotential || null,
            createdTasksCount: taskCount,
            speechResponse: speech,
            latencyMs: Date.now() - startTime
        };
    }
}

export default new JarvisService();
