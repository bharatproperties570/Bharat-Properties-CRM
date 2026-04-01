import { FormLabel, FormInput, FormSelect } from './ActivityCommon';

const ActivityBasicFields = ({ formData, handleChange, errors }) => {
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
