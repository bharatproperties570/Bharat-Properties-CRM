import React from 'react';
import { useTheme } from '../context/ThemeContext';

const ContactPersonalSection = React.memo(function ContactPersonalSection({
  formData,
  handleInputChange,
  customSelectStyle,
  customSelectStyleDisabled,
  social_plateform,
  setsocial_plateform,
  setLoading,
  allCompanies,
  companyList,
  setCompanyList,
  showCompanyDropdown,
  setShowCompanyDropdown,
  companySearch,
  setCompanySearch,
  edu_level,
  setedu_level,
  degree,
  setdegree,
  income_source,
  setincome_source,
  loan_type,
  setloan_type,
  bank,
  setbank,
  renderValue,
  showOnlyRequired,
  fetchLookup,
  professionCategories,
  setProfessionCategories,
  professionSubCategories,
  designation,
}) {
  const { isDark } = useTheme();

  const selectedCompanyObj = allCompanies.find((c) => c.name === formData.company);
  const branchOffices = selectedCompanyObj?.addresses?.["Branch Office"] || [];
  const siteOffices = selectedCompanyObj?.addresses?.["Site Office"] || [];
  const hasMultipleOffices = Array.isArray(branchOffices) && (branchOffices.length > 0 || siteOffices.length > 0);

  const officeOptions = [
    ...(Array.isArray(branchOffices)
      ? branchOffices.map((b) => ({
        label: b.branchName || "Branch",
        value: b.branchName || "Branch",
      }))
      : []),
    ...(Array.isArray(siteOffices)
      ? siteOffices.map((s) => ({
        label: s.branchName || "Site",
        value: s.branchName || "Site",
      }))
      : []),
  ];

  const cardStyle = {
    background: isDark ? "rgba(255, 255, 255, 0.03)" : "#fff",
    padding: "16px 18px",
    borderRadius: "12px",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
  };

  const headerStyle = {
    margin: "0 0 14px 0",
    fontSize: "0.85rem",
    fontWeight: 800,
    color: isDark ? "var(--text-main)" : "#0f172a",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingBottom: "10px",
    borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid #f1f5f9"
  };

  const subHeaderStyle = {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: isDark ? "var(--text-main)" : "#475569",
    margin: "14px 0 10px 0",
    paddingTop: "12px",
    borderTop: isDark ? "1px dashed rgba(255, 255, 255, 0.08)" : "1px dashed #e2e8f0",
    display: "flex",
    alignItems: "center",
    gap: "6px"
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: isDark ? "var(--text-muted)" : "#64748b",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.03em"
  };

  const inputStyle = {
    width: "100%",
    padding: "7px 11px",
    borderRadius: "8px",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1",
    background: isDark ? "#1e293b" : "#fff",
    color: isDark ? "var(--text-main)" : "#1e293b",
    fontSize: "0.82rem",
    outline: "none",
    boxSizing: "border-box"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Personal Basic Info */}
      <div style={cardStyle}>
        <h3 style={headerStyle}>
          <i className="fas fa-user-clock" style={{ color: "#ec4899" }}></i>
          Bio Details
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          <div>
            <label style={labelStyle}>Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => handleInputChange("gender", e.target.value)}
              style={customSelectStyle}
            >
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Marital Status</label>
            <select
              value={formData.maritalStatus}
              onChange={(e) => handleInputChange("maritalStatus", e.target.value)}
              style={customSelectStyle}
            >
              <option value="">Select Status</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Divorced">Divorced</option>
              <option value="Widowed">Widowed</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input
              type="date"
              value={formData.birthDate}
              onChange={(e) => handleInputChange("birthDate", e.target.value)}
              style={inputStyle}
            />
          </div>
          {formData.maritalStatus === "Married" && (
            <div>
              <label style={labelStyle}>Anniversary Date</label>
              <input
                type="date"
                value={formData.anniversaryDate}
                onChange={(e) => handleInputChange("anniversaryDate", e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
        </div>

        {/* Social Presence */}
        <div style={subHeaderStyle}>
          <i className="fas fa-hashtag" style={{ color: "#ec4899" }}></i>
          Social Presence
        </div>
        {formData.socialMedia.map((social, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(140px, 160px) 1fr 34px",
              gap: "10px",
              marginBottom: "8px",
              alignItems: "center"
            }}
          >
            <select
              value={social.platform}
              onFocus={async () => {
                if (social_plateform.length === 0) {
                  setLoading("social-plateform");
                  const data = await fetchLookup("Social Plateform");
                  setsocial_plateform(data);
                  setLoading("");
                }
              }}
              onChange={(e) => {
                const newSocial = [...formData.socialMedia];
                newSocial[index].platform = e.target.value;
                handleInputChange("socialMedia", newSocial);
              }}
              style={customSelectStyle}
            >
              <option value="">Select Platform</option>
              {social_plateform.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.lookup_value}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Profile URL / Handle"
              value={social.url}
              onChange={(e) => {
                const newSocial = [...formData.socialMedia];
                newSocial[index].url = e.target.value;
                handleInputChange("socialMedia", newSocial);
              }}
              style={inputStyle}
            />
            <button
              type="button"
              onClick={() => {
                if (index === 0)
                  handleInputChange("socialMedia", [
                    ...formData.socialMedia,
                    { platform: null, url: "" },
                  ]);
                else {
                  const newSocial = formData.socialMedia.filter(
                    (_, i) => i !== index,
                  );
                  handleInputChange("socialMedia", newSocial);
                }
              }}
              style={{
                height: "32px",
                width: "34px",
                borderRadius: "8px",
                border: "none",
                background: index === 0 
                  ? (isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff") 
                  : (isDark ? "rgba(239, 68, 68, 0.2)" : "#fef2f2"),
                color: index === 0 ? "#3b82f6" : "#ef4444",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.8rem"
              }}
            >
              <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
            </button>
          </div>
        ))}
      </div>

      {/* Professional Details Card */}
      {!showOnlyRequired && (
        <div style={cardStyle}>
          <h3 style={headerStyle}>
            <i className="fas fa-briefcase" style={{ color: "#0ea5e9" }}></i>
            Professional Details
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            <div>
              <label style={labelStyle}>Profession Category</label>
              <select
                value={formData.professionCategory}
                onFocus={async () => {
                  if (professionCategories.length === 0) {
                    setLoading("category");
                    const data = await fetchLookup("ProfessionalCategory");
                    setProfessionCategories(data);
                    setLoading("");
                  }
                }}
                onChange={(e) => {
                  handleInputChange("professionCategory", e.target.value);
                  handleInputChange("professionSubCategory", "");
                  handleInputChange("designation", "");
                }}
                style={customSelectStyle}
              >
                <option value="">Select Category</option>
                {professionCategories.map((cat) => (
                  <option key={typeof cat === 'object' ? (cat._id || cat.id) : cat} value={typeof cat === 'object' ? (cat._id || cat.id) : cat}>
                    {renderValue(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Sub-Category</label>
              <select
                value={formData.professionSubCategory}
                onChange={(e) => {
                  handleInputChange("professionSubCategory", e.target.value);
                  handleInputChange("designation", "");
                }}
                style={
                  !formData.professionCategory
                    ? customSelectStyleDisabled
                    : customSelectStyle
                }
                disabled={!formData.professionCategory}
              >
                <option value="">Select Sub-Category</option>
                {formData.professionCategory &&
                  professionSubCategories.map((sc) => (
                    <option key={typeof sc === 'object' ? (sc._id || sc.id) : sc} value={typeof sc === 'object' ? (sc._id || sc.id) : sc}>
                      {renderValue(sc)}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Designation</label>
              <select
                value={formData.designation}
                onChange={(e) => handleInputChange("designation", e.target.value)}
                style={
                  !formData.professionSubCategory
                    ? customSelectStyleDisabled
                    : customSelectStyle
                }
                disabled={!formData.professionSubCategory}
              >
                <option value="">Select Designation</option>
                {formData.professionCategory &&
                  designation.map((d) => (
                    <option key={typeof d === 'object' ? (d._id || d.id) : d} value={typeof d === 'object' ? (d._id || d.id) : d}>
                      {renderValue(d)}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ position: "relative" }}>
              <label style={labelStyle}>Company</label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleInputChange("company", val);
                    setCompanySearch(val);
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => {
                    setCompanySearch(formData.company);
                    setShowCompanyDropdown(true);
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowCompanyDropdown(false), 200)
                  }
                  placeholder="Select or Type New Company"
                  style={inputStyle}
                  autoComplete="off"
                />
                {showCompanyDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      background: isDark ? "#1e293b" : "#fff",
                      border: isDark ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1",
                      borderRadius: "8px",
                      marginTop: "4px",
                      zIndex: 50,
                      maxHeight: "180px",
                      overflowY: "auto",
                      boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                    }}
                  >
                    {(() => {
                      const filtered = companyList.filter((c) =>
                        c.toLowerCase().includes(companySearch.toLowerCase()),
                      );
                      const showAddNew =
                        companySearch &&
                        !companyList.some(
                          (c) => c.toLowerCase() === companySearch.toLowerCase(),
                        );

                      return (
                        <>
                          {filtered.map((comp) => (
                            <div
                              key={comp}
                              onMouseDown={() => {
                                handleInputChange("company", comp);
                                handleInputChange("workOffice", "");
                                setShowCompanyDropdown(false);
                              }}
                              style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                color: isDark ? "var(--text-main)" : "#334155",
                              }}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              {comp}
                            </div>
                          ))}
                          {showAddNew && (
                            <div
                              onMouseDown={() => {
                                const newCompany = companySearch;
                                setCompanyList((prev) => [...prev, newCompany]);
                                handleInputChange("company", newCompany);
                                handleInputChange("workOffice", "");
                                setShowCompanyDropdown(false);
                              }}
                              style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                fontSize: "0.82rem",
                                color: "#2563eb",
                                borderTop: isDark ? "1px dashed rgba(255, 255, 255, 0.1)" : "1px dashed #e2e8f0",
                                background: isDark ? "rgba(37, 99, 235, 0.1)" : "#eff6ff",
                              }}
                            >
                              + Add "{companySearch}"
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {hasMultipleOffices && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#10b981",
                    marginBottom: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    textTransform: "uppercase"
                  }}
                >
                  <i className="fas fa-map-marker-alt"></i> Associated Office / Branch
                </label>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  {officeOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleInputChange("workOffice", opt.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: `1.5px solid ${formData.workOffice === opt.value ? "#10b981" : (isDark ? "rgba(255, 255, 255, 0.15)" : "#e2e8f0")}`,
                        background:
                          formData.workOffice === opt.value
                            ? (isDark ? "rgba(16, 185, 129, 0.2)" : "#ecfdf5")
                            : (isDark ? "transparent" : "#fff"),
                        color:
                          formData.workOffice === opt.value
                            ? "#10b981"
                            : (isDark ? "var(--text-muted)" : "#64748b"),
                        fontSize: "0.78rem",
                        fontWeight: formData.workOffice === opt.value ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {formData.workOffice === opt.value && (
                        <i className="fas fa-check-circle"></i>
                      )}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Education & Financial Details Card */}
      {!showOnlyRequired && (
        <div style={cardStyle}>
          <h3 style={headerStyle}>
            <i className="fas fa-coins" style={{ color: "#eab308" }}></i>
            Education & Financial Details
          </h3>

          <div style={{ ...subHeaderStyle, marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <i className="fas fa-graduation-cap" style={{ color: "#3b82f6" }}></i>
            Education History
          </div>
          {formData.educations.map((edu, index) => {
            return (
              <div
                key={index}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 1fr) 1fr 1.5fr 34px",
                  gap: "10px",
                  marginBottom: "8px",
                  alignItems: "center",
                }}
              >
                <div>
                  <select
                    value={edu.education}
                    onFocus={async () => {
                      if (edu_level.length === 0) {
                        setLoading("edu_level");
                        const data = await fetchLookup("Education-Level");
                        setedu_level(data);
                        setLoading("");
                      }
                    }}
                    onChange={(e) => {
                      const newEdu = [...formData.educations];
                      newEdu[index].education = e.target.value;
                      newEdu[index].degree = "";
                      handleInputChange("educations", newEdu);
                    }}
                    style={customSelectStyle}
                  >
                    <option value="">Select Level</option>
                    {edu_level.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.lookup_value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={edu.degree}
                    onFocus={async () => {
                      if (edu.education) {
                        setLoading("degree");
                        const data = await fetchLookup("Degree", edu.education);
                        setdegree(data);
                        setLoading("");
                      }
                    }}
                    onChange={(e) => {
                      const newEdu = [...formData.educations];
                      newEdu[index].degree = e.target.value;
                      handleInputChange("educations", newEdu);
                    }}
                    disabled={!edu.education}
                    style={
                      !edu.education
                        ? customSelectStyleDisabled
                        : customSelectStyle
                    }
                  >
                    <option value="">Select Degree</option>
                    {degree.map((deg) => (
                      <option key={deg._id} value={deg._id}>
                        {deg.lookup_value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="School / University"
                    value={edu.school}
                    onChange={(e) => {
                      const newEdu = [...formData.educations];
                      newEdu[index].school = e.target.value;
                      handleInputChange("educations", newEdu);
                    }}
                    style={inputStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (index === 0)
                      handleInputChange("educations", [
                        ...formData.educations,
                        { education: null, degree: null, school: "" },
                      ]);
                    else {
                      const newEdu = formData.educations.filter(
                        (_, i) => i !== index,
                      );
                      handleInputChange("educations", newEdu);
                    }
                  }}
                  style={{
                    height: "32px",
                    width: "34px",
                    borderRadius: "8px",
                    border: "none",
                    background: index === 0 
                      ? (isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff") 
                      : (isDark ? "rgba(239, 68, 68, 0.2)" : "#fef2f2"),
                    color: index === 0 ? "#3b82f6" : "#ef4444",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.8rem"
                  }}
                >
                  <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
                </button>
              </div>
            );
          })}

          <div style={subHeaderStyle}>
            <i className="fas fa-hand-holding-usd" style={{ color: "#10b981" }}></i>
            Annual Income Source
          </div>
          {formData.incomes.map((inc, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 34px",
                gap: "10px",
                marginBottom: "8px",
                alignItems: "center"
              }}
            >
              <select
                value={inc.incomeType}
                onFocus={async () => {
                  if (income_source.length === 0) {
                    setLoading("incomeSource");
                    const data = await fetchLookup("Income-Source");
                    setincome_source(data);
                    setLoading("");
                  }
                }}
                onChange={(e) => {
                  const newInc = [...formData.incomes];
                  newInc[index].incomeType = e.target.value;
                  handleInputChange("incomes", newInc);
                }}
                style={customSelectStyle}
              >
                <option value="">Select Source</option>
                {income_source.map((source) => (
                  <option key={source._id} value={source._id}>
                    {source.lookup_value}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Amount (₹)"
                value={inc.amount}
                onChange={(e) => {
                  const newInc = [...formData.incomes];
                  newInc[index].amount = e.target.value;
                  handleInputChange("incomes", newInc);
                }}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => {
                  if (index === 0)
                    handleInputChange("incomes", [
                      ...formData.incomes,
                      { incomeType: null, amount: "" },
                    ]);
                  else {
                    const newInc = formData.incomes.filter(
                      (_, i) => i !== index,
                    );
                    handleInputChange("incomes", newInc);
                  }
                }}
                style={{
                  height: "32px",
                  width: "34px",
                  borderRadius: "8px",
                  border: "none",
                  background: index === 0 
                    ? (isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff") 
                    : (isDark ? "rgba(239, 68, 68, 0.2)" : "#fef2f2"),
                  color: index === 0 ? "#3b82f6" : "#ef4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem"
                }}
              >
                <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
              </button>
            </div>
          ))}

          <div style={subHeaderStyle}>
            <i className="fas fa-file-invoice-dollar" style={{ color: "#f59e0b" }}></i>
            Existing Loans
          </div>
          {formData.loans.map((loan, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 34px",
                gap: "10px",
                marginBottom: "8px",
                alignItems: "center"
              }}
            >
              <select
                value={loan.loanType}
                onFocus={async () => {
                  if (loan_type.length === 0) {
                    setLoading("loan-type");
                    const data = await fetchLookup("Loan Type");
                    setloan_type(data);
                    setLoading("");
                  }
                }}
                onChange={(e) => {
                  const newLoans = [...formData.loans];
                  newLoans[index].loanType = e.target.value;
                  handleInputChange("loans", newLoans);
                }}
                style={customSelectStyle}
              >
                <option value="">Loan Type</option>
                {loan_type.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.lookup_value}
                  </option>
                ))}
              </select>
              <select
                value={loan.bank}
                onFocus={async () => {
                  if (bank.length === 0) {
                    setLoading("bank");
                    const data = await fetchLookup("Bank");
                    setbank(data);
                    setLoading("");
                  }
                }}
                onChange={(e) => {
                  const newLoans = [...formData.loans];
                  newLoans[index].bank = e.target.value;
                  handleInputChange("loans", newLoans);
                }}
                style={customSelectStyle}
              >
                <option value="">Select Bank</option>
                {bank.map((bank) => (
                  <option key={bank._id} value={bank._id}>
                    {bank.lookup_value}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Loan Amount (₹)"
                value={loan.loanAmount}
                onChange={(e) => {
                  const newLoans = [...formData.loans];
                  newLoans[index].loanAmount = e.target.value;
                  handleInputChange("loans", newLoans);
                }}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => {
                  if (index === 0)
                    handleInputChange("loans", [
                      ...formData.loans,
                      { loanType: null, bank: null, loanAmount: "" },
                    ]);
                  else {
                    const newLoans = formData.loans.filter(
                      (_, i) => i !== index,
                    );
                    handleInputChange("loans", newLoans);
                  }
                }}
                style={{
                  height: "32px",
                  width: "34px",
                  borderRadius: "8px",
                  border: "none",
                  background: index === 0 
                    ? (isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff") 
                    : (isDark ? "rgba(239, 68, 68, 0.2)" : "#fef2f2"),
                  color: index === 0 ? "#3b82f6" : "#ef4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem"
                }}
              >
                <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Remarks */}
      <div style={cardStyle}>
        <h3 style={headerStyle}>
          <i className="fas fa-sticky-note" style={{ color: "#64748b" }}></i>
          Remarks
        </h3>
        <div>
          <textarea
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            placeholder="Enter any additional remarks about this contact..."
            style={{
              ...inputStyle,
              minHeight: "70px",
              resize: "vertical",
              fontFamily: "inherit"
            }}
          />
        </div>
      </div>
    </div>
  );
});

ContactPersonalSection.displayName = "ContactPersonalSection";
export default ContactPersonalSection;
