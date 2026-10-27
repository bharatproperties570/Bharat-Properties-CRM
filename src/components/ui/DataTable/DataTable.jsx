import React from 'react';

/**
 * DOM-safe interactive target detection.
 * Inspects target and its ancestors to identify buttons, links, inputs, and opt-outs.
 */
const isInteractiveTarget = (target) => {
  if (!target) return false;
  const element = target.nodeType === 1 ? target : (target.parentElement || null);
  if (!element || typeof element.closest !== 'function') return false;

  return Boolean(
    element.closest(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="switch"], [data-prevent-row-click]'
    )
  );
};

/**
 * Checks whether a rendered React element is already interactive.
 */
const isReactElementInteractive = (element) => {
  if (!React.isValidElement(element)) return false;

  const type = element.type;
  if (typeof type === 'string') {
    if (['a', 'button', 'input', 'select', 'textarea'].includes(type.toLowerCase())) {
      return true;
    }
  }

  const props = element.props;
  if (!props) return false;

  if (
    typeof props.onClick === 'function' ||
    props.href !== undefined ||
    props.to !== undefined ||
    ['button', 'link', 'checkbox', 'menuitem'].includes(props.role) ||
    props['data-prevent-row-click'] !== undefined
  ) {
    return true;
  }

  return false;
};

/**
 * Resolves the column that should host the primary row action trigger for keyboard users.
 */
const resolvePrimaryColumn = (columns, primaryColumnKey) => {
  if (!Array.isArray(columns) || columns.length === 0) return null;

  // 1. Explicit primaryColumnKey prop on DataTable
  if (primaryColumnKey) {
    return (
      columns.find(
        (c) => c && (c.key === primaryColumnKey || c.accessor === primaryColumnKey)
      ) || null
    );
  }

  // 2. Explicit isPrimary flag on a column definition
  const explicitCol = columns.find((c) => c && c.isPrimary);
  if (explicitCol) return explicitCol;

  // 3. Fallback: Find the first non-selection, non-action data column
  const candidate = columns.find((c) => {
    if (!c) return false;
    if (c.isSelection || c.isAction) return false;
    const identifier = String(c.key || c.accessor || '').toLowerCase();
    if (['select', 'selection', 'checkbox', 'actions', 'action', 'menu'].includes(identifier)) {
      return false;
    }
    return true;
  });

  return candidate || null;
};

export const DataTable = ({
  columns = [],
  data = [],
  keyField = 'id',
  primaryColumnKey,
  disableRowKeyboardTrigger = false,
  getRowAriaLabel,
  isLoading = false,
  emptyMessage = "No records found.",
  onRowClick,
  className = ''
}) => {
  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}
      >
        <i className="fas fa-spinner fa-spin fa-2x" aria-hidden="true"></i>
        <p style={{ marginTop: '10px' }}>Loading data...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}
      >
        {typeof emptyMessage === 'string' ? <p style={{ margin: 0 }}>{emptyMessage}</p> : emptyMessage}
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

  const primaryActionStyle = {
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    fontWeight: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    letterSpacing: 'inherit',
    textAlign: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    outlineOffset: '2px',
    textDecoration: 'none'
  };

  const isClickable = typeof onRowClick === 'function';
  const baseTrStyle = isClickable ? { cursor: 'pointer', transition: 'background 0.2s' } : {};
  const primaryCol = isClickable ? resolvePrimaryColumn(columns, primaryColumnKey) : null;

  const handleRowClick = (e, row) => {
    if (!isClickable) return;
    if (isInteractiveTarget(e.target)) return;
    onRowClick(row);
  };

  return (
    <div style={{ overflowX: 'auto', width: '100%', background: '#fff', borderRadius: '8px' }} className={`ui-datatable ${className}`}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map((col, colIndex) => {
              const colKey = col.key || col.accessor || `col-${colIndex}`;
              return (
                <th key={colKey} style={{ ...thStyle, ...(col.headerStyle || {}) }}>
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const rowKey = (row && (row[keyField] ?? row.id ?? row._id)) ?? `row-${rowIndex}`;

            return (
              <tr
                key={rowKey}
                style={baseTrStyle}
                onClick={isClickable ? (e) => handleRowClick(e, row) : undefined}
                onMouseEnter={isClickable ? (e) => { e.currentTarget.style.background = '#f8fafc'; } : undefined}
                onMouseLeave={isClickable ? (e) => { e.currentTarget.style.background = 'transparent'; } : undefined}
              >
                {columns.map((col, colIndex) => {
                  const cellKey = col.key || col.accessor || `cell-${colIndex}`;
                  const isPrimaryCol = isClickable && primaryCol === col;
                  const cellContent = col.render ? col.render(row, rowIndex) : row[col.accessor];

                  const shouldWrapPrimary =
                    isPrimaryCol &&
                    !disableRowKeyboardTrigger &&
                    !col.disablePrimaryTrigger &&
                    cellContent !== null &&
                    cellContent !== undefined &&
                    cellContent !== '' &&
                    !isReactElementInteractive(cellContent);

                  return (
                    <td key={cellKey} style={{ ...tdStyle, ...(col.cellStyle || {}) }}>
                      {shouldWrapPrimary ? (
                        <button
                          type="button"
                          className="ui-datatable-primary-action"
                          style={primaryActionStyle}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick(row);
                          }}
                          aria-label={
                            typeof getRowAriaLabel === 'function'
                              ? getRowAriaLabel(row, rowIndex)
                              : (typeof cellContent === 'string' ? `Select ${cellContent}` : undefined)
                          }
                        >
                          {cellContent}
                        </button>
                      ) : (
                        cellContent
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
