import Intake from '../../models/Intake.js';

// We will implement a basic similarity function if the library isn't available
function calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    // Simple word overlap for title/location similarity
    const words1 = s1.split(/\s+/);
    const words2 = s2.split(/\s+/);
    
    let matches = 0;
    for (const w1 of words1) {
        if (words2.includes(w1)) matches++;
    }
    
    return matches / Math.max(words1.length, words2.length);
}

class DuplicateIntelligenceEngine {
    
    /**
     * Analyze a new intake record against existing records to detect duplicates.
     * @param {Object} newRecord - The newly extracted intake record.
     * @returns {Object} { duplicate_probability, possible_duplicate_ids, merge_suggestions }
     */
    async analyze(newRecord) {
        let maxProbability = 0;
        let possibleDuplicateIds = [];
        let mergeSuggestions = [];

        // Fetch recent records to compare against (e.g., last 30 days) to avoid massive queries
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Optimization: Only pull records that share at least one potential matching criteria
        // to avoid comparing against the entire database.
        
        let queryConditions = [];
        
        // 1. Phone numbers match (High probability)
        if (newRecord.contact_numbers && newRecord.contact_numbers.length > 0) {
            queryConditions.push({ contact_numbers: { $in: newRecord.contact_numbers } });
        }
        
        // 2. Exact Pricing match (Medium probability, needs other signals)
        if (newRecord.price) {
            queryConditions.push({ price: newRecord.price });
        }
        
        // 3. Exact Location match
        if (newRecord.location) {
            queryConditions.push({ location: newRecord.location });
        }

        // If no criteria to match on, return 0 probability
        if (queryConditions.length === 0) {
             return {
                duplicate_probability: 0,
                possible_duplicate_ids: [],
                merge_suggestions: []
            };
        }

        const candidates = await Intake.find({
            _id: { $ne: newRecord._id }, // Don't compare with itself
            createdAt: { $gte: thirtyDaysAgo },
            $or: queryConditions
        }).limit(50); // Limit to top 50 recent potential matches

        for (const candidate of candidates) {
            let score = 0;
            let currentSuggestions = [];

            // Phone Number Check
            if (newRecord.contact_numbers && candidate.contact_numbers) {
                const commonPhones = newRecord.contact_numbers.filter(phone => 
                    candidate.contact_numbers.includes(phone)
                );
                if (commonPhones.length > 0) {
                    score += 40; // High confidence signal
                    currentSuggestions.push(`Merge contact numbers: Found matching phone ${commonPhones.join(', ')}`);
                }
            }

            // Pricing Similarity Check
            if (newRecord.price && candidate.price) {
                // Remove non-numeric chars for basic comparison
                const p1 = String(newRecord.price).replace(/[^0-9.]/g, '');
                const p2 = String(candidate.price).replace(/[^0-9.]/g, '');
                
                if (p1 && p2) {
                    const price1 = parseFloat(p1);
                    const price2 = parseFloat(p2);
                    
                    if (price1 === price2) {
                        score += 30;
                        currentSuggestions.push(`Exact price match: ${newRecord.price}`);
                    } else if (Math.abs(price1 - price2) / Math.max(price1, price2) < 0.05) {
                        // Within 5% difference
                        score += 15;
                        currentSuggestions.push(`Close price match: ${newRecord.price} vs ${candidate.price}`);
                    }
                }
            }

            // Location Similarity Check
            if (newRecord.location && candidate.location) {
                const locSim = calculateStringSimilarity(newRecord.location, candidate.location);
                if (locSim > 0.8) {
                    score += 20;
                    currentSuggestions.push(`Highly similar location: ${candidate.location}`);
                } else if (locSim > 0.5) {
                    score += 10;
                }
            }

            // Size Similarity Check
            if (newRecord.size && candidate.size) {
                 const s1 = String(newRecord.size).replace(/[^0-9.]/g, '');
                 const s2 = String(candidate.size).replace(/[^0-9.]/g, '');
                 if (s1 === s2 && s1 !== '') {
                     score += 15;
                     currentSuggestions.push(`Exact size match: ${newRecord.size}`);
                 }
            }

            // Title Similarity Check
            if (newRecord.title && candidate.title) {
                const titleSim = calculateStringSimilarity(newRecord.title, candidate.title);
                if (titleSim > 0.7) {
                    score += 10;
                }
            }

            // Cap score at 99
            score = Math.min(score, 99);

            if (score > maxProbability) {
                maxProbability = score;
                // If it's the highest so far, prioritize its suggestions
                if (score > 50) {
                    mergeSuggestions = currentSuggestions;
                }
            }

            // If score is decently high, add to possible duplicate list
            if (score >= 60) {
                 possibleDuplicateIds.push(candidate._id);
            }
        }

        return {
            duplicate_probability: maxProbability,
            possible_duplicate_ids: possibleDuplicateIds,
            merge_suggestions: mergeSuggestions
        };
    }
}

export default new DuplicateIntelligenceEngine();
