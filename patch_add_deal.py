import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddDealModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

# 1. Add import SendMessageModal
if "SendMessageModal" not in content:
    content = content.replace(
        "import toast from 'react-hot-toast';",
        "import toast from 'react-hot-toast';\nimport SendMessageModal from './SendMessageModal';"
    )

# 2. Add State for SendMessageModal
state_block = """
    // AI Lead Matching State
    const [isMessageOpen, setIsMessageOpen] = useState(false);
    const [messageRecipients, setMessageRecipients] = useState([]);
    const [messageInitialChannel, setMessageInitialChannel] = useState('SMS');
    const [createdDealContext, setCreatedDealContext] = useState(null);

    const [isSaving, setIsSaving] = useState(false);"""

if "const [isMessageOpen, setIsMessageOpen]" not in content:
    content = content.replace("const [isSaving, setIsSaving] = useState(false);", state_block)


# 3. Add handleSave logic
# Find the exact lines in handleSave where it closes the modal.
search_str = """            onSave && onSave(savedData);
            onClose();"""

replace_str = """            // 🎯 TRIGGER AI LEAD MATCHING & OUTREACH
            const activeChannels = Object.keys(formData.sendMatchedDeal || {}).filter(k => formData.sendMatchedDeal[k]);
            if (!deal && activeChannels.length > 0 && savedData._id) {
                const loadToast = toast.loading(`Matching Deal with Leads for ${activeChannels.length} channel(s)...`);
                try {
                    const matchRes = await api.get('leads/match', { params: { dealId: savedData._id } });
                    if (matchRes.data?.success && matchRes.data?.data?.length > 0) {
                        let matches = matchRes.data.data;
                        
                        // Select primary channel
                        let primaryChannel = 'SMS';
                        if (formData.sendMatchedDeal.whatsapp) primaryChannel = 'WHATSAPP';
                        else if (formData.sendMatchedDeal.email) primaryChannel = 'EMAIL';
                        else if (formData.sendMatchedDeal.rcs) primaryChannel = 'RCS';

                        toast.success(`Found ${matches.length} matching leads! Opening Outreach Console...`, { id: loadToast });
                        
                        // Open SendMessageModal with matches
                        setMessageRecipients(matches.map(m => ({
                            id: m._id,
                            name: m.firstName + (m.lastName ? ' ' + m.lastName : ''),
                            phone: m.mobile || m.phone,
                            email: m.email
                        })));
                        setMessageInitialChannel(primaryChannel);
                        setCreatedDealContext(savedData);
                        setIsMessageOpen(true);
                        
                        onSave && onSave(savedData);
                        // Do not close AddDealModal immediately so the message modal remains visible above it
                        // (Alternatively, we can close AddDealModal, but since state is inside AddDealModal, it must stay open)
                        return; // Exit early to prevent onClose from firing
                    } else {
                        toast.error(`No matching leads found for this deal.`, { id: loadToast });
                    }
                } catch (e) {
                    console.error("Match & Dispatch error", e);
                    toast.error('Dispatch encountered an issue.', { id: loadToast });
                }
            }

            onSave && onSave(savedData);
            onClose();"""

content = content.replace(search_str, replace_str)


# 4. Add the <SendMessageModal> component before the final closing tag of AddDealModal
modal_component = """
            {isMessageOpen && (
                <SendMessageModal
                    isOpen={isMessageOpen}
                    onClose={() => {
                        setIsMessageOpen(false);
                        onClose(); // Close the deal modal now that message modal is done
                    }}
                    onSend={() => {
                        setIsMessageOpen(false);
                        onClose();
                    }}
                    initialRecipients={messageRecipients}
                    initialChannel={messageInitialChannel}
                    initialProperty={createdDealContext}
                />
            )}
        </div>
    );
};

export default AddDealModal;"""

content = content.replace("        </div>\n    );\n};\n\nexport default AddDealModal;", modal_component)

with open(file_path, "w") as f:
    f.write(content)

print("Patching complete.")
