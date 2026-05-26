const fs = require('fs');
const file = 'src/components/AddOwnerModal.jsx';
let content = fs.readFileSync(file, 'utf8');

// Import companiesAPI
content = content.replace("import { contactsAPI } from '../utils/api';", "import { contactsAPI, companiesAPI } from '../utils/api';");

// Add searchType state
content = content.replace("const [searchTerm, setSearchTerm] = useState('');", "const [searchTerm, setSearchTerm] = useState('');\n    const [searchType, setSearchType] = useState('Contact'); // 'Contact' or 'Company'");

// Update fetchContacts
const oldSearch = `
    // Search Logic
    useEffect(() => {
        const fetchContacts = async () => {
            if (!searchTerm.trim()) {
                setFilteredContacts([]);
                return;
            }

            setIsSearching(true);
            try {
                const response = await contactsAPI.getAll({ search: searchTerm });
                if (response.success) {
                    setFilteredContacts(response.records || []);
                }
            } catch (err) {
                console.error("Error searching contacts:", err);
                toast.error("Failed to search contacts");
            } finally {
                setIsSearching(false);
            }
        };

        const timeoutId = setTimeout(fetchContacts, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm]);`;

const newSearch = `
    // Search Logic
    useEffect(() => {
        const fetchContacts = async () => {
            if (!searchTerm.trim()) {
                setFilteredContacts([]);
                return;
            }

            setIsSearching(true);
            try {
                const api = searchType === 'Company' ? companiesAPI : contactsAPI;
                const response = await api.getAll({ search: searchTerm });
                if (response.success) {
                    setFilteredContacts(response.records || response.data || []);
                }
            } catch (err) {
                console.error("Error searching:", err);
                toast.error("Failed to search");
            } finally {
                setIsSearching(false);
            }
        };

        const timeoutId = setTimeout(fetchContacts, 300);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, searchType]);`;

content = content.replace(oldSearch, newSearch);

// Update HandleLinkOwner
const oldHandleLink = `
        const newOwner = {
            name: selectedContact.name || \`\${selectedContact.firstName || ''} \${selectedContact.lastName || ''}\`.trim() || 'Unknown',
            mobile: selectedContact.phones?.[0]?.number || selectedContact.mobile || (selectedContact.contacts && selectedContact.contacts[0]?.number) || '',
            role: linkData.role,
            relationship: linkData.relationship,
            source: linkData.source,
            date: new Date().toISOString(),
            id: selectedContact._id || selectedContact.id || Date.now().toString()
        };`;

const newHandleLink = `
        const newOwner = {
            name: selectedContact.name || \`\${selectedContact.firstName || ''} \${selectedContact.lastName || ''}\`.trim() || 'Unknown',
            mobile: selectedContact.phones?.[0]?.number || selectedContact.contactPhones?.[0]?.number || selectedContact.mobile || (selectedContact.contacts && selectedContact.contacts[0]?.number) || '',
            role: linkData.role,
            relationship: linkData.relationship,
            source: linkData.source,
            date: new Date().toISOString(),
            id: selectedContact._id || selectedContact.id || Date.now().toString(),
            entityType: searchType
        };`;
        
content = content.replace(oldHandleLink, newHandleLink);

// Same for handleTransferOwnership
content = content.replace(
`        const newOwner = {
            name: selectedContact.name || \`\${selectedContact.firstName || ''} \${selectedContact.lastName || ''}\`.trim() || 'Unknown',
            mobile: selectedContact.phones?.[0]?.number || selectedContact.mobile || (selectedContact.contacts && selectedContact.contacts[0]?.number) || '',
            role: 'Property Owner',
            relationship: '',
            source: linkData.source || 'Ownership Transfer',
            date: new Date().toISOString(),
            id: selectedContact._id || selectedContact.id || Date.now().toString()
        };`,
`        const newOwner = {
            name: selectedContact.name || \`\${selectedContact.firstName || ''} \${selectedContact.lastName || ''}\`.trim() || 'Unknown',
            mobile: selectedContact.phones?.[0]?.number || selectedContact.contactPhones?.[0]?.number || selectedContact.mobile || (selectedContact.contacts && selectedContact.contacts[0]?.number) || '',
            role: 'Property Owner',
            relationship: '',
            source: linkData.source || 'Ownership Transfer',
            date: new Date().toISOString(),
            id: selectedContact._id || selectedContact.id || Date.now().toString(),
            entityType: searchType
        };`
);


// Update UI for Role Select (force associate if Company)
const oldSelectBody = `
                                    <select
                                        style={customSelectStyle}
                                        value={linkData.role}
                                        onChange={(e) => setLinkData({ ...linkData, role: e.target.value })}
                                    >
                                        <option value="Property Owner">Property Owner</option>
                                        <option value="Associate">Associate</option>
                                    </select>`;

const newSelectBody = `
                                    <select
                                        style={{...customSelectStyle, backgroundColor: searchType === 'Company' ? '#f8fafc' : '#fff', cursor: searchType === 'Company' ? 'not-allowed' : 'auto'}}
                                        value={searchType === 'Company' ? 'Associate' : linkData.role}
                                        onChange={(e) => setLinkData({ ...linkData, role: e.target.value })}
                                        disabled={searchType === 'Company'}
                                    >
                                        <option value="Property Owner" disabled={searchType === 'Company'}>Property Owner</option>
                                        <option value="Associate">Associate</option>
                                    </select>`;

content = content.replace(oldSelectBody, newSelectBody);

// Update linkData role directly when selecting a company
const onSelectContactOld = `                                                    setSelectedContact(contact);
                                                    setSearchTerm('');
                                                    setFilteredContacts([]);`;
                                                    
const onSelectContactNew = `                                                    setSelectedContact(contact);
                                                    if (searchType === 'Company') { setLinkData(prev => ({...prev, role: 'Associate'})); }
                                                    setSearchTerm('');
                                                    setFilteredContacts([]);`;
content = content.replace(onSelectContactOld, onSelectContactNew);

// UI for toggling search type
const oldSearchInput = `
                                <label style={labelStyle}>Search Contact</label>
                                <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px' }}>
                                    <i className="fas fa-search" style={{ color: '#94a3b8' }}></i>
                                    <input
                                        type="text"
                                        style={{ ...inputStyle, border: 'none', background: 'transparent' }}
                                        placeholder="Search by name or mobile..."`;

const newSearchInput = `
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <label style={{...labelStyle, marginBottom: 0}}>Search Entity</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                            <input type="radio" checked={searchType === 'Contact'} onChange={() => {setSearchType('Contact'); setSearchTerm(''); setFilteredContacts([]);}} /> Person
                                        </label>
                                        <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                            <input type="radio" checked={searchType === 'Company'} onChange={() => {setSearchType('Company'); setSearchTerm(''); setFilteredContacts([]);}} /> Company
                                        </label>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0 12px' }}>
                                    <i className="fas fa-search" style={{ color: '#94a3b8' }}></i>
                                    <input
                                        type="text"
                                        style={{ ...inputStyle, border: 'none', background: 'transparent' }}
                                        placeholder={searchType === 'Company' ? "Search company name..." : "Search by name or mobile..."}`;

content = content.replace(oldSearchInput, newSearchInput);

const oldItemPhones = `contact.phones?.[0]?.number || contact.mobile || contact.contacts?.[0]?.number`;
const newItemPhones = `contact.phones?.[0]?.number || contact.contactPhones?.[0]?.number || contact.mobile || contact.contacts?.[0]?.number`;
content = content.replace(new RegExp(escapeRegExp(oldItemPhones), "g"), newItemPhones);

const oldSelectedPhones = `selectedContact.phones?.[0]?.number || selectedContact.mobile || selectedContact.contacts?.[0]?.number`;
const newSelectedPhones = `selectedContact.phones?.[0]?.number || selectedContact.contactPhones?.[0]?.number || selectedContact.mobile || selectedContact.contacts?.[0]?.number`;
content = content.replace(new RegExp(escapeRegExp(oldSelectedPhones), "g"), newSelectedPhones);

fs.writeFileSync(file, content);

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}
