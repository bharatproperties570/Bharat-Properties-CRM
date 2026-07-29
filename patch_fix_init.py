import re

file_path = "/Users/bharatproperties/.gemini/antigravity/scratch/bharat-properties-crm/src/components/AddDealModal.jsx"

with open(file_path, "r") as f:
    content = f.read()

live_match_block = """    // Live Match Preview State
    const [liveMatchCount, setLiveMatchCount] = useState(null);
    const [isLiveMatching, setIsLiveMatching] = useState(false);
    const [liveMatchedLeads, setLiveMatchedLeads] = useState([]);

    useEffect(() => {
        const fetchMatches = async () => {
            if (!formData.projectName && !formData.price && !formData.location) {
                setLiveMatchCount(null);
                setLiveMatchedLeads([]);
                return;
            }
            setIsLiveMatching(true);
            try {
                // We use POST to send the draft deal data
                const matchRes = await api.post('leads/match', { deal: formData });
                if (matchRes.data?.success) {
                    setLiveMatchCount(matchRes.data.count || 0);
                    setLiveMatchedLeads(matchRes.data.matchingLeads || []);
                } else {
                    setLiveMatchCount(0);
                    setLiveMatchedLeads([]);
                }
            } catch(e) {
                setLiveMatchCount(0);
                setLiveMatchedLeads([]);
            } finally {
                setIsLiveMatching(false);
            }
        };
        const timer = setTimeout(fetchMatches, 800);
        return () => clearTimeout(timer);
    }, [formData.projectName, formData.price, formData.location, formData.category, formData.subCategory, formData.propertyType, formData.size]);"""


# Remove it from wherever it is currently
content = content.replace(live_match_block + "\n", "")
content = content.replace(live_match_block, "")

# Insert it right after the formData definition
target = """        description: '',
        date: new Date().toISOString().split('T')[0]
    });"""

replacement = target + "\n\n" + live_match_block

content = content.replace(target, replacement)


with open(file_path, "w") as f:
    f.write(content)

print("Moved live match block successfully.")
