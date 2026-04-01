import { FormLabel, FormSelect, ActivityCard, SectionTitle } from '../ActivityCommon';

const EmailActivitySection = ({ formData, handleChange, errors, activityMasterFields }) => {
    const isCompleted = formData.status === 'Completed';
    const emailAct = activityMasterFields?.activities?.find(a => a.name === 'Email');
    const purpose = emailAct?.purposes?.find(p => p.name === formData.purpose);

    return (
        <ActivityCard background="#fff7ed" borderColor="#fed7aa">
            <SectionTitle icon="fas fa-envelope" color="#c2410c">Email Details</SectionTitle>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <FormLabel>Email Purpose</FormLabel>
                    <FormSelect name="purpose" value={formData.purpose} onChange={handleChange}>
                        <option value="">Select Purpose</option>
                        {(emailAct?.purposes || []).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </FormSelect>
                </div>
                {isCompleted && (
                    <div style={{ flex: 1 }}>
                        <FormLabel required>Direction</FormLabel>
                        <FormSelect name="direction" value={formData.direction} onChange={handleChange}>
                            <option value="Outgoing">Outgoing</option>
                            <option value="Incoming">Incoming</option>
                        </FormSelect>
                    </div>
                )}
            </div>

            {isCompleted && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <FormLabel required>Mail Status</FormLabel>
                            <FormSelect name="mailStatus" value={formData.mailStatus} onChange={handleChange} hasError={errors.mailStatus}>
                                <option value="">Select Status</option>
                                {['Sent', 'Delivered', 'Read', 'Replied', 'Bounced', 'Undelivered'].map(s => <option key={s} value={s}>{s}</option>)}
                            </FormSelect>
                        </div>
                        <div style={{ flex: 1 }}>
                            <FormLabel required>Result</FormLabel>
                            <FormSelect name="completionResult" value={formData.completionResult} onChange={handleChange} hasError={errors.completionResult}>
                                <option value="">Select Result</option>
                                {(purpose?.outcomes || []).map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                            </FormSelect>
                        </div>
                    </div>
                </div>
            )}
        </ActivityCard>
    );
};

export default EmailActivitySection;
