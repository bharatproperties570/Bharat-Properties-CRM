import React, { useState } from 'react';
import { contactData } from '../data/mockData';
import { getInitials } from '../utils/helpers';
import { useContactSync } from '../hooks/useContactSync';

function PersonView() {
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [recordsPerPage, setRecordsPerPage] = useState(25);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'card'

    // Contact Sync Hook
    const { syncMultipleContacts } = useContactSync();

    // Filtering logic
    const filteredContacts = contactData.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.mobile.includes(searchTerm) ||
        (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Selection Handling
    const toggleSelect = (mobile) => {
        setSelectedIds(prev =>
            prev.includes(mobile) ? prev.filter(id => id !== mobile) : [...prev, mobile]
        );
    };

    // Select All Handler
    const toggleSelectAll = () => {
        if (selectedIds.length === paginatedContacts.length && paginatedContacts.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedContacts.map(c => c.mobile));
        }
    };

    const isSelected = (mobile) => selectedIds.includes(mobile);
    const totalCount = contactData.length;
    const selectedCount = selectedIds.length;

    // Pagination
    const indexOfLastRecord = currentPage * recordsPerPage;
    const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
    const paginatedContacts = filteredContacts.slice(indexOfFirstRecord, indexOfLastRecord);
    const totalPages = Math.ceil(filteredContacts.length / recordsPerPage);

    // Regrouping paginated results
    const groups = {};
    paginatedContacts.forEach(c => {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
    });

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };

    const handleRecordsPerPageChange = (e) => {
        setRecordsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    // Check if all visible contacts are selected
    const isAllSelected = paginatedContacts.length > 0 && selectedIds.length === paginatedContacts.length;
    const isIndeterminate = selectedIds.length > 0 && selectedIds.length < paginatedContacts.length;

    return (
        <section id="personView" className="view-section active">
            <div className="view-scroll-wrapper">
                {/* Page Header */}
                <div className="page-header">
                    <div className="page-title-group">
                        <i className="fas fa-bars text-[#68737d]"></i>
                        <div>
                            <span className="working-list-label">Database CRM</span>
                            <h1>Person Portfolio</h1>
                        </div>
                    </div>
                    <div className="flex gap-4 items-center">
                        {/* Sync Status Indicator */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                            <i className="fas fa-check-circle text-green-600 text-sm"></i>
                            <span className="text-xs font-semibold text-green-700">Synced</span>
                        </div>
                        {/* View Toggle Button */}
                        <button
                            className="btn-outline flex items-center gap-1.5"
                            onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                            title={viewMode === 'list' ? 'Switch to Card View' : 'Switch to List View'}
                        >
                            <i className={`fas ${viewMode === 'list' ? 'fa-th-large' : 'fa-list'}`}></i>
                            {viewMode === 'list' ? 'Card' : 'List'}
                        </button>
                        <button className="btn-outline"><i className="fas fa-filter"></i> Filters</button>
                    </div>
                </div>

                <div className="content-body overflow-y-visible pt-0 relative">
                    {/* Toolbar */}
                    <div className="toolbar-container sticky top-0 z-[101] py-4 px-8 border-b border-[#eef2f5] min-h-[65px] flex items-center bg-white">
                        {selectedCount > 0 ? (
                            <div className="action-panel flex gap-2 items-center w-full overflow-x-auto pt-1 pb-0.5">
                                {/* Select All Checkbox - Always visible */}
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = isIndeterminate;
                                        }
                                    }}
                                    onChange={toggleSelectAll}
                                    className="cursor-pointer"
                                />
                                <div className="selection-count mr-2.5 font-semibold text-[var(--primary-color)] whitespace-nowrap">
                                    {selectedCount} Selected
                                </div>

                                {/* Single Selection Only */}
                                {selectedCount === 1 && (
                                    <>
                                        <button className="action-btn" title="Call Contact">
                                            <i className="fas fa-phone-alt scale-x-[-1] rotate-[5deg]"></i> Call
                                        </button>
                                        <div className="w-px h-6 bg-slate-200 mx-1"></div>
                                    </>
                                )}

                                {/* Email - Always show */}
                                <button className="action-btn" title="Email Contact">
                                    <i className="fas fa-envelope"></i> Email
                                </button>

                                {/* Single Selection Only - Edit & Create Lead */}
                                {selectedCount === 1 && (
                                    <>
                                        <button className="action-btn" title="Edit Contact">
                                            <i className="fas fa-edit"></i> Edit
                                        </button>
                                        <button className="action-btn" title="Create Lead">
                                            <i className="fas fa-user-plus"></i> Create Lead
                                        </button>
                                    </>
                                )}

                                {/* Action Buttons - Available for all selections */}
                                <button className="action-btn" title="Activities">
                                    <i className="fas fa-calendar-check"></i> Activities
                                </button>
                                <button className="action-btn" title="Transfer Contact">
                                    <i className="fas fa-exchange-alt"></i> Transfer Contact
                                </button>
                                <button className="action-btn" title="Sequence">
                                    <i className="fas fa-stream"></i> Sequence
                                </button>
                                <button className="action-btn" title="Send Message">
                                    <i className="fas fa-paper-plane"></i> Send Message
                                </button>
                                <button className="action-btn" title="Add Tag">
                                    <i className="fas fa-tag"></i> Tag
                                </button>

                                <div className="ml-auto">
                                    <button className="action-btn danger" title="Delete">
                                        <i className="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-4">
                                    {/* Select All Checkbox - Only for Card View */}
                                    {viewMode === 'card' && (
                                        <input
                                            type="checkbox"
                                            checked={isAllSelected}
                                            ref={input => {
                                                if (input) {
                                                    input.indeterminate = isIndeterminate;
                                                }
                                            }}
                                            onChange={toggleSelectAll}
                                            className="cursor-pointer"
                                        />
                                    )}
                                    <div className="relative w-[350px]">
                                        <input
                                            type="text"
                                            className="search-input-premium w-full"
                                            placeholder="Search by name, phone or email..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        <i className={`fas fa-search search-icon-premium ${searchTerm ? 'active' : ''}`}></i>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-slate-600">
                                        Showing: <strong>{paginatedContacts.length}</strong> / <strong>{totalCount}</strong>
                                    </div>

                                    {/* Records Per Page */}
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <span>Show:</span>
                                        <select
                                            value={recordsPerPage}
                                            onChange={handleRecordsPerPageChange}
                                            className="px-2 py-1 border border-slate-200 rounded-md text-xs font-semibold text-slate-900 outline-none cursor-pointer"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                            <option value={300}>300</option>
                                            <option value={500}>500</option>
                                            <option value={700}>700</option>
                                            <option value={1000}>1000</option>
                                        </select>
                                    </div>

                                    {/* Pagination Controls */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={goToPreviousPage}
                                            disabled={currentPage === 1}
                                            className={`px-3 py-1.5 border rounded-md text-xs font-semibold ${currentPage === 1
                                                ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                                : 'bg-white text-slate-900 border-slate-200 cursor-pointer'
                                                }`}
                                        >
                                            <i className="fas fa-chevron-left"></i> Prev
                                        </button>
                                        <span className="text-xs font-semibold text-slate-900 min-w-[80px] text-center">
                                            {currentPage} / {totalPages || 1}
                                        </span>
                                        <button
                                            onClick={goToNextPage}
                                            disabled={currentPage >= totalPages}
                                            className={`px-3 py-1.5 border rounded-md text-xs font-semibold ${currentPage >= totalPages
                                                ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                                : 'bg-white text-slate-900 border-slate-200 cursor-pointer'
                                                }`}
                                        >
                                            Next <i className="fas fa-chevron-right"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* List View */}
                    {viewMode === 'list' ? (
                        <>
                            {/* Header Strip */}
                            <div className="list-header contact-list-grid sticky top-[65px] bg-[#f8fafc] z-[100] border-b-2 border-slate-200">
                                <div>
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        ref={input => {
                                            if (input) {
                                                input.indeterminate = isIndeterminate;
                                            }
                                        }}
                                        onChange={toggleSelectAll}
                                        className="cursor-pointer"
                                    />
                                </div>
                                <div>Personal Details</div>
                                <div>Location & Address</div>
                                <div>Professional Detail</div>
                                <div>Source & Tags</div>
                                <div>CRM Linkage</div>
                                <div>Last Interaction</div>
                                <div>Assigned</div>
                            </div>

                            <div id="personListContent">
                                {Object.keys(groups).map(groupName => (
                                    <div key={groupName} className="list-group">
                                        <div className="group-header py-3 px-8 tracking-wider">{groupName.toUpperCase()}</div>
                                        {groups[groupName].map((item, idx) => (
                                            <div
                                                key={item.mobile}
                                                className={`list-item contact-list-grid py-4 px-8 transition-all duration-200 ${isSelected(item.mobile) ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="item-check"
                                                    checked={isSelected(item.mobile)}
                                                    onChange={() => toggleSelect(item.mobile)}
                                                />
                                                <div className="col-identity">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`avatar-circle avatar-${(idx % 5) + 1} w-[38px] h-[38px] text-[0.85rem]`}>
                                                            {getInitials(item.name)}
                                                        </div>
                                                        <div>
                                                            <div className="font-extrabold text-slate-900 text-[0.95rem]">{item.name}</div>
                                                            <div className="text-xs font-bold text-slate-600 mt-0.5">{item.mobile}</div>
                                                            {item.email && (
                                                                <div className="text-[0.7rem] text-purple-700 font-semibold mt-0.5">
                                                                    <i className="fas fa-envelope mr-1 text-[0.65rem]"></i>
                                                                    {item.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="col-address">
                                                    <div className="flex items-start gap-2.5">
                                                        <i className="fas fa-map-marker-alt text-red-500 text-xs mt-1"></i>
                                                        <div className="address-clamp text-xs text-slate-600 font-medium leading-relaxed">
                                                            {item.address || 'Address not listed'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="col-classification">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="prof-badge text-[0.6rem] py-0.5 px-2.5 font-extrabold">
                                                            {item.professional.toUpperCase()}
                                                        </span>
                                                        <div className="text-sm font-bold text-slate-900">{item.designation}</div>
                                                        <div className="text-[0.7rem] text-slate-600 font-semibold">
                                                            <i className="fas fa-building mr-1 text-[0.65rem]"></i>
                                                            {item.company}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Source & Tags Column */}
                                                <div className="col-source-tags">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className="text-[0.65rem] py-0.5 px-2 font-bold rounded bg-purple-50 text-purple-800 inline-block w-fit">
                                                            <i className="fas fa-tag mr-0.5 text-[0.6rem]"></i>
                                                            {item.source}
                                                        </span>
                                                        {item.tags && item.tags !== '-' && (
                                                            <div className="text-[0.7rem] text-slate-600 font-semibold">
                                                                {item.tags}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* CRM Linkage Column */}
                                                <div className="col-crm-linkage">
                                                    {item.crmLinks && Object.keys(item.crmLinks).length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.crmLinks.leads && (
                                                                <span className="text-[0.65rem] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                                                                    <i className="fas fa-user-plus mr-0.5 text-[0.6rem]"></i>
                                                                    Leads ({item.crmLinks.leads})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.deals && (
                                                                <span className="text-[0.65rem] px-1.5 py-0.5 bg-green-100 text-green-800 rounded font-bold">
                                                                    <i className="fas fa-handshake mr-0.5 text-[0.6rem]"></i>
                                                                    Deals ({item.crmLinks.deals})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.property && (
                                                                <span className="text-[0.65rem] px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded font-bold">
                                                                    <i className="fas fa-building mr-0.5 text-[0.6rem]"></i>
                                                                    Property ({item.crmLinks.property})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.booking && (
                                                                <span className="text-[0.65rem] px-1.5 py-0.5 bg-pink-100 text-pink-800 rounded font-bold">
                                                                    <i className="fas fa-calendar-check mr-0.5 text-[0.6rem]"></i>
                                                                    Booking ({item.crmLinks.booking})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.project && (
                                                                <span className="text-[0.65rem] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded font-bold">
                                                                    <i className="fas fa-project-diagram mr-0.5 text-[0.6rem]"></i>
                                                                    Project ({item.crmLinks.project})
                                                                </span>
                                                            )}
                                                            {item.crmLinks.activities && (
                                                                <span className="text-[0.65rem] px-1.5 py-0.5 bg-orange-100 text-orange-800 rounded font-bold">
                                                                    <i className="fas fa-tasks mr-0.5 text-[0.6rem]"></i>
                                                                    Activities ({item.crmLinks.activities})
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="text-[0.7rem] text-slate-300 italic">-</div>
                                                    )}
                                                </div>

                                                <div className="col-interaction">
                                                    <div className="leading-relaxed">
                                                        <div className="text-sm font-bold text-slate-800">{item.lastComm}</div>
                                                        <div className="text-[0.7rem] text-slate-400 font-semibold">Active: {item.actionable}</div>
                                                        <div className="flex gap-2.5 mt-1.5">
                                                            <i className="fas fa-phone-alt text-green-600 text-xs scale-x-[-1] rotate-[5deg]"></i>
                                                            <i className="fab fa-whatsapp text-[#25D366] text-xs"></i>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="col-assignment">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="profile-circle w-7 h-7 text-[0.65rem] bg-slate-100 text-slate-600">
                                                            {item.ownership.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-extrabold text-slate-900">{item.ownership}</div>
                                                            <div className="text-[0.65rem] text-slate-400 font-bold">Added {item.addOnDate}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        /* Card View - Professional Contact Cards (Compact) */
                        <div className="p-6">
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                                {paginatedContacts.map((item, idx) => (
                                    <div
                                        key={item.mobile}
                                        className={`rounded-[10px] overflow-hidden transition-all duration-200 ${isSelected(item.mobile)
                                            ? 'bg-blue-50 border-2 border-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.15)]'
                                            : 'bg-white border-2 border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.15)] hover:-translate-y-0.5'
                                            }`}
                                    >
                                        {/* Card Header with Avatar & Checkbox */}
                                        <div className={`p-3 border-b border-gray-200 flex items-center justify-between ${isSelected(item.mobile) ? 'bg-blue-100' : 'bg-gray-50'
                                            }`}>
                                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                <div className={`avatar-circle avatar-${(idx % 5) + 1} w-10 h-10 text-sm shrink-0`}>
                                                    {getInitials(item.name)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-extrabold text-gray-900 text-sm mb-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                                                        {item.name}
                                                    </div>
                                                    <div className="text-[0.7rem] text-gray-600 font-semibold">
                                                        <i className="fas fa-phone-alt mr-1 text-[0.65rem]"></i>
                                                        {item.mobile}
                                                    </div>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={isSelected(item.mobile)}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelect(item.mobile);
                                                }}
                                                className="w-4 h-4 cursor-pointer shrink-0"
                                            />
                                        </div>

                                        {/* Card Body - Contact Details */}
                                        <div className="p-3">
                                            {/* Email */}
                                            {item.email && (
                                                <div className="mb-2.5 pb-2.5 border-b border-gray-100 flex items-center gap-1.5">
                                                    <i className="fas fa-envelope text-purple-600 text-xs w-3.5 shrink-0"></i>
                                                    <span className="text-[0.7rem] text-gray-600 font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                                                        {item.email}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Professional Details Section */}
                                            <div className="mb-2.5 pb-2.5 border-b border-gray-100">
                                                <div className="text-[0.65rem] font-extrabold text-gray-400 mb-1 uppercase tracking-wide">
                                                    Professional
                                                </div>
                                                <span className="prof-badge text-[0.6rem] py-0.5 px-1.5 font-extrabold mb-1 inline-block">
                                                    {item.professional.toUpperCase()}
                                                </span>
                                                <div className="text-xs font-bold text-gray-900 mb-0.5">
                                                    {item.designation}
                                                </div>
                                                <div className="text-[0.7rem] text-gray-600 font-semibold flex items-center gap-1">
                                                    <i className="fas fa-building text-[0.65rem]"></i>
                                                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.company}</span>
                                                </div>
                                            </div>

                                            {/* Address Section */}
                                            <div className="mb-2.5 pb-2.5 border-b border-gray-100">
                                                <div className="text-[0.65rem] font-extrabold text-gray-400 mb-1 uppercase tracking-wide">
                                                    Address
                                                </div>
                                                <div className="flex items-start gap-1.5">
                                                    <i className="fas fa-map-marker-alt text-red-500 text-xs mt-0.5"></i>
                                                    <div className="text-[0.7rem] text-gray-600 font-semibold leading-snug line-clamp-2">
                                                        {item.address || 'Address not listed'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Source & Tags Section */}
                                            <div className="mb-2.5 pb-2.5 border-b border-gray-100">
                                                <div className="text-[0.65rem] font-extrabold text-gray-400 mb-1 uppercase tracking-wide">
                                                    Source
                                                </div>
                                                <span className="inline-flex items-center gap-0.5 py-0.5 px-1.5 rounded text-[0.65rem] font-bold bg-purple-50 text-purple-800">
                                                    <i className="fas fa-tag text-[0.6rem]"></i>
                                                    {item.source}
                                                </span>
                                            </div>

                                            {/* CRM Linkage Section */}
                                            {item.crmLinks && Object.keys(item.crmLinks).length > 0 && (
                                                <div className="mb-2.5 pb-2.5 border-b border-gray-100">
                                                    <div className="text-[0.65rem] font-extrabold text-gray-400 mb-1 uppercase tracking-wide">
                                                        CRM Activity
                                                    </div>
                                                    <div className="flex flex-wrap gap-0.5">
                                                        {item.crmLinks.leads && (
                                                            <span className="text-[0.6rem] px-1 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                                                                <i className="fas fa-user-plus mr-0.5 text-[0.55rem]"></i>
                                                                {item.crmLinks.leads}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.deals && (
                                                            <span className="text-[0.6rem] px-1 py-0.5 bg-green-100 text-green-800 rounded font-bold">
                                                                <i className="fas fa-handshake mr-0.5 text-[0.55rem]"></i>
                                                                {item.crmLinks.deals}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.property && (
                                                            <span className="text-[0.6rem] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded font-bold">
                                                                <i className="fas fa-building mr-0.5 text-[0.55rem]"></i>
                                                                {item.crmLinks.property}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.booking && (
                                                            <span className="text-[0.6rem] px-1 py-0.5 bg-pink-100 text-pink-800 rounded font-bold">
                                                                <i className="fas fa-calendar-check mr-0.5 text-[0.55rem]"></i>
                                                                {item.crmLinks.booking}
                                                            </span>
                                                        )}
                                                        {item.crmLinks.activities && (
                                                            <span className="text-[0.6rem] px-1 py-0.5 bg-orange-100 text-orange-800 rounded font-bold">
                                                                <i className="fas fa-tasks mr-0.5 text-[0.55rem]"></i>
                                                                {item.crmLinks.activities}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Last Interaction Section */}
                                            <div className="mb-2.5 pb-2.5 border-b border-gray-100">
                                                <div className="text-[0.65rem] font-extrabold text-gray-400 mb-1 uppercase tracking-wide">
                                                    Last Interaction
                                                </div>
                                                <div className="text-xs font-bold text-gray-900 mb-0.5">
                                                    {item.lastComm}
                                                </div>
                                                <div className="text-[0.65rem] text-gray-600 font-semibold mb-1">
                                                    Active: {item.actionable}
                                                </div>
                                                <div className="flex gap-2.5">
                                                    <i className="fas fa-phone-alt text-green-600 text-xs"></i>
                                                    <i className="fab fa-whatsapp text-[#25d366] text-xs"></i>
                                                </div>
                                            </div>

                                            {/* Assigned To Section */}
                                            <div>
                                                <div className="text-[0.65rem] font-extrabold text-gray-400 mb-1 uppercase tracking-wide">
                                                    Assigned To
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[0.7rem] font-bold shrink-0">
                                                        {item.ownership.charAt(0)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-extrabold text-gray-900 overflow-hidden text-ellipsis whitespace-nowrap">
                                                            {item.ownership}
                                                        </div>
                                                        <div className="text-[0.6rem] text-gray-400 font-semibold">
                                                            Added {item.addOnDate}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <footer className="summary-footer h-[60px] px-8">
                <div className="summary-label bg-slate-700 text-white py-1 px-3 rounded-md text-[0.7rem]">SUMMARY</div>
                <div className="flex gap-5">
                    <div className="stat-pill">TOTAL CONTACTS <strong>{totalCount}</strong></div>
                    <div className="stat-pill">CUSTOMERS <strong>{contactData.filter(c => c.category === 'Customer').length}</strong></div>
                    <div className="stat-pill">PROSPECTS <strong>{contactData.filter(c => c.category === 'Prospect').length}</strong></div>
                    <div className="stat-pill text-[var(--primary-color)]">REAL ESTATE AGENTS <strong>{contactData.filter(c => c.category === 'Real Estate Agent').length}</strong></div>
                </div>
            </footer>
        </section>
    );
}

export default PersonView;
