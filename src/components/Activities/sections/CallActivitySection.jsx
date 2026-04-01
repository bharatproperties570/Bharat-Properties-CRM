import { FormLabel, FormSelect, ActivityCard, SectionTitle } from '../ActivityCommon';

const CallActivitySection = ({ formData, handleChange, errors, activityMasterFields }) => {
    const isCompleted = formData.status === 'Completed';
    const callAct = activityMasterFields?.activities?.find(a => a.name === 'Call');
    const purpose = callAct?.purposes?.find(p => p.name === formData.purpose);

    return (
        <ActivityCard background="#f0f9ff" borderColor="#bae6fd">
            <SectionTitle icon="fas fa-phone-alt" color="#0369a1">Call Details</SectionTitle>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <FormLabel>Call Purpose</FormLabel>
                    <FormSelect
                        name="purpose"
                        value={formData.purpose}
                        onChange={handleChange}
                    >
                        <option value="">Select Purpose</option>
                        {(callAct?.purposes || []).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </FormSelect>
                </div>
                {isCompleted && (
                    <div style={{ flex: 1 }}>
                        <FormLabel required>Direction</FormLabel>
                        <FormSelect
                            name="direction"
                            value={formData.direction}
                            onChange={handleChange}
                        >
                            <option value="Incoming Call">Incoming</option>
                            <option value="Outgoing Call">Outgoing</option>
                        </FormSelect>
                    </div>
                )}
            </div>

            {isCompleted && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <FormLabel required>Call Status</FormLabel>
                            <FormSelect
                                name="callOutcome"
                                value={formData.callOutcome}
                                onChange={handleChange}
                                hasError={errors.callOutcome}
                            >
                                <option value="">Select Status</option>
                                <option value="Connected">Answered</option>
                                <option value="No Answer">No Answer</option>
                                <option value="Busy">Busy</option>
                                <option value="Wrong Number">Wrong Number</option>
                                <option value="Left Voicemail">Left Voicemail</option>
                            </FormSelect>
                        </div>
                        {formData.callOutcome === 'Connected' && (
                            <div style={{ flex: 1 }}>
                                <FormLabel required>Call Result</FormLabel>
                                <FormSelect
                                    name="completionResult"
                                    value={formData.completionResult}
                                    onChange={handleChange}
                                    hasError={errors.completionResult}
                                >
                                    <option value="">Select Result</option>
                                    {(purpose?.outcomes || []).map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                                </FormSelect>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </ActivityCard>
    );
};

export default CallActivitySection;
