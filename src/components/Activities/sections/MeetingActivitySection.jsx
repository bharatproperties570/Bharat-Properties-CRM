import { useTheme } from '../../../context/ThemeContext';
import { useEffect, useRef } from 'react';
import { FormLabel, FormSelect, FormInput, ActivityCard, SectionTitle } from '../ActivityCommon';

const MeetingActivitySection = ({ formData, handleChange, errors, activityMasterFields, view = 'full' }) => {
    const { isDark } = useTheme();
    const isCompleted = formData.status === 'Completed';
    const meetAct = activityMasterFields?.activities?.find(a => a.name === 'Meeting');
    const purpose = meetAct?.purposes?.find(p => p.name === formData.purpose);
    const locationInputRef = useRef(null);

    useEffect(() => {
        if (formData.activityType === 'Meeting' && formData.meetingType !== 'Virtual' && window.google && locationInputRef.current && view !== 'results') {
            const autocomplete = new window.google.maps.places.Autocomplete(locationInputRef.current, {
                types: ['geocode', 'establishment'],
                componentRestrictions: { country: 'in' },
            });
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                const address = place.formatted_address || place.name;
                handleChange({ target: { name: 'meetingLocation', value: address } });
            });
        }
    }, [formData.activityType, formData.meetingType, handleChange, view]);

    if (view === 'results' && !isCompleted) return null;

    // --- RESULTS VIEW (Right Side) ---
    if (view === 'results') {
        return (
            <ActivityCard background="#fdf4ff" borderColor="#f5d0fe" style={{ marginBottom: '16px' }}>
                <SectionTitle icon="fas fa-check-circle" color="#a21caf">Meeting Outcome</SectionTitle>
                
                <div style={{ marginBottom: '16px' }}>
                    <FormLabel required>Meeting Status</FormLabel>
                    <FormSelect
                        name="meetingOutcomeStatus"
                        value={formData.meetingOutcomeStatus}
                        onChange={handleChange}
                        hasError={errors.meetingOutcomeStatus}
                    >
                        <option value="">Select Status</option>
                        <option value="Conducted">Conducted</option>
                        <option value="Rescheduled">Rescheduled</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="No Show">No Show</option>
                    </FormSelect>
                </div>

                {formData.meetingOutcomeStatus === 'Conducted' && (
                    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        <FormLabel required>Outcome / Result</FormLabel>
                        <FormSelect
                            name="completionResult"
                            value={formData.completionResult}
                            onChange={handleChange}
                            hasError={errors.completionResult}
                        >
                            <option value="">Select Outcome</option>
                            {(purpose?.outcomes || []).map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
                        </FormSelect>
                    </div>
                )}
            </ActivityCard>
        );
    }

    // --- SELECTION VIEW (Left Side) ---
    return (
        <ActivityCard background="#fdf4ff" borderColor="#f5d0fe" style={{ marginBottom: '16px' }}>
            <SectionTitle icon="fas fa-users" color="#a21caf">Meeting Details</SectionTitle>
            
            <div style={{ marginBottom: '16px' }}>
                <FormLabel>Meeting Location</FormLabel>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {['Office', 'On-Site', 'Virtual', 'Developer Office'].map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: isDark ? 'var(--text-main)' : '#334155' }}>
                            <input
                                type="radio"
                                name="meetingType"
                                value={type}
                                checked={formData.meetingType === type}
                                onChange={(e) => {
                                    handleChange(e);
                                    if (e.target.value === 'Virtual') {
                                        handleChange({ target: { name: 'meetingLocation', value: '' } });
                                    }
                                }}
                                style={{ accentColor: '#a21caf' }}
                            />
                            {type}
                        </label>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <FormLabel required>{formData.meetingType === 'Virtual' ? 'Meeting Link' : 'Location Address'}</FormLabel>
                <FormInput
                    key={formData.meetingType}
                    ref={formData.meetingType !== 'Virtual' ? locationInputRef : null}
                    name="meetingLocation"
                    value={formData.meetingLocation}
                    onChange={handleChange}
                    hasError={errors.meetingLocation}
                    placeholder={formData.meetingType === 'Virtual' ? "Paste Zoom/Meet Link here" : "Search or enter address..."}
                />
            </div>
        </ActivityCard>
    );
};

export default MeetingActivitySection;
