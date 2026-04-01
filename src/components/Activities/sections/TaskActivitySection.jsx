import { FormLabel, FormSelect, ActivityCard, SectionTitle } from '../ActivityCommon';

const TaskActivitySection = ({ formData, handleChange, errors, activityMasterFields }) => {
    const isCompleted = formData.status === 'Completed';
    const taskAct = activityMasterFields?.activities?.find(a => a.name === 'Task');

    return (
        <ActivityCard background="#f5f3ff" borderColor="#ddd6fe">
            <SectionTitle icon="fas fa-tasks" color="#6d28d9">Task Details</SectionTitle>
            
            <div style={{ marginBottom: '16px' }}>
                <FormLabel>Task Purpose</FormLabel>
                <FormSelect name="purpose" value={formData.purpose} onChange={handleChange}>
                    <option value="">Select Purpose</option>
                    {(taskAct?.purposes || []).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </FormSelect>
            </div>

            {isCompleted && (
                <div style={{ borderTop: '1px solid #ddd6fe', paddingTop: '16px', marginTop: '16px', animation: 'fadeIn 0.3s ease-out' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <FormLabel required>Completion Result</FormLabel>
                        <FormSelect name="completionResult" value={formData.completionResult} onChange={handleChange} hasError={errors.completionResult}>
                            <option value="">Select Result</option>
                            <option value="Completed">Completed</option>
                            <option value="Deferred">Deferred</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="Partially Completed">Partially Completed</option>
                        </FormSelect>
                    </div>
                </div>
            )}
        </ActivityCard>
    );
};

export default TaskActivitySection;
