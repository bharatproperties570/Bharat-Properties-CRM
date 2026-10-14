import React from 'react';

/**
 * Unicode Stylized Font Generators
 * Note: These generate valid Unicode characters (Mathematical Alphanumeric Symbols)
 * which display stylized in WhatsApp.
 */
function convertChar(str, upperStart, lowerStart, digitStart) {
    if (!str || typeof str !== 'string') return '';
    return str.split('').map(char => {
        const code = char.charCodeAt(0);
        if (upperStart && code >= 65 && code <= 90) { // A-Z
            return String.fromCodePoint(upperStart + (code - 65));
        }
        if (lowerStart && code >= 97 && code <= 122) { // a-z
            return String.fromCodePoint(lowerStart + (code - 97));
        }
        if (digitStart && code >= 48 && code <= 57) { // 0-9
            return String.fromCodePoint(digitStart + (code - 48));
        }
        return char;
    }).join('');
}

export const UNICODE_FONTS = [
    {
        id: 'boldSans',
        label: 'Bold Sans',
        badge: '𝗕𝗼𝗹𝗱',
        preview: '𝗕𝗵𝗮𝗿𝗮𝘁 𝗣𝗿𝗼𝗽𝗲𝗿𝘁𝗶𝗲𝘀',
        convert: (str) => convertChar(str, 0x1D5D4, 0x1D5EE, 0x1D7EC)
    },
    {
        id: 'boldItalic',
        label: 'Bold Italic',
        badge: '𝘽𝙤𝙡𝙙',
        preview: '𝘽𝙝𝙖𝙧𝙖𝙩 𝙋𝙧𝙤𝙥𝙚𝙧𝙩𝙞𝙚𝙨',
        convert: (str) => convertChar(str, 0x1D63C, 0x1D656, 0x1D7EC)
    },
    {
        id: 'script',
        label: 'Script / Cursive',
        badge: '𝓑𝓱𝓪𝓻𝓪𝓽',
        preview: '𝓑𝓱𝓪𝓻𝓪𝓽 𝓟𝓻𝓸𝓹𝓮𝓻𝓽𝓲𝓮𝓼',
        convert: (str) => convertChar(str, 0x1D4D0, 0x1D4EA, null)
    },
    {
        id: 'fraktur',
        label: 'Gothic / Fraktur',
        badge: '𝔅𝔥𝔞𝔯𝔞𝔱',
        preview: '𝔅𝔥𝔞𝔯𝔞𝔱 𝔓𝔯𝔬𝔭𝔢𝔯𝔱𝔦𝔢𝔰',
        convert: (str) => convertChar(str, 0x1D504, 0x1D51E, null)
    },
    {
        id: 'doubleStruck',
        label: 'Double Struck (Blackboard)',
        badge: '𝔹𝕙𝕒𝕣𝕒𝕥',
        preview: '𝔹𝕙𝕒𝕣𝕒𝕥 ℙ𝕣𝕠𝕡𝕖𝕣𝕥𝕚𝕖𝕤',
        convert: (str) => convertChar(str, 0x1D538, 0x1D552, 0x1D7D8)
    },
    {
        id: 'monospace',
        label: 'Typewriter Monospace',
        badge: '𝙱𝚑𝚊𝚛𝚊𝚝',
        preview: '𝙱𝚑𝚊𝚛𝚊𝚝 𝙿𝚛𝚘𝚙𝚎𝚛𝚝𝚒𝚎𝚜',
        convert: (str) => convertChar(str, 0x1D670, 0x1D68A, 0x1D7F6)
    }
];

export const QUICK_EMOJIS = ['🏡', '🎯', '👉', '📍', '💰', '☎️', '⭐', '✨', '🔑', '📐', '🚗', '📅'];

export const EMOJI_CATEGORIES = [
    {
        id: 'realestate',
        name: 'Real Estate & Properties',
        icon: '🏡',
        emojis: [
            { char: '🏡', name: 'house with garden home property villa' },
            { char: '🏢', name: 'office building apartment flat tower' },
            { char: '🏬', name: 'department store commercial shop showroom' },
            { char: '🏗️', name: 'construction building development site' },
            { char: '🏠', name: 'house home residence kothi' },
            { char: '🏘️', name: 'houses society township residential colony' },
            { char: '🏰', name: 'castle luxury mansion villa bungalow' },
            { char: '🏨', name: 'hotel resort hospitality' },
            { char: '📐', name: 'triangular ruler area size square yard marla dimensions' },
            { char: '📏', name: 'straight ruler measurement road width feet meter' },
            { char: '🔑', name: 'key possession ready to move keys' },
            { char: '🗝️', name: 'old key lock possession safety' },
            { char: '🚪', name: 'door entry main gate facing' },
            { char: '🧱', name: 'bricks construction quality built-up' },
            { char: '🪟', name: 'window ventilation park view' },
            { char: '🛋️', name: 'couch furniture fully furnished interior' },
            { char: '🌳', name: 'tree park green facing natural garden' },
            { char: '⛲', name: 'fountain park amenity club house' },
            { char: '🛣️', name: 'highway main road wide road sector road' },
            { char: '🚗', name: 'car parking parking space garage' },
            { char: '🌇', name: 'sunset cityscape skyline view' },
            { char: '🌆', name: 'cityscape prime location center' },
            { char: '🏛️', name: 'classical building government institutional court' },
            { char: '🧭', name: 'compass direction vastu north east south west' }
        ]
    },
    {
        id: 'pointers',
        name: 'Pointers & Highlights',
        icon: '🎯',
        emojis: [
            { char: '🎯', name: 'bullseye target location deal highlight goal prime' },
            { char: '👉', name: 'pointing right feature check point hand' },
            { char: '📍', name: 'round pushpin location map landmark spot address' },
            { char: '📌', name: 'pushpin notice highlight note pin' },
            { char: '📢', name: 'loudspeaker announcement fresh deal alert broadcast' },
            { char: '🔔', name: 'bell notification urgent alert reminder' },
            { char: '🔥', name: 'fire hot deal trending urgent explosive' },
            { char: '⚡', name: 'lightning fast quick immediate express' },
            { char: '💎', name: 'gem stone prime luxury premium exclusive diamond' },
            { char: '👑', name: 'crown vip king premium number one best' },
            { char: '🏷️', name: 'label price discount offer tag deal' },
            { char: '🚀', name: 'rocket fast high return investment opportunity growth' },
            { char: '🌟', name: 'glowing star special highlight featured' },
            { char: '✨', name: 'sparkles brand new fresh deal luxury shine' },
            { char: '☀️', name: 'sun bright natural sunlight open ventilation sunny' },
            { char: '💠', name: 'diamond with dot feature bullet' },
            { char: '🔹', name: 'small blue diamond bullet point' },
            { char: '🔸', name: 'small orange diamond bullet point' },
            { char: '▫️', name: 'white small square bullet' },
            { char: '▪️', name: 'black small square bullet' }
        ]
    },
    {
        id: 'money',
        name: 'Pricing & Finance',
        icon: '💰',
        emojis: [
            { char: '💰', name: 'money bag asking price budget crore lakh cash payment' },
            { char: '💵', name: 'dollar banknote cash token downpayment currency' },
            { char: '💸', name: 'money with wings discount best deal cheap affordable' },
            { char: '💳', name: 'credit card payment installment registry online' },
            { char: '🪙', name: 'coin investment rental yield return profit' },
            { char: '🏷️', name: 'price tag negotiable rate best offer' },
            { char: '🛍️', name: 'shopping bags commercial retail footfall mall' },
            { char: '🛒', name: 'shopping cart market store daily needs' },
            { char: '📉', name: 'chart decreasing distressed sale low price below market' },
            { char: '📈', name: 'chart increasing appreciation capital growth return roi' },
            { char: '📊', name: 'bar chart market analysis comparative price trends' },
            { char: '🎁', name: 'wrapped gift festival discount free gift offer bonus' },
            { char: '🤝', name: 'handshake deal closed agreement negotiated buyer seller' },
            { char: '📜', name: 'scroll deed registry clear title legal documents intkaal' },
            { char: '🧾', name: 'receipt payment bill settlement advance' },
            { char: '🏦', name: 'bank loan approved loan eligible emi facility hdfc sbi' }
        ]
    },
    {
        id: 'contact',
        name: 'Contact & Communication',
        icon: '☎️',
        emojis: [
            { char: '☎️', name: 'telephone call contact phone enquiry helpline landline' },
            { char: '📞', name: 'telephone receiver call back direct contact agent' },
            { char: '📱', name: 'mobile phone whatsapp message mobile call smartphone' },
            { char: '✉️', name: 'envelope email letter brochure document mail' },
            { char: '📧', name: 'e-mail details pdf brochure online send' },
            { char: '💬', name: 'speech balloon chat enquiry talk reply' },
            { char: '💭', name: 'thought balloon requirement query need' },
            { char: '🌐', name: 'globe with meridians website portal online link visit' },
            { char: '🔗', name: 'link url view property web link click' },
            { char: '📮', name: 'postbox address office branch location' },
            { char: '👨‍💼', name: 'man office worker property agent consultant advisor executive' },
            { char: '👩‍💼', name: 'woman office worker property agent consultant manager' },
            { char: '🤝', name: 'handshake visit meet inspection consultation' }
        ]
    },
    {
        id: 'status',
        name: 'Badges, Time & Verification',
        icon: '⭐',
        emojis: [
            { char: '⭐', name: 'star rated verified five star top' },
            { char: '✔️', name: 'check mark verified inspected clear title ok' },
            { char: '✅', name: 'check box approved rera clear documents pass' },
            { char: '❌', name: 'cross mark sold out not available expired' },
            { char: '❗', name: 'exclamation mark important attention urgent note' },
            { char: '❓', name: 'question mark enquiry doubt details query' },
            { char: '💯', name: 'hundred points genuine 100% verified authentic honest' },
            { char: '⏳', name: 'hourglass not done limited time hurry offer ends closing' },
            { char: '⏰', name: 'alarm clock site visit booking time slot appointment' },
            { char: '📅', name: 'calendar date booking schedule registry date day' },
            { char: '🗓️', name: 'spiral calendar site visit appointment meeting' },
            { char: '🏆', name: 'trophy best property top seller prime award' },
            { char: '🥇', name: '1st place medal best rate guaranteed choice' },
            { char: '🛡️', name: 'shield safe secure investment litigation free legal' },
            { char: '🔒', name: 'locked confidential exclusive mandate privacy' }
        ]
    },
    {
        id: 'faces',
        name: 'Greetings & Gestures',
        icon: '😊',
        emojis: [
            { char: '😊', name: 'smiling face greeting warm welcome smile happy' },
            { char: '👋', name: 'waving hand hello namaste welcome hi' },
            { char: '👍', name: 'thumbs up great agree approved confirmed like' },
            { char: '🙏', name: 'folded hands namaste thank you welcome respectful pranam' },
            { char: '👏', name: 'clapping hands congratulations booked successful bravo' },
            { char: '❤️', name: 'red heart family dream home beloved favorite' },
            { char: '😎', name: 'smiling face with sunglasses confident smart investor cool' },
            { char: '🎉', name: 'party popper congratulations new home possession celebrate festive' },
            { char: '💡', name: 'light bulb idea advice investment tip advice' },
            { char: '💐', name: 'bouquet congratulations housewarming celebration' },
            { char: '🙌', name: 'raising hands celebration milestone success' }
        ]
    }
];

/**
 * Safely parses WhatsApp-style formatted text into React elements for chat preview:
 * - *bold* -> <strong>
 * - _italic_ -> <em>
 * - ~strikethrough~ -> <del>
 * - ```monospace``` -> <code>
 * - {{variable}} -> highlighted badge
 * - URLs -> clickable link
 * - Line breaks preserved
 */
export const renderWhatsAppFormattedText = (text, options = {}) => {
    if (!text || typeof text !== 'string') return text;

    // Tokenizer regex matching WhatsApp markdown, template variables, and URLs
    const tokenRegex = /(\{\{[a-zA-Z0-9_.]+\}\})|(```[\s\S]*?```)|(\*[^\s*](?:[^*]*[^\s*])?\*)|(_[^\s_](?:[^_]*[^\s_])?_)|(~[^\s~](?:[^~]*[^\s~])?~)|(https?:\/\/[^\s]+)/g;

    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
        const parts = [];
        let lastIndex = 0;
        let match;
        const regex = new RegExp(tokenRegex);

        while ((match = regex.exec(line)) !== null) {
            // Text before match
            if (match.index > lastIndex) {
                parts.push(line.substring(lastIndex, match.index));
            }

            const [fullMatch, variableMatch, monospaceMatch, boldMatch, italicMatch, strikeMatch, urlMatch] = match;

            if (variableMatch) {
                parts.push(
                    <span 
                        key={`${lineIdx}-${match.index}-var`} 
                        style={{
                            background: '#dbeafe',
                            color: '#1e40af',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            fontSize: '0.88em',
                            margin: '0 1px'
                        }}
                    >
                        {variableMatch}
                    </span>
                );
            } else if (monospaceMatch) {
                const codeContent = monospaceMatch.slice(3, -3);
                parts.push(
                    <code 
                        key={`${lineIdx}-${match.index}-mono`}
                        style={{
                            background: 'rgba(0, 0, 0, 0.08)',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                            fontSize: '0.88em'
                        }}
                    >
                        {codeContent}
                    </code>
                );
            } else if (boldMatch) {
                const boldContent = boldMatch.slice(1, -1);
                parts.push(
                    <strong key={`${lineIdx}-${match.index}-bold`} style={{ fontWeight: 800 }}>
                        {boldContent}
                    </strong>
                );
            } else if (italicMatch) {
                const italicContent = italicMatch.slice(1, -1);
                parts.push(
                    <em key={`${lineIdx}-${match.index}-italic`} style={{ fontStyle: 'italic' }}>
                        {italicContent}
                    </em>
                );
            } else if (strikeMatch) {
                const strikeContent = strikeMatch.slice(1, -1);
                parts.push(
                    <del key={`${lineIdx}-${match.index}-strike`} style={{ textDecoration: 'line-through', opacity: 0.8 }}>
                        {strikeContent}
                    </del>
                );
            } else if (urlMatch) {
                parts.push(
                    <a
                        key={`${lineIdx}-${match.index}-url`}
                        href={urlMatch}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#0284c7', textDecoration: 'underline', wordBreak: 'break-all' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {urlMatch}
                    </a>
                );
            }

            lastIndex = match.index + fullMatch.length;
        }

        // Remaining text in line
        if (lastIndex < line.length) {
            parts.push(line.substring(lastIndex));
        }

        return (
            <React.Fragment key={lineIdx}>
                {parts.length > 0 ? parts : null}
                {lineIdx < lines.length - 1 && '\n'}
            </React.Fragment>
        );
    });
};
