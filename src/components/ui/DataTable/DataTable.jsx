import React from 'react';

export const DataTable = ({
  columns,
  data,
  keyField = 'id',
  isLoading = false,
  emptyMessage = "No records found.",
  onRowClick,
  className = ''
}) => {
  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <i className="fas fa-spinner fa-spin fa-2x"></i>
        <p style={{ marginTop: '10px' }}>Loading data...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.9rem',
    textAlign: 'left'
  };

  const thStyle = {
    padding: '12px 16px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#475569',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '0.05em'
  };

  const tdStyle = {
    padding: '16px',
    borderBottom: '1px solid #f1f5f9',
    color: '#0f172a'
  };

  const trStyle = onRowClick ? { cursor: 'pointer', transition: 'background 0.2s' } : {};

  return (
    <div style={{ overflowX: 'auto', width: '100%', background: '#fff', borderRadius: '8px' }} className={`ui-datatable ${className}`}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map((col, index) => (
              <th key={index} style={{ ...thStyle, ...(col.headerStyle || {}) }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row[keyField] || Math.random()}
              style={trStyle}
              onClick={() => onRowClick && onRowClick(row)}
              onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { if (onRowClick) e.currentTarget.style.background = 'transparent'; }}
            >
              {columns.map((col, index) => (
                <td key={index} style={{ ...tdStyle, ...(col.cellStyle || {}) }}>
                  {col.render ? col.render(row) : row[col.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
