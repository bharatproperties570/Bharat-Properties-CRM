import React, { useEffect } from 'react';

function FilterPanel({ isOpen, onClose, filters, setFilters, onApply, onClearAll }) {
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
            if (Array.isArray(value)) {
                count += value.length;
            } else if (value) {
                count += 1;
            }
        });
        return count;
    };

    const activeCount = getActiveFilterCount();

    // Don't render anything if not open
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999]">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black bg-opacity-40"
                onClick={onClose}
            />

            {/* Filter Panel - Right Side */}
            <div className="absolute top-0 right-0 h-full w-[420px] bg-white shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between shadow-lg flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-filter text-xl"></i>
                        <h2 className="text-xl font-bold">Filters</h2>
                        {activeCount > 0 && (
                            <span className="bg-white text-blue-600 px-2.5 py-1 rounded-full text-xs font-bold">
                                {activeCount}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:bg-opacity-20 transition-colors"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6">
                    {/* Professional Category */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-user-tie text-blue-600"></i>
                            PROFESSIONAL CATEGORY
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {['Buyer', 'Seller', 'Investor', 'Channel Partner', 'Broker'].map(prof => (
                                <button
                                    key={prof}
                                    onClick={() => handleFilterChange('professional', prof)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${filters.professional.includes(prof)
                                            ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-md transform scale-105'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {prof}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 mb-6"></div>

                    {/* Contact Category */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-users text-green-600"></i>
                            CONTACT CATEGORY
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {['Customer', 'Prospect', 'Real Estate Agent', 'Vendor'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => handleFilterChange('category', cat)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${filters.category.includes(cat)
                                            ? 'bg-gradient-to-r from-green-500 to-teal-500 text-white shadow-md transform scale-105'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 mb-6"></div>

                    {/* Source */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-bullseye text-orange-600"></i>
                            SOURCE
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {['Website', 'Referral', 'Cold Call', 'Social Media', 'Walk-in', 'Advertisement'].map(src => (
                                <button
                                    key={src}
                                    onClick={() => handleFilterChange('source', src)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${filters.source.includes(src)
                                            ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-md transform scale-105'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {src}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 mb-6"></div>

                    {/* CRM Activity Status */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-chart-line text-purple-600"></i>
                            CRM ACTIVITY
                        </h3>
                        <div className="space-y-2">
                            {[
                                { key: 'hasLeads', label: 'Has Leads', icon: 'fa-user-plus' },
                                { key: 'hasDeals', label: 'Has Deals', icon: 'fa-handshake' },
                                { key: 'hasProperties', label: 'Has Properties', icon: 'fa-building' },
                                { key: 'hasBookings', label: 'Has Bookings', icon: 'fa-calendar-check' },
                                { key: 'hasActivities', label: 'Has Activities', icon: 'fa-tasks' }
                            ].map(item => (
                                <label key={item.key} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={filters.crmActivity.includes(item.key)}
                                        onChange={() => handleFilterChange('crmActivity', item.key)}
                                        className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                                    />
                                    <i className={`fas ${item.icon} text-gray-600 text-sm`}></i>
                                    <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-gray-200 mb-6"></div>

                    {/* Date Range */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-calendar text-indigo-600"></i>
                            DATE ADDED
                        </h3>
                        <select
                            value={filters.dateRange}
                            onChange={(e) => handleSingleFilterChange('dateRange', e.target.value)}
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-semibold text-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                        >
                            <option value="">All Time</option>
                            <option value="7">Last 7 Days</option>
                            <option value="30">Last 30 Days</option>
                            <option value="90">Last 90 Days</option>
                        </select>
                    </div>

                    <div className="border-t border-gray-200 mb-6"></div>

                    {/* Communication Status */}
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                            <i className="fas fa-comments text-teal-600"></i>
                            COMMUNICATION STATUS
                        </h3>
                        <div className="space-y-2">
                            {[
                                { value: 'recent', label: 'Recently Active (< 7 days)' },
                                { value: 'moderate', label: 'Moderately Active (7-30 days)' },
                                { value: 'inactive', label: 'Inactive (> 30 days)' }
                            ].map(status => (
                                <label key={status.value} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors">
                                    <input
                                        type="radio"
                                        name="commStatus"
                                        checked={filters.commStatus === status.value}
                                        onChange={() => handleSingleFilterChange('commStatus', status.value)}
                                        className="w-4 h-4 text-teal-600"
                                    />
                                    <span className="text-sm font-semibold text-gray-700">{status.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 bg-white border-t-2 border-gray-100 px-6 py-4 flex items-center justify-between shadow-lg">
                    <button
                        onClick={onClearAll}
                        className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                        <i className="fas fa-times-circle mr-2"></i>
                        Clear All
                    </button>
                    <button
                        onClick={onApply}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-lg shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200"
                    >
                        <i className="fas fa-check mr-2"></i>
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    );
}

export default FilterPanel;
