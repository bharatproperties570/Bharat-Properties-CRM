import React from 'react';

const styles = {
    builderContainer: {
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '16px',
        background: 'var(--bg-light)',
        marginBottom: '12px'
    },
    groupHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px'
    },
    selectBox: {
        padding: '6px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        color: 'var(--text-main)',
        fontSize: '0.85rem',
        fontWeight: '600',
        outline: 'none'
    },
    button: {
        padding: '6px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        color: 'var(--text-main)',
        fontSize: '0.85rem',
        fontWeight: '600',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    },
    deleteButton: {
        padding: '6px',
        borderRadius: '6px',
        border: '1px solid #fca5a5',
        background: '#fef2f2',
        color: '#ef4444',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    },
    ruleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
        padding: '12px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px'
    },
    input: {
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        background: 'var(--bg-card)',
        color: 'var(--text-main)',
        fontSize: '0.85rem',
        flex: 1,
        outline: 'none'
    }
};

const RuleBuilder = ({ node, onChange, onDelete, level = 0, fields = [] }) => {
    if (!node) return null;

    // Handle leaf rule
    if (node.field !== undefined) {
        return (
            <div style={styles.ruleRow}>
                {fields.length > 0 ? (
                    <select 
                        value={node.field}
                        onChange={(e) => onChange({ ...node, field: e.target.value })}
                        style={{ ...styles.selectBox, flex: 1 }}
                    >
                        <option value="">Select Field</option>
                        {fields.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                ) : (
                    <input 
                        type="text" 
                        placeholder="Field (e.g. type, status)"
                        value={node.field}
                        onChange={(e) => onChange({ ...node, field: e.target.value })}
                        style={styles.input}
                    />
                )}
                <select 
                    value={node.operator || '=='}
                    onChange={(e) => onChange({ ...node, operator: e.target.value })}
                    style={styles.selectBox}
                >
                    <option value="==">Equals (==)</option>
                    <option value="!=">Not Equals (!=)</option>
                    <option value="IN">Is In (IN)</option>
                    <option value="NOT_IN">Is Not In (NOT_IN)</option>
                    <option value=">">Greater Than (&gt;)</option>
                    <option value="<">Less Than (&lt;)</option>
                </select>
                <input 
                    type="text" 
                    placeholder={node.operator === 'IN' || node.operator === 'NOT_IN' ? 'Values (comma separated)' : 'Value'}
                    value={Array.isArray(node.value) ? node.value.join(', ') : (node.value || '')}
                    onChange={(e) => {
                        // Store exactly what the user types as a string
                        onChange({ ...node, value: e.target.value });
                    }}
                    style={styles.input}
                />
                {onDelete && (
                    <button onClick={onDelete} title="Remove Rule" style={styles.deleteButton}>
                        <i className="fas fa-trash"></i>
                    </button>
                )}
            </div>
        );
    }

    // Handle group
    const handleOperatorChange = (e) => {
        onChange({ ...node, operator: e.target.value });
    };

    const handleAddRule = () => {
        onChange({
            ...node,
            rules: [...(node.rules || []), { field: '', operator: '==', value: '' }]
        });
    };

    const handleAddGroup = () => {
        onChange({
            ...node,
            rules: [...(node.rules || []), { operator: 'AND', rules: [] }]
        });
    };

    const handleUpdateChild = (index, newChild) => {
        const newRules = [...(node.rules || [])];
        newRules[index] = newChild;
        onChange({ ...node, rules: newRules });
    };

    const handleDeleteChild = (index) => {
        const newRules = [...(node.rules || [])];
        newRules.splice(index, 1);
        onChange({ ...node, rules: newRules });
    };

    return (
        <div style={{ ...styles.builderContainer, marginLeft: level > 0 ? '24px' : '0' }}>
            <div style={styles.groupHeader}>
                <select value={node.operator || 'AND'} onChange={handleOperatorChange} style={styles.selectBox}>
                    <option value="AND">AND (All)</option>
                    <option value="OR">OR (Any)</option>
                </select>
                <button onClick={handleAddRule} style={styles.button}>
                    <i className="fas fa-plus"></i> Add Rule
                </button>
                <button onClick={handleAddGroup} style={styles.button}>
                    <i className="fas fa-layer-group"></i> Add Group
                </button>
                {onDelete && (
                    <button onClick={onDelete} title="Remove Group" style={{ ...styles.deleteButton, marginLeft: 'auto' }}>
                        <i className="fas fa-trash"></i>
                    </button>
                )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(node.rules || []).length === 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                        No rules in this group.
                    </div>
                )}
                {(node.rules || []).map((child, index) => (
                    <RuleBuilder
                        key={index}
                        node={child}
                        onChange={(newChild) => handleUpdateChild(index, newChild)}
                        onDelete={() => handleDeleteChild(index)}
                        level={level + 1}
                        fields={fields}
                    />
                ))}
            </div>
        </div>
    );
};

export default RuleBuilder;
