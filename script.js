document.addEventListener('DOMContentLoaded', () => {
    const listContent = document.getElementById('listContent');
    const actionBar = document.getElementById('actionBar');
    const selectCount = document.getElementById('selectCount');

    const contacts = [
        {
            name: 'Mr. Naveen Kumar',
            mobile: '9468081966',
            email: 'naveen.k@gmail.com',
            address: 'Sector 17, Chandigarh',
            professional: 'Project Manager',
            tags: 'High Priority',
            source: 'Walk-In',
            lastComm: 'Called today at 10 AM',
            actionable: 'Follow up',
            ownership: 'Suraj (Sales)',
            addOnDate: '11/01/2026',
            addOnTime: '5:04:00 PM',
            group: 'January 2026',
            icon: 'fa-user'
        },
        {
            name: 'Mr. Pawan Kumar',
            mobile: '9466937965',
            email: 'pawankumar@outlook.com',
            address: 'Panchkula, Haryana',
            professional: 'Corporate Lawyer',
            tags: '-',
            source: 'Whatsapp',
            lastComm: 'Message sent yesterday',
            actionable: 'Send Brochure',
            ownership: 'Suraj (Sales)',
            addOnDate: '11/01/2026',
            addOnTime: '3:59:32 PM',
            group: 'January 2026',
            icon: 'fa-user'
        },
        {
            name: 'Mr. Deepak Bhardwaj',
            mobile: '9467238581',
            email: 'deepaknrww@gmail.com',
            address: 'Narwana Jind, Haryana',
            professional: 'Software Engineer',
            tags: 'Interested',
            source: 'Facebook',
            lastComm: 'Meeting scheduled',
            actionable: 'Internal Discussion',
            ownership: 'Suraj (Sales)',
            addOnDate: '11/01/2026',
            addOnTime: '3:40:44 PM',
            group: 'January 2026',
            icon: 'fa-user'
        },
        {
            name: 'Mr. Raghbir Maan',
            mobile: '8901550334',
            email: 'raghbir.maan@yahoo.com',
            address: '36 Urban Estate Kurukshetra',
            professional: 'Business Owner',
            tags: 'VIP',
            source: 'Walkin',
            lastComm: 'No communication yet',
            actionable: '-',
            ownership: 'Suraj (Sales)',
            addOnDate: '06/01/2026',
            addOnTime: '6:26:29 PM',
            group: 'January 2026',
            icon: 'fa-user'
        },
        {
            name: 'Mrs. Manpreet Kaur',
            mobile: '7009550400',
            email: 'manpreetsaini75.mk@gmail.com',
            address: 'Zirakpur 140306',
            professional: 'Marketing Head',
            tags: 'Warm Lead',
            source: '99 Acre',
            lastComm: 'Voice call 2 days ago',
            actionable: '-',
            ownership: 'Suraj Keshwar (Sales)',
            addOnDate: '06/01/2026',
            addOnTime: '12:04:09 PM',
            group: 'January 2026',
            icon: 'fa-user'
        }
    ];

    function renderList() {
        const groups = {};
        contacts.forEach(c => {
            if (!groups[c.group]) groups[c.group] = [];
            groups[c.group].push(c);
        });

        let html = '';
        for (const groupName in groups) {
            html += `<div class="list-group">
                <div class="group-header">${groupName}</div>
                ${groups[groupName].map((item, idx) => {
                const initials = getInitials(item.name);
                const avatarColorClass = `avatar-${(idx % 5) + 1}`;
                return `
                    <div class="list-item">
                        <input type="checkbox" class="item-check">
                        <div class="col-personal">
                            <div class="contact-main">
                                <div class="avatar-circle ${avatarColorClass}">${initials}</div>
                                <div class="contact-details">
                                    <div class="item-name">${item.name}</div>
                                    <div class="item-sub-group">
                                        <span class="item-sub"><i class="fas fa-phone-alt"></i> ${item.mobile}</span>
                                        ${item.email ? `<span class="item-sub"><i class="fas fa-envelope"></i> ${item.email.split('@')[0]}...</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-address">
                            <div class="location-group">
                                <i class="fas fa-map-marker-alt location-icon"></i>
                                <div class="item-sub">${item.address || 'Not specified'}</div>
                            </div>
                        </div>
                        <div class="col-professional">
                            <div class="prof-group">
                                <div><span class="prof-badge">${item.professional}</span></div>
                                <div class="item-sub" style="font-size: 0.7rem; margin-top: 2px;">Verified Member</div>
                            </div>
                        </div>
                        <div class="col-tags item-sub">${item.tags}</div>
                        <div class="col-source"><span class="source-badge">${item.source}</span></div>
                        <div class="col-comm">
                            <div class="comm-group">
                                <i class="fas fa-history" style="font-size: 0.7rem; color: var(--text-muted)"></i>
                                <span class="item-sub">${item.lastComm}</span>
                            </div>
                        </div>
                        <div class="col-action item-sub">${item.actionable}</div>
                        <div class="col-ownership">
                            <div class="owner-group">
                                <div class="owner-avatar">${item.ownership.charAt(0)}</div>
                                <span class="item-sub">${item.ownership.split(' ')[0]}</span>
                            </div>
                        </div>
                        <div class="col-addon item-sub">
                            <div style="font-weight: 500">${item.addOnDate}</div>
                            <div style="font-size: 0.65rem; color: var(--text-muted)">${item.addOnTime}</div>
                        </div>
                    </div>
                `}).join('')}
            </div>`;
        }
        function getInitials(name) {
            return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        }

        listContent.innerHTML = html;

        const checks = document.querySelectorAll('.item-check');
        checks.forEach(check => {
            check.addEventListener('change', updateSelection);
        });
    }

    // --- Original UI Logic (Restored) ---
    const addBtn = document.getElementById('addBtn');
    const addDropdown = document.getElementById('addDropdown');

    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (addDropdown) addDropdown.classList.toggle('show');
            if (campaignDropdown) campaignDropdown.classList.remove('show');
        });
    }

    document.addEventListener('click', () => {
        if (addDropdown) addDropdown.classList.remove('show');
        if (campaignDropdown) campaignDropdown.classList.remove('show');
    });

    const masterCheck = document.getElementById('masterCheck');
    const masterCheckTop = document.getElementById('masterCheckTop');

    // Use already declared actionBar and selectCount from top of file

    [masterCheck, masterCheckTop].forEach(master => {
        if (!master) return;
        master.addEventListener('change', (e) => {
            const checks = document.querySelectorAll('.item-check');
            checks.forEach(check => {
                check.checked = e.target.checked;
            });
            updateSelection();
        });
    });

    function updateSelection() {
        const checks = document.querySelectorAll('.item-check');
        const checked = document.querySelectorAll('.item-check:checked');
        const total = checks.length;

        if (checked.length > 0) {
            actionBar.classList.add('show');
            selectCount.innerText = `${checked.length} / ${total}`;
            const allChecked = (checked.length === total);
            const isIndeterminate = (checked.length > 0 && checked.length < total);

            [masterCheck, masterCheckTop].forEach(m => {
                if (!m) return;
                m.checked = allChecked;
                m.indeterminate = isIndeterminate;
            });
        } else {
            actionBar.classList.remove('show');
            [masterCheck, masterCheckTop].forEach(m => {
                if (!m) return;
                m.checked = false;
                m.indeterminate = false;
            });
        }
    }

    // --- Navigation & View Switching ---
    const navContacts = document.getElementById('navContacts');
    const navMarketing = document.getElementById('navMarketing');
    const contactsView = document.getElementById('contactsView');
    const marketingView = document.getElementById('marketingView');
    const wizardView = document.getElementById('wizardView');
    const sidebarIcons = document.querySelectorAll('.sidebar-icon');

    function switchView(viewId) {
        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');

        sidebarIcons.forEach(icon => icon.classList.remove('active'));
        if (viewId === 'contactsView') navContacts.classList.add('active');
        if (viewId === 'marketingView') navMarketing.classList.add('active');
    }

    navContacts.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('contactsView');
    });

    navMarketing.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('marketingView');
        renderCampaigns();
    });

    // --- Marketing Dashboard Logic ---
    const campaignTabs = document.querySelectorAll('.tab-btn');
    let currentMarketingTab = 'online';

    campaignTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            campaignTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentMarketingTab = tab.dataset.tab;
            renderCampaigns();
        });
    });

    const mockCampaigns = {
        online: [
            { id: 1, name: 'Google Ads Q1', source: 'Google', campaigns: 'G-772', leads: 432, date: '10/01/2026' },
            { id: 2, name: 'Facebook Brand', source: 'FB', campaigns: 'FB-992', leads: 215, date: '08/01/2026' },
            { id: 3, name: 'Instagram Influencer', source: 'IG', campaigns: 'IG-112', leads: 156, date: '05/01/2026' },
            { id: 4, name: 'Retargeting Campaign', source: 'Google', campaigns: 'G-882', leads: 326, date: '02/01/2026' }
        ],
        offline: [
            { id: 1, name: 'BillBoard Sec 14', desc: 'Main Road Billboard', contact: '8882229990', event: 'Physical', status: 'Active', cost: '₹50,000', delivered: '12/01/2026', created: '01/01/2026' },
            { id: 2, name: 'SMS Blast - Jan', desc: 'January Property Update', contact: 'SMS-Bulk', event: 'SMS', status: 'Sent', cost: '₹5,000', delivered: '10/01/2026', created: '05/01/2026' },
            { id: 3, name: 'Call Center Outbound', desc: 'Calling old leads', contact: 'Call-Team', event: 'Call', status: 'In-Progress', cost: '₹15,000', delivered: '-', created: '08/01/2026' }
        ],
        organic: [
            { id: 1, name: 'Weekly Newsletter', source: 'Email', date: '12/01/2026' },
            { id: 2, name: 'YouTube Walkthrough', source: 'YT', date: '10/01/2026' },
            { id: 3, name: 'Blog: Top Properties', source: 'Website', date: '05/01/2026' }
        ]
    };

    function renderCampaigns() {
        const container = document.getElementById('campaignTableContainer');
        const filtered = mockCampaigns[currentMarketingTab] || [];

        let headerHtml = '';
        let bodyHtml = '';

        if (currentMarketingTab === 'online') {
            headerHtml = `
                <tr>
                    <th>#</th>
                    <th>NAME</th>
                    <th>SOURCE</th>
                    <th>CAMPAIGNS</th>
                    <th>LEADS</th>
                    <th>GENERATED DATE</th>
                    <th>ACTION</th>
                </tr>`;
            bodyHtml = filtered.map(c => `
                <tr>
                    <td>${c.id}</td>
                    <td><strong>${c.name}</strong></td>
                    <td><span class="source-badge ${getSourceBadgeClass(c.source)}">${c.source}</span></td>
                    <td style="color:var(--primary-color); font-weight: 600;">${c.campaigns}</td>
                    <td style="font-weight: 700; color: #388E3C;">${c.leads}</td>
                    <td>${c.date}</td>
                    <td>${renderActionMenu()}</td>
                </tr>`).join('');
        } else if (currentMarketingTab === 'offline') {
            headerHtml = `
                <tr>
                    <th>#</th>
                    <th>NAME & DESCRIPTION</th>
                    <th>CONTACT</th>
                    <th>EVENT TYPE</th>
                    <th>STATUS</th>
                    <th>COST</th>
                    <th>DELIVERED DATE</th>
                    <th>CREATED DATE</th>
                    <th>ACTION</th>
                </tr>`;
            bodyHtml = filtered.map(c => `
                <tr>
                    <td>${c.id}</td>
                    <td>
                        <div style="font-weight:700; color: var(--text-main);">${c.name}</div>
                        <div style="font-size:0.7rem; color:var(--text-muted)">${c.desc}</div>
                    </td>
                    <td>${c.contact}</td>
                    <td><span class="source-badge ${getSourceBadgeClass(c.event)}">${c.event}</span></td>
                    <td><strong>${c.status}</strong></td>
                    <td style="font-weight: 600;">${c.cost}</td>
                    <td>${c.delivered}</td>
                    <td>${c.created}</td>
                    <td>${renderActionMenu()}</td>
                </tr>`).join('');
        } else {
            headerHtml = `
                <tr>
                    <th>#</th>
                    <th>CAMPAIGN NAME</th>
                    <th>SOURCE</th>
                    <th>CREATED DATE</th>
                    <th>ACTION</th>
                </tr>`;
            bodyHtml = filtered.map(c => `
                <tr>
                    <td>${c.id}</td>
                    <td><strong>${c.name}</strong></td>
                    <td><span class="source-badge ${getSourceBadgeClass(c.source)}">${c.source}</span></td>
                    <td>${c.date}</td>
                    <td>${renderActionMenu()}</td>
                </tr>`).join('');
        }

        container.innerHTML = `
            <table class="campaign-table">
                <thead>${headerHtml}</thead>
                <tbody>
                    ${filtered.length > 0 ? bodyHtml : '<tr><td colspan="10" style="text-align:center; padding: 2rem;">No campaigns found.</td></tr>'}
                </tbody>
            </table>
        `;

        // Update Footer
        const footer = document.getElementById('marketingFooter');
        if (currentMarketingTab === 'online') {
            footer.innerHTML = `
                <div class="summary-label">Summary</div>
                <div class="summary-stats">Campaigns <span class="stat-val">${filtered.length}</span></div>
                <div class="summary-stats">Leads <span class="stat-val">${filtered.reduce((acc, c) => acc + (c.leads || 0), 0)}</span></div>
            `;
        } else {
            footer.innerHTML = `
                <div class="summary-label">Summary</div>
                <div class="summary-stats">List <span class="stat-val">${filtered.length}</span></div>
                <div class="summary-stats">Contact <span class="stat-val">1199</span></div>
                <div class="summary-stats">Other <span class="stat-val">899</span></div>
            `;
        }

        // Action Menu Toggles
        document.querySelectorAll('.row-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = btn.nextElementSibling;
                document.querySelectorAll('.row-action-menu').forEach(m => {
                    if (m !== menu) m.classList.remove('show');
                });
                menu.classList.toggle('show');
            });
        });
    }

    function getSourceBadgeClass(source) {
        if (!source) return 'source-default';
        const s = source.toLowerCase();
        if (s.includes('google')) return 'source-google';
        if (s.includes('fb') || s.includes('facebook')) return 'source-fb';
        if (s.includes('ig') || s.includes('instagram')) return 'source-ig';
        if (s.includes('whatsapp')) return 'source-whatsapp';
        return 'source-default';
    }

    function renderActionMenu() {
        return `
            <div class="row-action-wrapper">
                <button class="row-action-btn"><i class="fas fa-ellipsis-v"></i></button>
                <div class="row-action-menu">
                    <a href="#"><i class="fas fa-edit"></i> Edit</a>
                    <a href="#"><i class="fas fa-eye"></i> View Leads</a>
                    <a href="#"><i class="fas fa-pause-circle"></i> Pause</a>
                    <a href="#" style="color:var(--danger-color)"><i class="fas fa-trash-alt"></i> Delete</a>
                </div>
            </div>
        `;
    }

    // --- Create Campaign Wizard Logic ---
    const createCampaignBtn = document.getElementById('createCampaignBtn');
    const campaignDropdown = document.getElementById('campaignDropdown');
    const wizardBack = document.getElementById('wizardBack');
    const prevStep = document.getElementById('prevStep');
    const nextStep = document.getElementById('nextStep');

    let currentStep = 1;
    let campaignType = 'sms';

    // Simplified Campaign Toggle
    if (createCampaignBtn) {
        createCampaignBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Campaign button clicked');
            if (campaignDropdown) campaignDropdown.classList.toggle('show');
            if (addDropdown) addDropdown.classList.remove('show');
        });
    }

    document.querySelectorAll('#campaignDropdown .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            campaignType = item.getAttribute('data-type');
            console.log('Campaign type selected:', campaignType);
            startWizard();
        });
    });

    function startWizard() {
        currentStep = 1;
        campaignDropdown.classList.remove('show');
        switchView('wizardView');
        updateWizardUI();

        // Setup Editors Visibility
        const editors = {
            sms: document.getElementById('smsEditor'),
            email: document.getElementById('emailEditor'),
            whatsapp: document.getElementById('whatsappEditor'),
            rcs: document.getElementById('rcsEditor')
        };
        const typeTitle = document.getElementById('campaignTypeTitle');
        const editorTitle = document.getElementById('editorTitle');

        // Hide all
        Object.values(editors).forEach(ed => ed && (ed.style.display = 'none'));

        // Show selected (fallback to SMS)
        const activeType = editors[campaignType] ? campaignType : 'sms';
        if (editors[activeType]) {
            editors[activeType].style.display = 'block';
            typeTitle.innerText = `${activeType.toUpperCase()} Activity`;
            editorTitle.innerText = `${activeType.toUpperCase()} Content`;
        }

        // Pre-fill defaults if needed
        if (campaignType === 'rcs') {
            document.getElementById('campaignCategory').value = 'OFFLINE CAMPAIGN';
        }

        updateSummarySidebar();
    }

    wizardBack.addEventListener('click', () => switchView('marketingView'));

    nextStep.addEventListener('click', () => {
        if (currentStep < 4) {
            currentStep++;
            updateWizardUI();
            // Scroll wizard content to top
            document.querySelector('.wizard-container').scrollTop = 0;
        } else {
            // Final Submit
            alert('Campaign Created Successfully!');
            switchView('marketingView');
            renderCampaigns();
        }
    });

    prevStep.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateWizardUI();
        }
    });

    function updateWizardUI() {
        // Steps
        document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
        document.getElementById(`step${currentStep}`).classList.add('active');

        // Stepper
        document.querySelectorAll('.wizard-stepper .step').forEach((s, idx) => {
            const stepNum = idx + 1;
            s.classList.remove('active', 'completed');
            if (stepNum === currentStep) s.classList.add('active');
            if (stepNum < currentStep) s.classList.add('completed');
        });

        // Progress
        const percent = (currentStep / 4) * 100;
        document.getElementById('progressPercent').innerText = `${percent}%`;
        document.getElementById('progressBar').style.width = `${percent}%`;

        // Buttons
        prevStep.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
        nextStep.innerText = currentStep === 4 ? 'Finish' : 'Next';

        updateSummarySidebar();
    }

    function updateSummarySidebar() {
        const name = document.getElementById('campaignName').value || 'Unnamed Campaign';
        const category = document.getElementById('campaignCategory').value;
        const sideContent = document.getElementById('sideContent');
        const sidebar = document.querySelector('.wizard-sidebar-preview');

        // Dynamic HTML for Sidebar
        let sidebarHTML = `
            <div class="summary-box" style="width: 100%; padding: 1rem; background: #f8fafc; border-radius: 12px; margin-bottom: 1.5rem;">
                <div class="s-label">Campaign Details</div>
                <div style="font-weight:700; color:#1a1f23; margin-bottom:4px;">${name}</div>
                <div style="font-size:0.75rem; color:#64748b;">${category} • ${campaignType.toUpperCase()}</div>
                <div style="font-size:0.75rem; color:#64748b; margin-top:4px;"><i class="fas fa-users"></i> Audience: <span id="sideSize">1,129 Contacts</span></div>
            </div>
            
            <div class="section-title">Preview</div>
        `;

        if (campaignType === 'email') {
            const subject = document.getElementById('emailSubject').value || '(No Subject)';
            const fromName = document.getElementById('emailFromName').value || 'Sender';

            sidebarHTML += `
                <div class="preview-computer-frame">
                    <div class="computer-header">
                        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                    </div>
                    <div style="padding: 12px; font-size: 0.75rem;">
                        <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 12px;">
                            <div style="color:#64748b; font-size:0.65rem;">From: <span style="color:#1e293b; font-weight:600;">${fromName}</span></div>
                            <div style="color:#1e293b; font-weight:700; margin-top:2px;">${subject}</div>
                        </div>
                        <div style="color:#64748b; line-height:1.5;">[Email Content Mockup]</div>
                    </div>
                </div>
            `;
        } else {
            // Phone Frame for SMS, WhatsApp, RCS
            sidebarHTML += `
                <div class="preview-device-frame">
                    <div class="device-screen">
                        <div class="device-header">
                            <div class="contact-info">
                                <div class="avatar" style="display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.7rem; font-weight:700; background:#388E3C;">BP</div>
                                <div style="font-size:0.75rem; font-weight:700;">${name.substring(0, 15)}...</div>
                            </div>
                        </div>
                        <div class="device-content" id="phoneContent">
                            <!-- Message bubble injected here -->
                        </div>
                    </div>
                </div>
            `;
        }

        sidebar.innerHTML = sidebarHTML;

        // Inject content into phoneContent if not Email
        if (campaignType !== 'email') {
            const phoneContent = document.getElementById('phoneContent');
            const bubble = document.createElement('div');
            bubble.className = 'live-message-bubble ' + campaignType;

            if (campaignType === 'sms') {
                let sms = document.getElementById('smsText').value || 'Hello! (Empty message)';
                if (document.getElementById('addOptOut').checked) sms += "\n\nSTOP to unsub";
                bubble.innerText = sms;
            } else if (campaignType === 'whatsapp') {
                const waText = document.getElementById('waText').value || 'WhatsApp: (Empty)';
                const media = document.getElementById('waMediaType').value;
                const btnLabel = document.getElementById('waBtnLabel').value;

                let html = '';
                if (media !== 'None') html += `<div style="background:#ddd; height:60px; border-radius:4px; margin-bottom:8px; display:flex; align-items:center; justify-content:center; font-size:0.6rem; color:#666;"><i class="fas fa-file"></i> ${media}</div>`;
                html += `<div>${waText}</div>`;
                if (btnLabel) html += `<div style="margin-top:10px; border-top:1px solid rgba(0,0,0,0.05); padding-top:8px; color:#00a5f4; text-align:center; font-weight:700; font-size:0.75rem;"><i class="fas fa-external-link-alt"></i> ${btnLabel}</div>`;
                bubble.innerHTML = html;
            } else if (campaignType === 'rcs') {
                const title = document.getElementById('rcsTitle').value || 'RCS Title';
                const desc = document.getElementById('rcsText').value || '(No Description)';
                const action = document.getElementById('rcsActionLabel').value;

                bubble.innerHTML = `
                    <div style="background:#f0f0f0; height:80px; display:flex; align-items:center; justify-content:center; color:#999;"><i class="fas fa-image"></i></div>
                    <div style="padding:10px;">
                        <div style="font-weight:800; font-size:0.8rem; margin-bottom:4px;">${title}</div>
                        <div style="font-size:0.7rem; color:#666;">${desc}</div>
                        ${action ? `<div style="margin-top:10px; padding:6px; background:#f0f7ff; color:#0056b3; border-radius:20px; text-align:center; font-size:0.7rem; font-weight:700;">${action}</div>` : ''}
                    </div>
                `;
            }
            phoneContent.appendChild(bubble);
        }
    }

    // Add real-time listeners for all wizard inputs
    const wizardInputs = [
        'campaignName', 'campaignCategory',
        'smsText', 'addOptOut',
        'emailSubject', 'emailFromName', 'emailPreheader',
        'waText', 'waBtnLabel', 'waMediaType',
        'rcsTitle', 'rcsText', 'rcsActionLabel'
    ];

    wizardInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateSummarySidebar);
            el.addEventListener('change', updateSummarySidebar);
        }
    });

    // Creative Tools Logic
    const mediaTypeSelect = document.getElementById('waMediaType');
    const mediaDropzone = document.getElementById('waMediaDropzone');

    if (mediaTypeSelect && mediaDropzone) {
        mediaTypeSelect.addEventListener('change', () => {
            const isNone = mediaTypeSelect.value === 'None';
            mediaDropzone.style.display = isNone ? 'none' : 'block';
        });
    }

    // Variable Pickers
    document.querySelectorAll('.btn-xs-outline').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent form jumping
            const textToInsert = btn.innerText.includes('Emoji') ? '😊' : ' {Name} ';
            const editorId = btn.closest('.form-group').querySelector('textarea').id;
            const textarea = document.getElementById(editorId);

            if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                textarea.value = text.substring(0, start) + textToInsert + text.substring(end);
                textarea.focus();
                textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
                updateSummarySidebar(); // Update preview immediately
            }
        });
    });

    // Mock Contacts for Wizard Step 2
    function renderWizardContacts() {
        const tbody = document.getElementById('wizardContactList');
        if (!tbody) return;
        tbody.innerHTML = contacts.map((c, idx) => {
            const initials = c.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
            const avatarColorClass = `avatar-${(idx % 5) + 1}`;
            return `
            <tr>
                <td><input type="checkbox" checked></td>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="avatar-circle ${avatarColorClass}" style="width:28px; height:28px; font-size:0.6rem;">${initials}</div>
                        <div>
                            <div style="font-weight:700; font-size: 0.8rem;">${c.name}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted)">${c.mobile}</div>
                        </div>
                    </div>
                </td>
                <td style="font-size: 0.8rem;">Suraj K.</td>
                <td style="font-size: 0.8rem;">-</td>
                <td style="font-size: 0.8rem;">The Address</td>
                <td><span class="source-badge" style="background:#E3F2FD; color:#1976D2; font-size:0.65rem;">Prospect</span></td>
                <td><span class="source-badge ${getSourceBadgeClass(c.source)}" style="font-size:0.65rem;">${c.source}</span></td>
            </tr>
        `}).join('');
    }

    renderWizardContacts();
    renderList();
});
