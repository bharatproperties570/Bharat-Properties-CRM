import React, { useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';

const ContactBasicSection = React.memo(function ContactBasicSection({
  formData,
  handleInputChange,
  title,
  setTitle,
  setLoading,
  countrycode,
  setCountrycode,
  mobileTypes,
  emailTypes,
  showOnlyRequired,
  hiddenFields,
  currentAddressType,
  setCurrentAddressType,
  leadMasterFields,
  customSelectStyle,
  customSelectStyleDisabled,
  renderValue,
  AddressDetailsForm,
  fetchLookup,
  teams,
  users,
}) {
  const { isDark } = useTheme();

  const onAddressChange = useCallback((newAddr) => {
    const addrKey = currentAddressType === "permanent" ? "personalAddress" : "correspondenceAddress";
    handleInputChange(addrKey, newAddr);
  }, [currentAddressType, handleInputChange]);

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

  const labelStyle = {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: isDark ? "var(--text-muted)" : "#64748b",
    marginBottom: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.4px"
  };

  const inputStyle = {
    width: "100%",
    padding: "7px 11px",
    borderRadius: "8px",
    border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1",
    fontSize: "0.82rem",
    fontWeight: 500,
    outline: "none",
    color: isDark ? "var(--text-main)" : "#1e293b",
    background: isDark ? "rgba(255, 255, 255, 0.04)" : "#fff"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Identity Card */}
      <div style={cardStyle}>
        <h3 style={headerStyle}>
          <i className="fas fa-id-badge" style={{ color: "#3b82f6", fontSize: "14px" }}></i>
          <span>Identity Details</span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr", gap: "12px" }}>
          {!hiddenFields.includes("title") && (
            <div>
              <label style={labelStyle}>Title</label>
              <select
                value={formData.title}
                onFocus={async () => {
                  if (title.length === 0) {
                    setLoading("title");
                    const data = await fetchLookup("Title");
                    setTitle(data);
                    setLoading("");
                  }
                }}
                onChange={(e) => handleInputChange("title", e.target.value)}
                style={customSelectStyle}
              >
                <option value="">Title</option>
                {title.map((t) => (
                  <option key={typeof t === 'object' ? (t._id || t.id) : t} value={typeof t === 'object' ? (t._id || t.id) : t}>
                    {renderValue(t)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>
              First Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Enter first name"
              autoComplete="off"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input
              type="text"
              value={formData.surname}
              onChange={(e) => handleInputChange("surname", e.target.value)}
              placeholder="Enter last name"
              autoComplete="off"
              style={inputStyle}
            />
          </div>
          {!showOnlyRequired && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Father / Husband Name</label>
              <input
                type="text"
                value={formData.fatherName}
                onChange={(e) => handleInputChange("fatherName", e.target.value)}
                placeholder="Enter father or husband's name"
                style={inputStyle}
              />
            </div>
          )}
        </div>

        {/* Mobile Numbers */}
        <div style={{ marginTop: "16px" }}>
          <label style={labelStyle}>
            Mobile Numbers <span style={{ color: "#ef4444" }}>*</span>
          </label>
          {formData.phones.map((phone, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(90px, 110px) 1fr minmax(90px, 110px) 34px", gap: "8px", marginBottom: "8px" }}>
              <select
                value={formData.countryCode}
                onFocus={async () => {
                  if (countrycode.length === 0) {
                    setLoading("countrycode");
                    const data = await fetchLookup("Country-Code");
                    setCountrycode(data);
                    setLoading("");
                  }
                }}
                onChange={(e) => handleInputChange("countryCode", e.target.value)}
                style={customSelectStyle}
              >
                {countrycode.map((c) => (
                  <option key={typeof c === 'object' ? (c._id || c.id) : c} value={typeof c === 'object' ? (c._id || c.id) : c}>
                    {renderValue(c)}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone.number}
                onChange={(e) => {
                  const newPhones = [...formData.phones];
                  const numericValue = e.target.value.replace(/\D/g, '');
                  newPhones[index].number = numericValue;
                  handleInputChange("phones", newPhones);
                }}
                placeholder="Enter mobile number"
                autoComplete="off"
                style={inputStyle}
              />
              <select
                value={phone.type}
                onChange={(e) => {
                  const newPhones = [...formData.phones];
                  newPhones[index].type = e.target.value;
                  handleInputChange("phones", newPhones);
                }}
                style={customSelectStyle}
              >
                {mobileTypes.map((type, idx) => {
                  const tVal = renderValue(type);
                  return <option key={tVal || idx} value={tVal}>{tVal}</option>;
                })}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (index === 0) handleInputChange("phones", [...formData.phones, { number: "", type: "Personal" }]);
                  else {
                    const newPhones = formData.phones.filter((_, i) => i !== index);
                    handleInputChange("phones", newPhones);
                  }
                }}
                style={{
                  height: "33px",
                  borderRadius: "8px",
                  border: "none",
                  background: index === 0 ? "rgba(59, 130, 246, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: index === 0 ? "#3b82f6" : "#ef4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  transition: "all 0.2s"
                }}
                title={index === 0 ? "Add another mobile" : "Remove"}
              >
                <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
              </button>
            </div>
          ))}
        </div>

        {/* Email Addresses */}
        <div style={{ marginTop: "12px" }}>
          <label style={labelStyle}>Email Addresses</label>
          {formData.emails.map((email, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr minmax(90px, 110px) 34px", gap: "8px", marginBottom: "8px" }}>
              <input
                type="email"
                value={email.address}
                onChange={(e) => {
                  const newEmails = [...formData.emails];
                  newEmails[index].address = e.target.value;
                  handleInputChange("emails", newEmails);
                }}
                placeholder="Enter email address"
                autoComplete="off"
                style={inputStyle}
              />
              <select
                value={email.type}
                onChange={(e) => {
                  const newEmails = [...formData.emails];
                  newEmails[index].type = e.target.value;
                  handleInputChange("emails", newEmails);
                }}
                style={customSelectStyle}
              >
                {emailTypes.map((type, idx) => {
                  const tVal = renderValue(type);
                  return <option key={tVal || idx} value={tVal}>{tVal}</option>;
                })}
              </select>
              <button
                type="button"
                onClick={() => {
                  if (index === 0) handleInputChange("emails", [...formData.emails, { address: "", type: "Personal" }]);
                  else {
                    const newEmails = formData.emails.filter((_, i) => i !== index);
                    handleInputChange("emails", newEmails);
                  }
                }}
                style={{
                  height: "33px",
                  borderRadius: "8px",
                  border: "none",
                  background: index === 0 ? "rgba(59, 130, 246, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: index === 0 ? "#3b82f6" : "#ef4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  transition: "all 0.2s"
                }}
                title={index === 0 ? "Add another email" : "Remove"}
              >
                <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Address Details */}
      {!showOnlyRequired && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)"
              }}>
                <i className="fas fa-map-marker-alt" style={{ fontSize: "13px" }}></i>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 800, color: isDark ? "var(--text-main)" : "#0f172a" }}>
                  Address Details
                </h3>
                <span style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: "6px",
                  background: currentAddressType === "permanent" ? (isDark ? "rgba(99, 102, 241, 0.2)" : "#ede9fe") : (isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff"),
                  color: currentAddressType === "permanent" ? (isDark ? "#a5b4fc" : "#6d28d9") : (isDark ? "#93c5fd" : "#1d4ed8"),
                  border: currentAddressType === "permanent" ? "1px solid rgba(109, 40, 217, 0.2)" : "1px solid rgba(29, 78, 216, 0.2)",
                  letterSpacing: "0.4px"
                }}>
                  {currentAddressType === "permanent" ? "PERMANENT" : "CORRESPONDENCE"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", background: isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9", borderRadius: "8px", padding: "3px", gap: "2px" }}>
              <button
                type="button"
                onClick={() => setCurrentAddressType("permanent")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: currentAddressType === "permanent" ? "#4f46e5" : "transparent",
                  color: currentAddressType === "permanent" ? "#ffffff" : (isDark ? "var(--text-muted)" : "#64748b"),
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: currentAddressType === "permanent" ? "0 2px 6px rgba(79, 70, 229, 0.3)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                Permanent
              </button>
              <button
                type="button"
                onClick={() => setCurrentAddressType("correspondence")}
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: currentAddressType === "correspondence" ? "#4f46e5" : "transparent",
                  color: currentAddressType === "correspondence" ? "#ffffff" : (isDark ? "var(--text-muted)" : "#64748b"),
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: currentAddressType === "correspondence" ? "0 2px 6px rgba(79, 70, 229, 0.3)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                Correspondence
              </button>
            </div>
          </div>
          {(() => {
            const addrKey = currentAddressType === "permanent" ? "personalAddress" : "correspondenceAddress";
            const addr = formData[addrKey];

            return (
              <AddressDetailsForm
                title=""
                address={addr}
                onChange={onAddressChange}
                hideCard={true}
                hideHeader={true}
              />
            );
          })()}
        </div>
      )}

      {/* Source & Tags Details */}
      {!showOnlyRequired && (
        <div style={cardStyle}>
          <h3 style={headerStyle}>
            <i className="fas fa-bullhorn" style={{ color: "#f59e0b", fontSize: "14px" }}></i>
            <span>Source Details</span>
          </h3>
          <div style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>Tags</label>
            <div style={{
              width: "100%",
              padding: "4px 8px",
              borderRadius: "8px",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid #cbd5e1",
              background: isDark ? "rgba(255, 255, 255, 0.04)" : "#fff",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              alignItems: "center",
              minHeight: "36px"
            }}>
              {formData.tags.map((tag, index) => (
                <div key={index} style={{
                  background: isDark ? "rgba(59, 130, 246, 0.2)" : "#eff6ff",
                  color: isDark ? "#93c5fd" : "#3b82f6",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}>
                  {renderValue(tag)}
                  <span
                    onClick={() => handleInputChange("tags", formData.tags.filter((_, i) => i !== index))}
                    style={{ cursor: "pointer", fontSize: "0.85rem", lineHeight: "0.8" }}
                  >&times;</span>
                </div>
              ))}
              <input
                type="text"
                placeholder={formData.tags.length === 0 ? "Add tags (Press Enter)" : ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.target.value.trim()) {
                    e.preventDefault();
                    if (!formData.tags.includes(e.target.value.trim())) {
                      handleInputChange("tags", [...formData.tags, e.target.value.trim()]);
                    }
                    e.target.value = "";
                  } else if (e.key === "Backspace" && !e.target.value && formData.tags.length > 0) {
                    handleInputChange("tags", formData.tags.slice(0, -1));
                  }
                }}
                style={{
                  border: "none",
                  outline: "none",
                  fontSize: "0.82rem",
                  color: isDark ? "var(--text-main)" : "#1e293b",
                  background: "transparent",
                  flex: 1,
                  minWidth: "100px"
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            {!hiddenFields.includes("source") && (
              <div>
                <label style={labelStyle}>Source</label>
                <select
                  value={formData.source}
                  onChange={(e) => {
                    const selectedSourceName = e.target.value;
                    handleInputChange("source", selectedSourceName);
                    handleInputChange("subSource", "");
                    const allCampaigns = leadMasterFields?.campaigns || [];
                    let foundCampaign = null;
                    for (const camp of allCampaigns) {
                      if (camp.sources?.some(s => renderValue(s?.name ?? s) === selectedSourceName)) {
                        foundCampaign = renderValue(camp?.name ?? camp);
                        break;
                      }
                    }
                    if (foundCampaign) handleInputChange("campaign", foundCampaign);
                  }}
                  style={customSelectStyle}
                >
                  <option value="">Select Source</option>
                  {(() => {
                    const allCampaigns = leadMasterFields?.campaigns || [];
                    const allSources = [];
                    allCampaigns.forEach(camp => {
                      if (camp.sources && camp.sources.length > 0) {
                        camp.sources.forEach(src => {
                          const sName = renderValue(src?.name ?? src);
                          if (sName && !allSources.some(s => renderValue(s?.name ?? s) === sName)) allSources.push(src);
                        });
                      }
                    });
                    return allSources.map((s, idx) => {
                      const sName = renderValue(s?.name ?? s);
                      return <option key={sName || idx} value={sName}>{sName}</option>;
                    });
                  })()}
                </select>
              </div>
            )}

            {!hiddenFields.includes("subSource") && (
              <div>
                <label style={labelStyle}>Sub-Source</label>
                <select
                  value={formData.subSource}
                  onChange={(e) => handleInputChange("subSource", e.target.value)}
                  style={!formData.source ? customSelectStyleDisabled : customSelectStyle}
                  disabled={!formData.source}
                >
                  <option value="">Select Sub-Source</option>
                  {(() => {
                    const allCampaigns = leadMasterFields?.campaigns || [];
                    let selectedSrc = null;
                    for (const camp of allCampaigns) {
                      const src = camp.sources?.find(s => renderValue(s?.name ?? s) === formData.source);
                      if (src) { selectedSrc = src; break; }
                    }
                    return (selectedSrc?.mediums || []).map((m, idx) => {
                      const mVal = renderValue(m);
                      return <option key={mVal || idx} value={mVal}>{mVal}</option>;
                    });
                  })()}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* System Assignment */}
      <div style={cardStyle}>
        <h3 style={headerStyle}>
          <i className="fas fa-sliders-h" style={{ color: "#64748b", fontSize: "14px" }}></i>
          <span>System Assignment</span>
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <div>
            <label style={labelStyle}>Team</label>
            <select
              value={formData.team}
              onChange={(e) => {
                handleInputChange("team", e.target.value);
                handleInputChange("owner", "");
              }}
              style={customSelectStyle}
            >
              <option value="">Select Team</option>
              {teams.map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              Assign <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={formData.owner}
              onChange={(e) => handleInputChange("owner", e.target.value)}
              style={customSelectStyle}
            >
              <option value="">Select Owner</option>
              {users.filter((user) => {
                if (!formData.team) return true;
                const teamId = formData.team;
                if (user.team && (user.team === teamId || user.team._id === teamId)) return true;
                if (user.teams && Array.isArray(user.teams)) {
                  return user.teams.some(t => (t === teamId || t._id === teamId));
                }
                return false;
              }).map((user) => (
                <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>
              Visibility <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={formData.visibleTo}
              onChange={(e) => handleInputChange("visibleTo", e.target.value)}
              style={customSelectStyle}
            >
              <option value="">Select Visibility</option>
              <option value="Private">Private</option>
              <option value="Team">Team</option>
              <option value="Everyone">Everyone</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
});

ContactBasicSection.displayName = "ContactBasicSection";
export default ContactBasicSection;
