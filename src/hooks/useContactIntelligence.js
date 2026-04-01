import { useMemo } from 'react';
import { calculateLeadScore } from '../utils/leadScoring';

/**
 * Hook to compute AI-driven intelligence stats for a contact or lead.
 * Extracted from ContactDetail.jsx for better maintainability and performance.
 */
export const useContactIntelligence = ({
  contact,
  activities = [],
  propertyConfig = {},
  liveScoreData = { score: 0, label: 'Cold', color: '#94a3b8', tempClass: 'cold' },
  currentTime = new Date()
} = {}) => {
  const { scoringAttributes, activityMasterFields, scoreBands, getLookupValue } = propertyConfig;

  const aiStats = useMemo(() => {
    if (!contact) return null;

    const today = currentTime.toISOString().split('T')[0];

    // Helper for rendering lookup values
    const renderLookup = (field, fallback = '-') => {
      if (!field) return fallback;
      if (typeof field === 'object') {
        return field.lookup_value || field.name || field.projectName || field.title || field.label || fallback;
      }
      if (typeof field === 'string' && field.match(/^[0-9a-fA-F]{24}$/) && getLookupValue) {
        return getLookupValue(null, field) || fallback;
      }
      return typeof field === 'string' ? field : fallback;
    };

    const categorized = activities.reduce((acc, act) => {
      const status = act.status || (act.type ? 'Completed' : 'Upcoming');
      if (status === 'Completed' || act.type) {
        acc.completed.push(act);
      } else if (act.dueDate < today) {
        acc.due.push(act);
      } else {
        acc.upcoming.push(act);
      }
      return acc;
    }, { due: [], upcoming: [], completed: [] });

    const scoring = calculateLeadScore(contact || {}, activities, { scoringAttributes, activityMasterFields, scoreBands });

    // AI Intelligence: Lead Score Calculation
    const leadScore = {
      total: liveScoreData.score > 0 ? liveScoreData.score : Math.max(scoring.total || 0, contact?.intent_index || 0),
      formScore: scoring.formScore,
      activityScore: scoring.activityScore,
      detail: scoring.breakdown,
      intent: liveScoreData.score > 0 ? liveScoreData.label : (scoring.intent || 'Unknown'),
      temp: liveScoreData.score > 0
        ? { label: liveScoreData.label, class: liveScoreData.tempClass, color: liveScoreData.color }
        : (scoring.temperature || { label: 'COLD', class: 'cold', color: '#94a3b8' }),
      categorized,
      ownedProperties: [] // Note: Populated separately in the main component via fetchRelatedData
    };

    // Real Deal Probability mapping
    const dealProbScore = contact?.dealProbability || leadScore.total;
    const dealProbability = {
      score: dealProbScore,
      trend: 'up',
      factors: [
        leadScore.total > 70 ? 'High intent index' : 'Consistent engagement',
        categorized.completed.length > 5 ? 'High activity volume' : 'Active follow-up',
        'Matched requirements'
      ]
    };

    const priceInsight = {
      listed: '₹1.30 Cr',
      suggested: '₹1.18 Cr – ₹1.24 Cr',
      reasons: [
        'Similar properties closed at ₹1.22 Cr',
        'Owner flexibility: Medium',
        'Buyer engagement: High'
      ],
      confidence: 85
    };

    const ownerIntelligence = {
      type: 'Investor',
      scope: 'Medium',
      pastBehavior: 'Accepted ₹5L below asking',
      firmness: 'Firm on price in last 2 deals',
      urgency: 'Immediate',
      tip: 'Owner likely to accept 3–5% below asking if site visit is confirmed.',
      leverage: 'Payment speed'
    };

    const journeySteps = [
      { label: 'Inquiry', date: 'Jan 15', status: 'completed', property: 'Sec 17 Plot' },
      { label: 'Shortlisted', date: 'Jan 18', status: 'completed', property: 'Sec 17 Plot' },
      { label: 'Site Visit', date: 'Jan 20', status: 'completed', agent: 'Suresh K.' },
      { label: 'Negotiation', date: 'Today', status: 'active', subtext: 'AI Suggestion: ₹1.22 Cr' },
      { label: 'Deal Created', date: '-', status: 'pending' },
      { label: 'Closed', date: '-', status: 'pending' }
    ];

    const rejectionAlert = "Avoid properties above ₹1.3 Cr or in Sector 5";

    // AI Intelligence: Real Intent Mapping
    const purchaseIntent = {
      level: contact?.lead_classification || leadScore.intent,
      emoji: (contact?.intent_index || leadScore.total) >= 80 ? '🔥' : (contact?.intent_index || leadScore.total) >= 60 ? '🌤' : '❄',
      confidence: contact?.lead_classification ? 'AI Qualified' : '95%',
      color: leadScore.temp.color
    };

    // AI Intelligence: Real Risk Calculation
    const lastActDate = contact?.lastActivityAt || contact?.updatedAt || contact?.createdAt;
    const daysSinceLastAct = lastActDate ? Math.floor((currentTime - new Date(lastActDate)) / 86400000) : 0;

    let riskStatus = 'Stable';
    let riskReason = 'Active engagement';
    let riskColor = '#0ea5e9';

    if (daysSinceLastAct > 14) {
      riskStatus = 'High Risk';
      riskReason = `No activity for ${daysSinceLastAct} days`;
      riskColor = '#ef4444';
    } else if (daysSinceLastAct > 7) {
      riskStatus = 'At Risk';
      riskReason = 'Slow follow-up cadence';
      riskColor = '#f59e0b';
    }

    const riskLevel = {
      status: riskStatus,
      reason: riskReason,
      color: riskColor
    };

    const priority = {
      level: leadScore.total >= 80 ? 'P1' : leadScore.total >= 60 ? 'P2' : 'P3',
      reason: riskStatus === 'High Risk' ? 'Urgent Re-engagement' : 'Negotiation Phase',
      color: leadScore.total >= 80 ? '#ef4444' : '#64748b'
    };

    const preferences = {
      locations: contact?.searchLocation ? [contact.searchLocation] : (contact?.locations?.length > 0 ? contact.locations.map(l => renderLookup(l)) : []),
      budget: (contact?.budgetMin || contact?.budgetMax) ?
        `₹${Number(contact.budgetMin || 0).toLocaleString()} - ${Number(contact.budgetMax || 0).toLocaleString()}` :
        (renderLookup(contact?.budget) || '-'),
      flexibility: contact?.whitePortion ? `${contact.whitePortion}%` : '0%',
      type: (Array.isArray(contact?.propertyType) && contact.propertyType[0]) ? renderLookup(contact.propertyType[0]) : (renderLookup(contact?.propertyType) || renderLookup(contact?.propertyCategory) || '-'),
      urgency: renderLookup(contact?.timeline) || (leadScore.total >= 80 ? 'Extreme' : 'Moderate'),
      dealType: renderLookup(contact?.requirement) || 'Direct Purchase',
      source: renderLookup(contact?.source) || '-',
      subSource: renderLookup(contact?.subSource) || '-',
      campaign: renderLookup(contact?.campaign) || '-',
      tags: contact?.tags || [],
      description: contact?.description || '',
      subType: (Array.isArray(contact?.subType) ? contact.subType : (contact?.subRequirement ? [contact.subRequirement] : [])).map(s => renderLookup(s)).filter(Boolean),
      area: (contact?.areaMin || contact?.areaMax) ? `${contact.areaMin || 0} - ${contact.areaMax || 0} ${renderLookup(contact.areaMetric) || ''}` : '-',
      unitType: (contact?.unitType || []).map(u => renderLookup(u)),
      transactionType: renderLookup(contact?.transactionType) || '-',
      funding: renderLookup(contact?.funding) || '-',
      furnishing: renderLookup(contact?.furnishing) || '-',
      range: contact?.range || '-'
    };

    const closingProbability = {
      current: dealProbability.score,
      stages: [
        { label: 'Inquiry', prob: 25, status: 'completed' },
        { label: 'Interest', prob: 40, status: 'completed' },
        { label: 'Shortlist', prob: 55, status: 'completed' },
        { label: 'Site Visit', prob: 70, status: 'completed' },
        { label: 'Negotiation', prob: 85, status: 'active' },
        { label: 'Closing', prob: 100, status: 'pending' }
      ],
      insight: `Engagement velocity: ${categorized.completed.length} total activities.`,
      history: `Last activity: ${daysSinceLastAct} days ago.`
    };

    // NEXT BEST ACTION (Agent Playbook) logic
    let playbookAction = "Send PPT and schedule site visit";
    if (!contact?.budget) {
      playbookAction = "Clarify budget requirement for better matching";
    } else if (daysSinceLastAct > 5) {
      playbookAction = "Follow up regarding previous discussion";
    } else if (leadScore.total > 80) {
      playbookAction = "Prepare final draft of the offer";
    }

    const commission = {
      value: '₹1.25 Cr',
      type: '2%',
      total: '₹2,50,000',
      splits: [
        { label: 'Buyer Side', value: '₹1.5 L' },
        { label: 'Owner Side', value: '₹1.0 L' }
      ],
      bonus: 'Incentive of ₹25k applicable if closed by month-end',
      risks: ['Documentation dependency: Pending CC', 'Payment risk: Medium']
    };

    const persona = {
      type: contact?.role_type || 'Buyer',
      label: contact?.role_type || 'Buyer',
      icon: (contact?.role_type || '').toLowerCase().includes('investor') ? 'briefcase' : 'user',
      color: '#8b5cf6',
      metrics: [
        { label: 'ROI', value: '18% Expected' },
        { label: 'Rental Yield', value: '4.2%' },
        { label: 'Exit Value (3y)', value: '₹1.8 Cr' }
      ],
      pitch: 'Share ROI sheet & discuss Bulk Deal'
    };

    const lossAnalysis = {
      summary: "Analysis based on historical patterns for similar leads.",
      primaryReasons: [
        { label: 'Price Mismatch', type: 'auto', confidence: 92, icon: 'tag' },
        { label: 'Delayed Follow-up', type: 'auto', confidence: 85, icon: 'clock' }
      ],
      contributingFactors: [
        { label: 'High Price Point', impact: 'High' }
      ],
      recoveryOptions: [
        { label: 'Offer lower budget alternatives', icon: 'home', description: 'Re-engage with budget-friendly options.' }
      ],
      couldHaveSaved: [
        { label: 'Faster Response', description: 'Leads followed within 24h have 40% higher conversion.' }
      ]
    };

    const propertyContext = {
      unitNumber: 'Unit #1',
      block: 'A Block',
      corner: 'Corner',
      facing: 'Park Facing',
      roadWidth: '100 Ft. Road',
      verification: 'Verified'
    };

    const financialDetails = {
      priceWord: 'One crore twenty-five lakh only',
      matchedDeals: contact?.matchedDealsCount || 0
    };

    return { 
      leadScore, 
      dealProbability, 
      priceInsight, 
      ownerIntelligence, 
      journeySteps, 
      rejectionAlert, 
      purchaseIntent, 
      riskLevel, 
      priority, 
      preferences, 
      closingProbability, 
      commission, 
      persona, 
      lossAnalysis, 
      propertyContext, 
      financialDetails, 
      playbookAction 
    };
  }, [contact, activities, scoringAttributes, activityMasterFields, scoreBands, getLookupValue, liveScoreData, currentTime]);

  return aiStats;
};
