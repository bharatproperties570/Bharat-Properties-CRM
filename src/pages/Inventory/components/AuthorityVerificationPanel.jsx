import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { authorityAPI } from '../../../utils/api';
import { useUserContext } from '../../../context/UserContext';

const AUTHORITIES = [
    { code: 'HSVP', name: 'HSVP (Haryana Shehri Vikas Pradhikaran)', color: '#0284c7' },
    { code: 'GMADA', name: 'GMADA (Greater Mohali Area Development Authority)', color: '#16a34a' },
    { code: 'CHD', name: 'Chandigarh Estate Office', color: '#ea580c' }
];

export default function AuthorityVerificationPanel({ inventory, onRefresh }) {
    const { currentUser } = useUserContext();

    // Check approval permission
    const canApprove = useMemo(() => {
        if (!currentUser) return false;
        if (currentUser.isAdmin) return true;
        const roleRights = currentUser.role?.approvalRights || {};
        return Boolean(roleRights.approveAuthorityChanges);
    }, [currentUser]);

    // Active Authority Tab
    const [selectedAuthority, setSelectedAuthority] = useState('HSVP');

    // Link state
    const [linkData, setLinkData] = useState(() => ({
        propertyId: inventory?.unitNo || inventory?.unitNumber || '',
        sectorNumber: inventory?.sector || '',
        phaseCode: '',
        blockCode: '',
        fileNumber: '',
        urbanEstate: inventory?.city || inventory?.location || ''
    }));
    const [isSavingLink, setIsSavingLink] = useState(false);
    const [existingLink, setExistingLink] = useState(null);

    // Identify completeness check
    const isIdentityComplete = Boolean(
        linkData.propertyId &&
        linkData.sectorNumber &&
        (selectedAuthority !== 'HSVP' || linkData.urbanEstate)
    );

    // Verification Run state
    const [activeRun, setActiveRun] = useState(null);
    const [runItem, setRunItem] = useState(null);
    const [isRunningVerification, setIsRunningVerification] = useState(false);
    const [isApplying, setIsApplying] = useState(false);

    // Selected fields for approval
    const [selectedFields, setSelectedFields] = useState({});

    // History & snapshot view
    const [history, setHistory] = useState([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedSnapshot, setSelectedSnapshot] = useState(null);

    // Loading states
    const [isLoading, setIsLoading] = useState(true);

    // Fetch existing links and history for this inventory
    const loadData = useCallback(async () => {
        if (!inventory?._id) return;
        setIsLoading(true);
        try {
            // Load links
            const linkRes = await authorityAPI.getLinks(inventory._id);
            if (linkRes?.success && Array.isArray(linkRes.data)) {
                const found = linkRes.data.find(l => l.authorityCode === selectedAuthority);
                if (found) {
                    setExistingLink(found);
                    setLinkData({
                        propertyId: found.propertyId || '',
                        sectorNumber: found.sectorNumber || '',
                        phaseCode: found.phaseCode || '',
                        blockCode: found.blockCode || '',
                        fileNumber: found.fileNumber || '',
                        urbanEstate: found.urbanEstate || ''
                    });
                } else {
                    setExistingLink(null);
                    setLinkData({
                        propertyId: inventory.unitNo || inventory.unitNumber || '',
                        sectorNumber: inventory.sector || '',
                        phaseCode: '',
                        blockCode: '',
                        fileNumber: '',
                        urbanEstate: inventory?.city || inventory?.location || ''
                    });
                }
            }

            // Load verification history
            const histRes = await authorityAPI.getHistory(inventory._id);
            if (histRes?.success && Array.isArray(histRes.data)) {
                setHistory(histRes.data);
            }
        } catch (err) {
            console.error('[AuthorityVerificationPanel] Error loading data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [inventory?._id, inventory?.unitNo, inventory?.unitNumber, inventory?.sector, selectedAuthority]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handle Saving Identity Link
    const handleSaveLink = async (e) => {
        e.preventDefault();
        if (!inventory?._id) return;
        setIsSavingLink(true);
        try {
            const res = await authorityAPI.saveLink({
                inventoryId: inventory._id,
                authorityCode: selectedAuthority,
                ...linkData
            });
            if (res?.success) {
                toast.success(`Identity link saved for ${selectedAuthority}`);
                setExistingLink(res.data);
            } else {
                toast.error(res?.message || 'Failed to save identity link');
            }
        } catch (err) {
            console.error('Save link error:', err);
            toast.error(err.response?.data?.message || 'Failed to save identity link');
        } finally {
            setIsSavingLink(false);
        }
    };

    // Trigger Verification Run (Demonstration Fixture Mode)
    const handleRunVerification = async () => {
        if (!inventory?._id) return;
        setIsRunningVerification(true);
        try {
            // 1. Create run with isFixtureMode = true
            const createRes = await authorityAPI.createRun({
                authorityCode: selectedAuthority,
                runMode: 'SINGLE',
                inventoryIds: [inventory._id],
                isFixtureMode: true
            });

            if (!createRes?.success) {
                toast.error(createRes?.message || 'Failed to initialize verification run');
                setIsRunningVerification(false);
                return;
            }

            const runId = createRes.data._id;
            setActiveRun(createRes.data);

            // 2. Process run items
            const processRes = await authorityAPI.processRun(runId, {
                isFixtureMode: true,
                batchSize: 1
            });

            // 3. Fetch run details with populated items
            const detailRes = await authorityAPI.getRunById(runId);
            if (detailRes?.success && detailRes.data?.items?.length > 0) {
                const item = detailRes.data.items[0];
                setRunItem(item);

                // Auto-select all proposed changes by default
                if (Array.isArray(item.proposedChanges)) {
                    const initialSelect = {};
                    item.proposedChanges.forEach(pc => {
                        initialSelect[pc.field] = true;
                    });
                    setSelectedFields(initialSelect);
                }

                if (item.status === 'SUCCEEDED') {
                    toast.success('Demonstration verification completed successfully!');
                } else if (item.status === 'NO_MATCH') {
                    toast.error('No matching authority record found in demonstration fixtures.');
                } else {
                    toast.error(`Verification item status: ${item.status}`);
                }
            }

            // Reload history
            const histRes = await authorityAPI.getHistory(inventory._id);
            if (histRes?.success) setHistory(histRes.data);
            if (onRefresh) onRefresh();
        } catch (err) {
            console.error('Run verification error:', err);
            toast.error(err.response?.data?.message || 'Verification execution failed');
        } finally {
            setIsRunningVerification(false);
        }
    };

    // Toggle field checkbox
    const handleToggleField = (field) => {
        setSelectedFields(prev => ({
            ...prev,
            [field]: !prev[field]
        }));
    };

    // Select/Deselect All Fields
    const handleSelectAll = (select) => {
        if (!runItem?.proposedChanges) return;
        const updated = {};
        runItem.proposedChanges.forEach(pc => {
            updated[pc.field] = select;
        });
        setSelectedFields(updated);
    };

    // Submit Review (Approve / Reject)
    const handleSubmitReview = async (decision) => {
        if (!runItem?._id) return;
        try {
            const approvedList = Object.keys(selectedFields).filter(f => selectedFields[f]);
            const res = await authorityAPI.submitReview(runItem._id, {
                decision: decision === 'APPROVE' ? (approvedList.length === runItem.proposedChanges.length ? 'APPROVED' : 'PARTIAL') : 'REJECTED',
                approvedFields: approvedList,
                notes: `Reviewed via CRM Frontend by ${currentUser?.fullName || 'User'}`
            });

            if (res?.success) {
                setRunItem(res.data);
                toast.success(`Review submitted: ${res.data.reviewerDecision}`);
            }
        } catch (err) {
            console.error('Submit review error:', err);
            toast.error(err.response?.data?.message || 'Failed to submit review');
        }
    };

    // Apply Approved Changes to Inventory
    const handleApplyChanges = async () => {
        if (!runItem?._id) return;
        if (!canApprove) {
            toast.error('Permission denied: Requires "approveAuthorityChanges" approval right.');
            return;
        }

        const isSyntheticRecord = Boolean(
            runItem.isSynthetic ||
            runItem.provenance === 'SYNTHETIC_FIXTURE' ||
            activeRun?.isFixtureMode ||
            activeRun?.provenance === 'SYNTHETIC_FIXTURE'
        );

        if (isSyntheticRecord) {
            toast.error('Application blocked: Synthetic demonstration data is strictly prohibited from modifying CRM Inventory.');
            return;
        }

        setIsApplying(true);
        try {
            const res = await authorityAPI.applyApprovedChanges(runItem._id);
            if (res?.success) {
                toast.success('Approved authority data successfully applied to CRM Inventory!');
                setRunItem(prev => ({ ...prev, applied: true, appliedAt: new Date() }));
                if (onRefresh) onRefresh();
            } else {
                toast.error(res?.message || 'Failed to apply changes');
            }
        } catch (err) {
            console.error('Apply changes error:', err);
            toast.error(err.response?.data?.message || 'Application error: Check schema validity');
        } finally {
            setIsApplying(false);
        }
    };

    // Current verified facts on Inventory
    const verifiedFacts = inventory?.authorityVerification || {};

    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '20px',
            marginBottom: '16px'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'rgba(79, 70, 229, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4f46e5'
                    }}>
                        <i className="fas fa-landmark" style={{ fontSize: '0.9rem' }}></i>
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            Government Authority Verification
                        </h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            HSVP · GMADA · Chandigarh Estate Office
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {history.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowHistoryModal(true)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-main)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            <i className="fas fa-history" style={{ marginRight: '6px' }}></i>
                            History ({history.length})
                        </button>
                    )}
                </div>
            </div>

            {/* MANDATORY DEMONSTRATION BANNER */}
            <div style={{
                background: 'rgba(234, 88, 12, 0.08)',
                border: '1px solid rgba(234, 88, 12, 0.25)',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
            }}>
                <i className="fas fa-exclamation-triangle" style={{ color: '#ea580c', marginTop: '2px', fontSize: '0.85rem' }}></i>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                    <strong>DEMONSTRATION FIXTURE DATA:</strong> Live external portal fetching is currently disabled pending government API authorization (<code>authorizationStatus: NOT_OBTAINED</code>). Records and proposed differences shown below are simulated demonstration fixtures for pre-live operational verification.
                </div>
            </div>

            {/* Authority Selector Tabs */}
            <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-gray, rgba(0,0,0,0.02))', padding: '4px', borderRadius: '8px' }}>
                {AUTHORITIES.map(auth => {
                    const isSelected = selectedAuthority === auth.code;
                    return (
                        <button
                            key={auth.code}
                            type="button"
                            onClick={() => setSelectedAuthority(auth.code)}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: isSelected ? 'var(--bg-card, #fff)' : 'transparent',
                                color: isSelected ? auth.color : 'var(--text-muted)',
                                fontWeight: isSelected ? 800 : 600,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {auth.code}
                        </button>
                    );
                })}
            </div>

            {/* Verification Status Card */}
            <div style={{
                background: 'rgba(0,0,0,0.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px'
            }}>
                <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: verifiedFacts.lastVerifiedAt ? 'rgba(22, 163, 74, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                            color: verifiedFacts.lastVerifiedAt ? '#16a34a' : '#64748b'
                        }}>
                            {verifiedFacts.lastVerifiedAt ? 'VERIFIED' : 'UNVERIFIED'}
                        </span>
                    </div>
                </div>

                <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Link Eligibility</span>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '4px', color: 'var(--text-main)' }}>
                        {existingLink?.matchEligibility || 'NOT CONFIGURED'}
                    </div>
                </div>

                <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last Verified</span>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '4px', color: 'var(--text-main)' }}>
                        {verifiedFacts.lastVerifiedAt ? new Date(verifiedFacts.lastVerifiedAt).toLocaleDateString() : 'Never'}
                    </div>
                </div>

                <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Snapshot Hash</span>
                    <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={verifiedFacts.snapshotContentHash || 'None'}>
                        {verifiedFacts.snapshotContentHash ? verifiedFacts.snapshotContentHash.slice(0, 14) + '...' : 'None'}
                    </div>
                </div>
            </div>

            {/* Identity Link Configuration */}
            <form onSubmit={handleSaveLink} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    Identity Mapping ({selectedAuthority})
                </span>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Property/Plot ID</label>
                        <input
                            type="text"
                            value={linkData.propertyId}
                            onChange={e => setLinkData({ ...linkData, propertyId: e.target.value })}
                            placeholder="e.g. 101 or P-14"
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-main)',
                                fontSize: '0.75rem'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sector Number</label>
                        <input
                            type="text"
                            value={linkData.sectorNumber}
                            onChange={e => setLinkData({ ...linkData, sectorNumber: e.target.value })}
                            placeholder="e.g. 14"
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-main)',
                                fontSize: '0.75rem'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Phase / Urban Estate</label>
                        <input
                            type="text"
                            value={linkData.urbanEstate || linkData.phaseCode}
                            onChange={e => setLinkData({ ...linkData, urbanEstate: e.target.value, phaseCode: e.target.value })}
                            placeholder="e.g. PANCHKULA"
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-main)',
                                fontSize: '0.75rem'
                            }}
                        />
                    </div>
                </div>

                {!isIdentityComplete && (
                    <div style={{ fontSize: '0.7rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                        <i className="fas fa-exclamation-circle"></i> Incomplete identity mapping: Plot/Property ID and Sector are required for verification matching.
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                    <button
                        type="submit"
                        disabled={isSavingLink}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-main)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        {isSavingLink ? 'Saving...' : 'Save Identity Link'}
                    </button>

                    <button
                        type="button"
                        onClick={handleRunVerification}
                        disabled={isRunningVerification || !isIdentityComplete}
                        title={!isIdentityComplete ? 'Complete required identity fields first' : 'Verify Record (Demo)'}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            background: !isIdentityComplete ? '#94a3b8' : '#4f46e5',
                            color: '#fff',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: !isIdentityComplete ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <i className={`fas fa-${isRunningVerification ? 'spinner fa-spin' : 'play'}`}></i>
                        {isRunningVerification ? 'Verifying...' : 'Verify Record (Demo)'}
                    </button>
                </div>
            </form>

            {/* Proposed Changes & Field Comparison Table */}
            {runItem && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                Verification Comparison & Proposed Changes
                            </span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Match Confidence: <strong>{runItem.matchStatus}</strong> · Review Status: <strong>{runItem.reviewerDecision}</strong>
                            </div>
                        </div>

                        {runItem.proposedChanges?.length > 0 && runItem.reviewerDecision === 'PENDING' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    onClick={() => handleSelectAll(true)}
                                    style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                                >
                                    Select All
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSelectAll(false)}
                                    style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>

                    {runItem.proposedChanges?.length === 0 ? (
                        <div style={{ padding: '12px', background: 'rgba(0,0,0,0.02)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            No discrepancies found between CRM records and simulated authority facts.
                        </div>
                    ) : (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                        <th style={{ padding: '8px 10px', width: '30px' }}></th>
                                        <th style={{ padding: '8px 10px' }}>Field</th>
                                        <th style={{ padding: '8px 10px' }}>Current CRM Value</th>
                                        <th style={{ padding: '8px 10px' }}>Authority Value</th>
                                        <th style={{ padding: '8px 10px' }}>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {runItem.proposedChanges.map(pc => {
                                        const isChecked = Boolean(selectedFields[pc.field]);
                                        const cleanField = pc.field.replace('authorityVerification.', '');
                                        return (
                                            <tr key={pc.field} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => handleToggleField(pc.field)}
                                                        disabled={runItem.reviewerDecision !== 'PENDING'}
                                                    />
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 600 }}>{cleanField}</td>
                                                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>
                                                    {String(pc.currentValue ?? '—')}
                                                </td>
                                                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a' }}>
                                                    {String(pc.proposedValue ?? '—')}
                                                </td>
                                                <td style={{ padding: '8px 10px' }}>
                                                    <span style={{
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: 700,
                                                        background: pc.changeType === 'NEW' ? 'rgba(2, 132, 199, 0.1)' : 'rgba(234, 88, 12, 0.1)',
                                                        color: pc.changeType === 'NEW' ? '#0284c7' : '#ea580c'
                                                    }}>
                                                        {pc.changeType}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Review Workflow Action Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {runItem.reviewerDecision === 'PENDING' && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleSubmitReview('APPROVE')}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: '#16a34a',
                                            color: '#fff',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Approve Selected
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSubmitReview('REJECT')}
                                        style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: '1px solid #ef4444',
                                            background: 'transparent',
                                            color: '#ef4444',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Reject All
                                    </button>
                                </>
                            )}
                        </div>

                        <div>
                            {['APPROVED', 'PARTIAL'].includes(runItem.reviewerDecision) && !runItem.applied && (
                                (() => {
                                    const isSynthetic = Boolean(
                                        runItem.isSynthetic ||
                                        runItem.provenance === 'SYNTHETIC_FIXTURE' ||
                                        activeRun?.isFixtureMode ||
                                        activeRun?.provenance === 'SYNTHETIC_FIXTURE'
                                    );
                                    if (isSynthetic) {
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    disabled={true}
                                                    title="Synthetic demonstration data is prohibited from modifying CRM Inventory"
                                                    style={{
                                                        padding: '6px 14px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #cbd5e1',
                                                        background: '#f1f5f9',
                                                        color: '#64748b',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        cursor: 'not-allowed',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <i className="fas fa-lock"></i>
                                                    Apply Prohibited (Synthetic Demonstration Data)
                                                </button>
                                                <span style={{ fontSize: '0.7rem', color: '#b45309', fontWeight: 600 }}>
                                                    Live authorization required
                                                </span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <button
                                            type="button"
                                            onClick={handleApplyChanges}
                                            disabled={!canApprove || isApplying}
                                            title={!canApprove ? 'Requires approveAuthorityChanges permission' : 'Apply verified changes into CRM'}
                                            style={{
                                                padding: '6px 16px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: canApprove ? '#4f46e5' : '#94a3b8',
                                                color: '#fff',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                cursor: canApprove ? 'pointer' : 'not-allowed',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <i className="fas fa-check-double"></i>
                                            {isApplying ? 'Applying...' : 'Apply Approved Changes to CRM'}
                                        </button>
                                    );
                                })()
                            )}
                            {runItem.applied && (
                                <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <i className="fas fa-check-circle"></i> Changes Applied
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistoryModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    background: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'var(--bg-card, #fff)',
                        borderRadius: '16px',
                        width: '90%',
                        maxWidth: '650px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                Verification & Snapshot History
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowHistoryModal(false)}
                                style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {history.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                                    No historical snapshots found.
                                </div>
                            ) : (
                                history.map(snap => (
                                    <div key={snap._id} style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        padding: '12px 14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 800, fontSize: '0.8rem', color: '#4f46e5' }}>
                                                {snap.authorityCode} Snapshot
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {new Date(snap.observedAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                            SHA-256: {snap.contentHash || 'N/A'}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-main)', marginTop: '4px' }}>
                                            Quality: <strong>{snap.dataQualityStatus || 'COMPLETE'}</strong> · Sealed: <strong>{snap.isSealed ? 'Yes (Immutable)' : 'No'}</strong>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
