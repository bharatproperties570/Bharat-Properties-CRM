const stripHtml = (html) => {
    if (!html) return '';
    // Remove scripts and styles
    let text = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '');
    text = text.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, '');
    // Replace tags with space
    text = text.replace(/<[^>]+>/g, ' ');
    // Handle entities
    text = text.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&#39;/g, "'")
               .replace(/&quot;/g, '"');
    // Normalize whitespace
    return text.replace(/\s+/g, ' ').trim();
};

export const parsePortalEmail = (subject, body) => {
    const cleanBody = stripHtml(body);
    const portal = detectPortal(subject, cleanBody);
    if (!portal) return null;

    let parsed = {
        name: null, // Start with null to detect parsing success
        mobile: null,
        email: null,
        listingDetails: null,
        portal: portal,
        raw: cleanBody
    };

    switch (portal) {
        case '99acres':
            parsed = parse99Acres(cleanBody, parsed);
            break;
        case 'RealEstateIndia':
            parsed = parseRealEstateIndia(cleanBody, parsed);
            break;
        case 'MagicBricks':
            parsed = parseMagicBricks(cleanBody, parsed);
            break;
        case 'Housing.com':
            parsed = parseHousing(cleanBody, parsed);
            break;
        case 'SquareYards':
            parsed = parseSquareYards(cleanBody, parsed);
            break;
        case 'CommonFloor':
            parsed = parseCommonFloor(cleanBody, parsed);
            break;
        case 'General Inquiry':
            parsed = parseGeneric(cleanBody, parsed);
            break;
        default:
            break;
    }

    return parsed;
};

const detectPortal = (subject, body) => {
    const text = (subject + ' ' + body).toLowerCase();
    if (text.includes('99acres')) return '99acres';
    if (text.includes('realestateindia')) return 'RealEstateIndia';
    if (text.includes('magicbricks')) return 'MagicBricks';
    if (text.includes('housing.com')) return 'Housing.com';
    if (text.includes('squareyards')) return 'SquareYards';
    if (text.includes('commonfloor')) return 'CommonFloor';
    
    // Check for generic inquiry keywords
    if (text.includes('new enquiry') || text.includes('lead from') || text.includes('property inquiry')) {
        return 'General Inquiry';
    }
    
    return null;
};

/**
 * 99acres Parser
 */
const parse99Acres = (body, data) => {
    // 1. Extract property details from the response sentence
    const propMatch = body.match(/You have received a response on (.*?) on 99acres\.com/i);
    if (propMatch) {
        data.listingDetails = propMatch[1].trim();
    }

    // 2. Try the modern format after "Details of the response"
    // Format: Details of the response [Name] [Email] [Mobile]
    const detailsKeyword = 'Details of the response';
    const detailsIndex = body.toLowerCase().indexOf(detailsKeyword.toLowerCase());
    if (detailsIndex !== -1) {
        const afterDetails = body.slice(detailsIndex + detailsKeyword.length).trim();
        // Just take the first few words/parts since we've normalized spaces
        const parts = afterDetails.split(' ');
        
        // Find email and mobile in the parts
        const emailIndex = parts.findIndex(p => p.includes('@'));
        const mobileIndex = parts.findIndex(p => p.match(/\+?\d{10,12}/));

        if (emailIndex !== -1 && emailIndex > 0) {
            // Everything before email is likely the name
            data.name = parts.slice(0, emailIndex).join(' ');
            data.email = parts[emailIndex];
        }
        
        if (mobileIndex !== -1) {
            data.mobile = parts[mobileIndex].replace(/[^0-9]/g, '').slice(-10);
        }
    }

    // 3. Fallback to key-value pattern
    if (!data.name || !data.mobile) {
        const nameMatch = body.match(/Name:\s*([^\r\n]+)/i);
        const mobileMatch = body.match(/Mobile:\s*([0-9+-\s]+)/i);
        const emailMatch = body.match(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);

        if (nameMatch) data.name = nameMatch[1].trim();
        if (mobileMatch) data.mobile = mobileMatch[1].replace(/[^0-9]/g, '').slice(-10);
        if (emailMatch && !data.email) data.email = emailMatch[1].trim();
    }

    return data;
};

/**
 * RealEstateIndia Parser
 */
const parseRealEstateIndia = (body, data) => {
    const nameMatch = body.match(/Sender Name:\s*([^\r\n]+)/i) || body.match(/Name:\s*([^\r\n]+)/i);
    const mobileMatch = body.match(/Mobile:\s*([0-9+-\s]+)/i) || body.match(/Phone:\s*([0-9+-\s]+)/i);
    const emailMatch = body.match(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const enquiryMatch = body.match(/Enquiry For:\s*([^\r\n]+)/i);

    if (nameMatch) data.name = nameMatch[1].trim();
    if (mobileMatch) data.mobile = mobileMatch[1].replace(/[^0-9]/g, '').slice(-10);
    if (emailMatch) data.email = emailMatch[1].trim();
    if (enquiryMatch) data.listingDetails = enquiryMatch[1].trim();

    return data;
};

/**
 * MagicBricks Parser
 */
const parseMagicBricks = (body, data) => {
    const nameMatch = body.match(/Name:\s*([^\r\n]+)/i);
    const mobileMatch = body.match(/Contact No:\s*([0-9+-\s]+)/i) || body.match(/Mobile:\s*([0-9+-\s]+)/i);
    const emailMatch = body.match(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const interestMatch = body.match(/Interested in:\s*([^\r\n]+)/i);

    if (nameMatch) data.name = nameMatch[1].trim();
    if (mobileMatch) data.mobile = mobileMatch[1].replace(/[^0-9]/g, '').slice(-10);
    if (emailMatch) data.email = emailMatch[1].trim();
    if (interestMatch) data.listingDetails = interestMatch[1].trim();

    return data;
};

/**
 * Housing.com Parser
 */
const parseHousing = (body, data) => {
    const nameMatch = body.match(/User Name:\s*([^\r\n]+)/i) || body.match(/Name:\s*([^\r\n]+)/i);
    const mobileMatch = body.match(/Phone:\s*([0-9+-\s]+)/i);
    const emailMatch = body.match(/User Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const listingMatch = body.match(/Property Detail:\s*([^\r\n]+)/i);

    if (nameMatch) data.name = nameMatch[1].trim();
    if (mobileMatch) data.mobile = mobileMatch[1].replace(/[^0-9]/g, '').slice(-10);
    if (emailMatch) data.email = emailMatch[1].trim();
    if (listingMatch) data.listingDetails = listingMatch[1].trim();

    return data;
};

/**
 * SquareYards Parser
 */
const parseSquareYards = (body, data) => {
    const nameMatch = body.match(/Name:\s*([^\r\n]+)/i);
    const mobileMatch = body.match(/Phone:\s*([0-9+-\s]+)/i) || body.match(/Mobile:\s*([0-9+-\s]+)/i);
    const emailMatch = body.match(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const projectMatch = body.match(/Project:\s*([^\r\n]+)/i);

    if (nameMatch) data.name = nameMatch[1].trim();
    if (mobileMatch) data.mobile = mobileMatch[1].replace(/[^0-9]/g, '').slice(-10);
    if (emailMatch) data.email = emailMatch[1].trim();
    if (projectMatch) data.listingDetails = projectMatch[1].trim();

    return data;
};

/**
 * CommonFloor Parser
 */
const parseCommonFloor = (body, data) => {
    const nameMatch = body.match(/Customer Name:\s*([^\r\n]+)/i);
    const mobileMatch = body.match(/Mobile:\s*([0-9+-\s]+)/i);
    const emailMatch = body.match(/Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    const listingMatch = body.match(/Enquired For:\s*([^\r\n]+)/i);

    if (nameMatch) data.name = nameMatch[1].trim();
    if (mobileMatch) data.mobile = mobileMatch[1].replace(/[^0-9]/g, '').slice(-10);
    if (emailMatch) data.email = emailMatch[1].trim();
    if (listingMatch) data.listingDetails = listingMatch[1].trim();

    return data;
};

/**
 * Generic Parser (Looks for standard phone/email patterns)
 */
const parseGeneric = (body, data) => {
    const mobileMatch = body.match(/([6-9]\d{9})/); // Simple Indian 10-digit mobile
    const emailMatch = body.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    
    // Attempt name detection by looking for "Name: XY" or just prominent capitalized words
    const nameMatch = body.match(/Name:\s*([^\r\n]+)/i);

    if (nameMatch) data.name = nameMatch[1].trim();
    if (mobileMatch) data.mobile = mobileMatch[1];
    if (emailMatch) data.email = emailMatch[1];

    return data;
};

export default { parsePortalEmail };
