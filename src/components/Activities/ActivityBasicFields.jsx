import { FormLabel, FormInput, FormSelect } from './ActivityCommon';

const ActivityBasicFields = ({ formData, handleChange, errors, activityMasterFields }) => {
    return (
        <div style={{ marginBottom: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
                <FormLabel required>Subject</FormLabel>
                <FormInput
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    hasError={errors.subject}
                    placeholder="Enter activity subject..."
                />
                {errors.subject && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.subject}</span>}
            </div>

            {['Call', 'Meeting', 'Site Visit', 'Email', 'Task'].includes(formData.activityType) && (
                <div style={{ marginBottom: '16px' }}>
                    <FormLabel required>
                        {formData.activityType === 'Call' ? 'Call Purpose' : 
                         formData.activityType === 'Meeting' ? 'Agenda' : 
                         formData.activityType === 'Site Visit' ? 'Visit Type' :
                         formData.activityType === 'Email' ? 'Email Purpose' : 'Task Purpose'}
                    </FormLabel>
                    <FormSelect
                        name="purpose"
                        value={formData.purpose}
                        onChange={handleChange}
                        hasError={errors.purpose}
                    >
                        <option value="">Select {formData.activityType === 'Meeting' ? 'Agenda' : 
                                               formData.activityType === 'Site Visit' ? 'Type' : 'Purpose'}</option>
                        {(activityMasterFields?.activities?.find(a => a.name === formData.activityType)?.purposes || []).map(p => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                        ))}
                    </FormSelect>
                    {errors.purpose && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.purpose}</span>}
                </div>
            )}

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <FormLabel required>Date</FormLabel>
                    <FormInput
                        type="date"
                        name="dueDate"
                        value={formData.dueDate}
                        onChange={handleChange}
                        hasError={errors.dueDate}
                    />
                    {errors.dueDate && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.dueDate}</span>}
                </div>
                <div style={{ flex: 1 }}>
                    <FormLabel>Time</FormLabel>
                    <FormInput
                        type="time"
                        name="dueTime"
                        value={formData.dueTime}
                        onChange={handleChange}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <FormLabel>Priority</FormLabel>
                    <FormSelect
                        name="priority"
                        value={formData.priority}
                        onChange={handleChange}
                    >
                        <option value="High">High</option>
                        <option value="Normal">Normal</option>
                        <option value="Low">Low</option>
                    </FormSelect>
                </div>
            </div>
        </div>
    );
};

export default ActivityBasicFields;
