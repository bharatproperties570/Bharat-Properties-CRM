import { useEffect, useRef } from 'react';
import { FormLabel, FormSelect, FormInput, ActivityCard, SectionTitle } from '../ActivityCommon';

const MeetingActivitySection = ({ formData, handleChange, errors, activityMasterFields }) => {
    const isCompleted = formData.status === 'Completed';
    const meetAct = activityMasterFields?.activities?.find(a => a.name === 'Meeting');
    const purpose = meetAct?.purposes?.find(p => p.name === formData.purpose);
    const locationInputRef = useRef(null);

    useEffect(() => {
        if (formData.activityType === 'Meeting' && formData.meetingType !== 'Virtual' && window.google && locationInputRef.current) {
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
    }, [formData.activityType, formData.meetingType, handleChange]);

    return (
        <ActivityCard background="#fdf4ff" borderColor="#f5d0fe">
            <SectionTitle icon="fas fa-users" color="#a21caf">Meeting Details</SectionTitle>
            
            <div style={{ marginBottom: '16px' }}>
                <FormLabel>Meeting Type</FormLabel>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {['Office', 'On-Site', 'Virtual', 'Developer Office'].map(type => (
                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                            <input
                                type="radio"
                                name="meetingType"
                                value={type}
                                checked={formData.meetingType === type}
                                onChange={handleChange}
                                style={{ accentColor: '#a21caf' }}
                            />
                            {type}
                        </label>
                    ))}
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <FormLabel required>{formData.meetingType === 'Virtual' ? 'Meeting Link' : 'Location'}</FormLabel>
                <FormInput
                    ref={formData.meetingType !== 'Virtual' ? locationInputRef : null}
                    name="meetingLocation"
                    value={formData.meetingLocation}
                    onChange={handleChange}
                    hasError={errors.meetingLocation}
                    placeholder={formData.meetingType === 'Virtual' ? "Zoom/Meet Link" : "Search location..."}
                />
            </div>

            <div style={{ marginBottom: isCompleted ? '16px' : '0' }}>
                <FormLabel>Agenda</FormLabel>
                <FormSelect
                    name="purpose"
                    value={formData.purpose}
                    onChange={handleChange}
                >
                    <option value="">Select Agenda</option>
                    {(meetAct?.purposes || []).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </FormSelect>
            </div>

            {isCompleted && (
                <div style={{ borderTop: '1px solid #f5d0fe', paddingTop: '16px', marginTop: '16px', animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
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
                            <div style={{ flex: 1 }}>
                                <FormLabel required>Outcome</FormLabel>
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
                    </div>
                </div>
            )}
        </ActivityCard>
    );
};

export default MeetingActivitySection;
