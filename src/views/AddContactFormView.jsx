import React, { useState } from 'react';

function AddContactFormView() {
    const [currentTab, setCurrentTab] = useState('basic');
    const [showOnlyRequired, setShowOnlyRequired] = useState(false);
    const [formData, setFormData] = useState({
        // Basic Details
        title: '',
        firstName: '',
        surname: '',
        countryCode: '+91',
        phones: [{ number: '', type: 'Personal' }],
        emails: [{ address: '', type: 'Personal' }],
        tags: '',
        description: '',
        // Professional
        professionCategory: '',
        professionSubCategory: '',
        designation: '',
        company: '',
        // System
        source: '',
        team: '',
        owner: '',
        visibleTo: '',
        // Personal Details
        fatherHusbandName: '',
        hNo: '',
        area: '',
        location: '',
        city: '',
        pinCode: '',
        state: '',
        country: '',
        gender: '',
        maritalStatus: '',
        birthDate: '',
        anniversaryDate: '',
        education: '',
        degree: '',
        school: '',
        loanType: '',
        bank: '',
        loanAmount: '',
        socialPlatform: '',
        socialUrl: '',
        incomeRange: '',
        documentNo: '',
        documentName: ''
    });

    const getCurrentTimestamp = () => {
        const now = new Date();
        return now.toString().substring(0, 33);
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePhoneChange = (index, field, value) => {
        const newPhones = [...formData.phones];
        newPhones[index][field] = value;
        setFormData(prev => ({ ...prev, phones: newPhones }));
    };

    const addPhone = () => {
        setFormData(prev => ({
            ...prev,
            phones: [...prev.phones, { number: '', type: 'Personal' }]
        }));
    };

    const handleEmailChange = (index, field, value) => {
        const newEmails = [...formData.emails];
        newEmails[index][field] = value;
        setFormData(prev => ({ ...prev, emails: newEmails }));
    };

    const addEmail = () => {
        setFormData(prev => ({
            ...prev,
            emails: [...prev.emails, { address: '', type: 'Personal' }]
        }));
    };

    const handleSubmit = () => {
        if (!formData.firstName || !formData.phones[0].number || !formData.emails[0].address) {
            alert('Please fill required fields: Name, Mobile, Email');
            return;
        }

        alert('Contact added successfully!');
        // Reset form
        setFormData({
            title: '',
            firstName: '',
            surname: '',
            countryCode: '+91',
            phones: [{ number: '', type: 'Personal' }],
            emails: [{ address: '', type: 'Personal' }],
            tags: '',
            description: '',
            professionCategory: '',
            professionSubCategory: '',
            designation: '',
            company: '',
            source: '',
            team: '',
            owner: '',
            visibleTo: '',
            fatherHusbandName: '',
            hNo: '',
            area: '',
            location: '',
            city: '',
            pinCode: '',
            state: '',
            country: '',
            gender: '',
            maritalStatus: '',
            birthDate: '',
            anniversaryDate: '',
            education: '',
            degree: '',
            school: '',
            loanType: '',
            bank: '',
            loanAmount: '',
            socialPlatform: '',
            socialUrl: '',
            incomeRange: '',
            documentNo: '',
            documentName: ''
        });
        setCurrentTab('basic');
    };

    return (
        <section id="formsView" className="view-section active bg-gray-100">
            <div className="min-h-screen py-8 px-4">
                {/* Centered Modal Card */}
                <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-800">Add Contact</h2>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="showRequired"
                                    checked={showOnlyRequired}
                                    onChange={(e) => setShowOnlyRequired(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <label htmlFor="showRequired" className="text-sm text-gray-600">
                                    only show required field
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 px-6">
                        <button
                            onClick={() => setCurrentTab('basic')}
                            className={`px-4 py-3 font-semibold text-sm transition-colors ${currentTab === 'basic'
                                    ? 'text-gray-800 border-b-2 border-gray-800'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Basic Details
                        </button>
                        <button
                            onClick={() => setCurrentTab('personal')}
                            className={`px-4 py-3 font-semibold text-sm transition-colors ${currentTab === 'personal'
                                    ? 'text-green-600 border-b-2 border-green-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Personal Details
                        </button>
                        <div className="flex-1"></div>
                        <div className="py-3 text-xs text-gray-500">
                            {getCurrentTimestamp()}
                        </div>
                    </div>

                    {/* Form Content */}
                    <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
                        {currentTab === 'basic' ? (
                            <div className="space-y-6">
                                {/* Basic Details Section */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Basic Details</h3>

                                    {/* Title, Name, Surname Row */}
                                    <div className="grid grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Title</label>
                                            <select
                                                name="title"
                                                value={formData.title}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--Select Title--</option>
                                                <option value="Mr.">Mr.</option>
                                                <option value="Ms.">Ms.</option>
                                                <option value="Mrs.">Mrs.</option>
                                                <option value="Dr.">Dr.</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">
                                                First Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="firstName"
                                                value={formData.firstName}
                                                onChange={handleInputChange}
                                                placeholder="First name"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Surname</label>
                                            <input
                                                type="text"
                                                name="surname"
                                                value={formData.surname}
                                                onChange={handleInputChange}
                                                placeholder="surname"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>

                                    {/* Mobile Number */}
                                    <div className="mb-4">
                                        <label className="block text-xs text-gray-700 mb-1">
                                            Mobile Number <span className="text-red-500">*</span>
                                        </label>
                                        {formData.phones.map((phone, index) => (
                                            <div key={index} className="flex gap-2 mb-2">
                                                <select
                                                    value={phone.type}
                                                    onChange={(e) => handlePhoneChange(index, 'type', e.target.value)}
                                                    className="px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="Personal">Personal</option>
                                                    <option value="Work">Work</option>
                                                    <option value="Home">Home</option>
                                                </select>
                                                <input
                                                    type="tel"
                                                    value={phone.number}
                                                    onChange={(e) => handlePhoneChange(index, 'number', e.target.value)}
                                                    placeholder="enter phone number"
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                                {index === formData.phones.length - 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={addPhone}
                                                        className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                                    >
                                                        add
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Email Address */}
                                    <div className="mb-4">
                                        <label className="block text-xs text-gray-700 mb-1">
                                            Email Address <span className="text-red-500">*</span>
                                        </label>
                                        {formData.emails.map((email, index) => (
                                            <div key={index} className="flex gap-2 mb-2">
                                                <select
                                                    value={email.type}
                                                    onChange={(e) => handleEmailChange(index, 'type', e.target.value)}
                                                    className="px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="Personal">Personal</option>
                                                    <option value="Work">Work</option>
                                                </select>
                                                <input
                                                    type="email"
                                                    value={email.address}
                                                    onChange={(e) => handleEmailChange(index, 'address', e.target.value)}
                                                    placeholder="enter email id"
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                                {index === formData.emails.length - 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={addEmail}
                                                        className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                                    >
                                                        add
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Tags */}
                                    <div className="mb-4">
                                        <label className="block text-xs text-gray-700 mb-1">Tags</label>
                                        <input
                                            type="text"
                                            name="tags"
                                            value={formData.tags}
                                            onChange={handleInputChange}
                                            placeholder="enter tags (comma separated)"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                        />
                                    </div>

                                    {/* Description */}
                                    <div className="mb-4">
                                        <label className="block text-xs text-gray-700 mb-1">Description</label>
                                        <textarea
                                            name="description"
                                            value={formData.description}
                                            onChange={handleInputChange}
                                            rows="3"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                        ></textarea>
                                    </div>
                                </div>

                                {/* Professional Details Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Professional Details</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Profession Category</label>
                                            <select
                                                name="professionCategory"
                                                value={formData.professionCategory}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--Select profession category--</option>
                                                <option value="Buyer">Buyer</option>
                                                <option value="Seller">Seller</option>
                                                <option value="Investor">Investor</option>
                                                <option value="Channel Partner">Channel Partner</option>
                                                <option value="Broker">Broker</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Profession Sub-Category</label>
                                            <select
                                                name="professionSubCategory"
                                                value={formData.professionSubCategory}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--select sub-category--</option>
                                                <option value="Residential">Residential</option>
                                                <option value="Commercial">Commercial</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Designation</label>
                                            <select
                                                name="designation"
                                                value={formData.designation}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--select designation--</option>
                                                <option value="Manager">Manager</option>
                                                <option value="Executive">Executive</option>
                                                <option value="Director">Director</option>
                                                <option value="Owner">Owner</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Company/Organization/Department Name</label>
                                            <input
                                                type="text"
                                                name="company"
                                                value={formData.company}
                                                onChange={handleInputChange}
                                                placeholder="--Select company--"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* System Details Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">System Details</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Sources</label>
                                            <select
                                                name="source"
                                                value={formData.source}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--Select source--</option>
                                                <option value="Website">Website</option>
                                                <option value="Referral">Referral</option>
                                                <option value="Cold Call">Cold Call</option>
                                                <option value="Social Media">Social Media</option>
                                                <option value="Walk-in">Walk-in</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Team</label>
                                            <select
                                                name="team"
                                                value={formData.team}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--Select team--</option>
                                                <option value="Sales">Sales</option>
                                                <option value="Marketing">Marketing</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Owner</label>
                                            <select
                                                name="owner"
                                                value={formData.owner}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--select owner--</option>
                                                <option value="Suraj (Sales)">Suraj (Sales)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Visible to</label>
                                            <select
                                                name="visibleTo"
                                                value={formData.visibleTo}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--select--</option>
                                                <option value="Everyone">Everyone</option>
                                                <option value="Team Only">Team Only</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Personal Details Section */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Personal Details</h3>
                                </div>

                                {/* Address Details Section */}
                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Address Details</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Father/Husband name</label>
                                            <input
                                                type="text"
                                                name="fatherHusbandName"
                                                value={formData.fatherHusbandName}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">H.No</label>
                                                <input
                                                    type="text"
                                                    name="hNo"
                                                    value={formData.hNo}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">Area</label>
                                                <input
                                                    type="text"
                                                    name="area"
                                                    value={formData.area}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">Location</label>
                                                <input
                                                    type="text"
                                                    name="location"
                                                    value={formData.location}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">City</label>
                                                <select
                                                    name="city"
                                                    value={formData.city}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="">---Select city---</option>
                                                    <option value="Chandigarh">Chandigarh</option>
                                                    <option value="Mohali">Mohali</option>
                                                    <option value="Panchkula">Panchkula</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">Pin Code</label>
                                                <input
                                                    type="text"
                                                    name="pinCode"
                                                    value={formData.pinCode}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">State</label>
                                                <select
                                                    name="state"
                                                    value={formData.state}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="">---Select state---</option>
                                                    <option value="Punjab">Punjab</option>
                                                    <option value="Haryana">Haryana</option>
                                                    <option value="Chandigarh">Chandigarh</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-700 mb-1">Country</label>
                                                <select
                                                    name="country"
                                                    value={formData.country}
                                                    onChange={handleInputChange}
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="">---Select country---</option>
                                                    <option value="India">India</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Other Details Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Other Details</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Gender</label>
                                            <select
                                                name="gender"
                                                value={formData.gender}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---Select gender---</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Marital Status</label>
                                            <select
                                                name="maritalStatus"
                                                value={formData.maritalStatus}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---Select your status---</option>
                                                <option value="Single">Single</option>
                                                <option value="Married">Married</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Birth Date</label>
                                            <input
                                                type="date"
                                                name="birthDate"
                                                value={formData.birthDate}
                                                onChange={handleInputChange}
                                                placeholder="d / m / yyyy"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Anniversary Date</label>
                                            <input
                                                type="date"
                                                name="anniversaryDate"
                                                value={formData.anniversaryDate}
                                                onChange={handleInputChange}
                                                placeholder="d / m / yyyy"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Education Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Education</h3>
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Education</label>
                                            <select
                                                name="education"
                                                value={formData.education}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---Choose your education---</option>
                                                <option value="Graduate">Graduate</option>
                                                <option value="Post Graduate">Post Graduate</option>
                                                <option value="Diploma">Diploma</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Degree</label>
                                            <select
                                                name="degree"
                                                value={formData.degree}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---choose degree---</option>
                                                <option value="BA">BA</option>
                                                <option value="BSc">BSc</option>
                                                <option value="BCom">BCom</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-700 mb-1">School/College/University</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                name="school"
                                                value={formData.school}
                                                onChange={handleInputChange}
                                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                            <button
                                                type="button"
                                                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                            >
                                                add
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Loan Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Loan</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Loan</label>
                                            <select
                                                name="loanType"
                                                value={formData.loanType}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">--Select loan type---</option>
                                                <option value="Home Loan">Home Loan</option>
                                                <option value="Personal Loan">Personal Loan</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Bank</label>
                                            <select
                                                name="bank"
                                                value={formData.bank}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---Select bank---</option>
                                                <option value="HDFC">HDFC</option>
                                                <option value="ICICI">ICICI</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Amount</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    name="loanAmount"
                                                    value={formData.loanAmount}
                                                    onChange={handleInputChange}
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                                <button
                                                    type="button"
                                                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                                >
                                                    add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Social Media Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Social Media</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Social Media</label>
                                            <select
                                                name="socialPlatform"
                                                value={formData.socialPlatform}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---select social_media---</option>
                                                <option value="Facebook">Facebook</option>
                                                <option value="LinkedIn">LinkedIn</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Url</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    name="socialUrl"
                                                    value={formData.socialUrl}
                                                    onChange={handleInputChange}
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                                <button
                                                    type="button"
                                                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                                >
                                                    add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Income Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Income</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Income</label>
                                            <select
                                                name="incomeRange"
                                                value={formData.incomeRange}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---select your income---</option>
                                                <option value="< 5L">{"< 5L"}</option>
                                                <option value="5L - 10L">5L - 10L</option>
                                                <option value="> 10L">{"> 10L"}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Amount</label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    name="incomeAmount"
                                                    value={formData.incomeAmount}
                                                    onChange={handleInputChange}
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                                />
                                                <button
                                                    type="button"
                                                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                                >
                                                    add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Document Section */}
                                <div className="border-t pt-6">
                                    <h3 className="text-sm font-bold text-gray-700 mb-4">Document</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Document No</label>
                                            <input
                                                type="text"
                                                name="documentNo"
                                                value={formData.documentNo}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Document Name</label>
                                            <select
                                                name="documentName"
                                                value={formData.documentName}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                            >
                                                <option value="">---select document---</option>
                                                <option value="Aadhaar">Aadhaar</option>
                                                <option value="PAN">PAN</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-700 mb-1">Document Picture</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded text-gray-500 hover:bg-gray-50 text-left"
                                                >
                                                    📷 Upload Image
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                                >
                                                    add
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
                        <div>
                            {currentTab === 'personal' && (
                                <button
                                    onClick={() => setCurrentTab('basic')}
                                    className="px-6 py-2 border border-gray-300 rounded text-sm font-semibold text-gray-700 hover:bg-white"
                                >
                                    Prev
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            {currentTab === 'basic' ? (
                                <button
                                    onClick={() => setCurrentTab('personal')}
                                    className="px-8 py-2 bg-blue-500 text-white rounded text-sm font-semibold hover:bg-blue-600"
                                >
                                    Next
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={handleSubmit}
                                        className="px-6 py-2 border border-red-300 text-red-600 rounded text-sm font-semibold hover:bg-red-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        className="px-8 py-2 bg-blue-500 text-white rounded text-sm font-semibold hover:bg-blue-600"
                                    >
                                        Save
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default AddContactFormView;
