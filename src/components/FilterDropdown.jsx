import React, { useState, useRef, useEffect } from 'react';

function FilterDropdown({ isOpen, onClose, filters, setFilters, onApply, onClearAll, buttonRef }) {
    const dropdownRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, right: 0 });

    // Calculate position based on button
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const buttonRect = buttonRef.current.getBoundingClientRect();
            setPosition({
                top: buttonRect.bottom + 8, // 8px below button
                right: window.innerWidth - buttonRect.right // align right edge
            });
        }
    }, [isOpen, buttonRef]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isOpen &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef]);

    if (!isOpen) return null;

    const handleFilterChange = (category, value) => {
        setFilters(prev => ({
            ...prev,
            [category]: prev[category].includes(value)
                ? prev[category].filter(v => v !== value)
                : [...prev[category], value]
        }));
    };

    const handleSingleFilterChange = (category, value) => {
        setFilters(prev => ({ ...prev, [category]: value }));
    };

    const getActiveFilterCount = () => {
        let count = 0;
        Object.entries(filters).forEach(([key, value]) => {
            if (Array.isArray(value)) count += value.length;
            else if (value) count += 1;
        });
        return count;
    };

    return (
        <div
            ref={dropdownRef}
            style={{
                position: 'fixed',
                top: `${position.top}px`,
                right: `${position.right}px`,
                zIndex: 9999
            }}
            className="w-[380px] bg-white rounded-lg shadow-2xl border-2 border-gray-200 max-h-[600px] overflow-y-auto"
        >
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 flex items-center justify-between rounded-t-lg z-10">
                <div className="flex items-center gap-2">
                    <i className="fas fa-filter"></i>
                    <span className="font-bold">Filters</span>
                    {getActiveFilterCount() > 0 && (
                        <span className="bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs font-bold">
                            {getActiveFilterCount()}
                        </span>
                    )}
                </div>
                <button onClick={onClose} className="hover:bg-white hover:bg-opacity-20 rounded p-1">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {/* Professional Category */}
                <div>
                    <h4 className="text-xs font-bold text-gray-600 mb-2">PROFESSIONAL</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {['Buyer', 'Seller', 'Investor', 'Channel Partner', 'Broker'].map(prof => (
                            <button
                                key={prof}
                                onClick={() => handleFilterChange('professional', prof)}
                                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${filters.professional.includes(prof)
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {prof}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* Category */}
                <div>
                    <h4 className="text-xs font-bold text-gray-600 mb-2">CATEGORY</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {['Customer', 'Prospect', 'Real Estate Agent', 'Vendor'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => handleFilterChange('category', cat)}
                                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${filters.category.includes(cat)
                                        ? 'bg-green-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* Source */}
                <div>
                    <h4 className="text-xs font-bold text-gray-600 mb-2">SOURCE</h4>
                    <div className="flex flex-wrap gap-1.5">
                        {['Website', 'Referral', 'Cold Call', 'Social Media', 'Walk-in', 'Advertisement'].map(src => (
                            <button
                                key={src}
                                onClick={() => handleFilterChange('source', src)}
                                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${filters.source.includes(src)
                                        ? 'bg-orange-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {src}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* CRM Activity */}
                <div>
                    <h4 className="text-xs font-bold text-gray-600 mb-2">CRM ACTIVITY</h4>
                    <div className="space-y-1.5">
                        {[
                            { key: 'hasLeads', label: 'Has Leads' },
                            { key: 'hasDeals', label: 'Has Deals' },
                            { key: 'hasProperties', label: 'Has Properties' },
                            { key: 'hasBookings', label: 'Has Bookings' },
                            { key: 'hasActivities', label: 'Has Activities' }
                        ].map(item => (
                            <label key={item.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                                <input
                                    type="checkbox"
                                    checked={filters.crmActivity.includes(item.key)}
                                    onChange={() => handleFilterChange('crmActivity', item.key)}
                                    className="w-3.5 h-3.5"
                                />
                                <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="border-t border-gray-200"></div>

                {/* Date Range */}
                <div>
                    <h4 className="text-xs font-bold text-gray-600 mb-2">DATE ADDED</h4>
                    <select
                        value={filters.dateRange}
                        onChange={(e) => handleSingleFilterChange('dateRange', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-xs font-semibold"
                    >
                        <option value="">All Time</option>
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </select>
                </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 rounded-b-lg">
                <button
                    onClick={onClearAll}
                    className="text-xs font-semibold text-gray-600 hover:text-red-600 px-3 py-1.5 hover:bg-red-50 rounded"
                >
                    Clear All
                </button>
                <button
                    onClick={onApply}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded text-xs font-bold hover:bg-blue-700"
                >
                    Apply Filters
                </button>
            </div>
        </div>
    );
}

export default FilterDropdown;
