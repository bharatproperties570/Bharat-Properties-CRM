import React from 'react';

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
  return (
  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
    {/* Identity Card */}
    <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <h3 style={{ margin: "0 0 20px 0", fontSize: "1rem", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
        <i className="fas fa-user-circle" style={{ color: "#3b82f6" }}></i> Identity Details
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 1fr", gap: "20px" }}>
        {!hiddenFields.includes("title") && (
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Title</label>
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
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>First Name <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange("name", e.target.value)}
            placeholder="Enter first name"
            autoComplete="off"
            style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", color: "#1e293b" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Last Name</label>
          <input
            type="text"
            value={formData.surname}
            onChange={(e) => handleInputChange("surname", e.target.value)}
            placeholder="Enter last name"
            autoComplete="off"
            style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", color: "#1e293b" }}
          />
        </div>
        {!showOnlyRequired && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Father/Husband Name</label>
            <input
              type="text"
              value={formData.fatherName}
              onChange={(e) => handleInputChange("fatherName", e.target.value)}
              placeholder="Enter father or husband's name"
              style={{ width: "100%", padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", color: "#1e293b" }}
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: "24px" }}>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "12px" }}>Mobile Numbers <span style={{ color: "#ef4444" }}>*</span></label>
        {formData.phones.map((phone, index) => (
          <div key={index} style={{ display: "grid", gridTemplateColumns: "minmax(100px, 120px) 1fr minmax(100px, 120px) 40px", gap: "12px", marginBottom: "12px" }}>
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
              style={{ padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#f8fafc", fontSize: "0.9rem", color: "#475569" }}
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
              style={{ padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", color: "#1e293b" }}
            />
            <select
              value={phone.type}
              onChange={(e) => {
                const newPhones = [...formData.phones];
                newPhones[index].type = e.target.value;
                handleInputChange("phones", newPhones);
              }}
              style={{ padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", color: "#475569" }}
            >
              {mobileTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
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
              style={{ borderRadius: "6px", border: "none", background: index === 0 ? "#eff6ff" : "#fef2f2", color: index === 0 ? "#3b82f6" : "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
            </button>
          </div>
        ))}
      </div>

      <div>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "12px" }}>Email Addresses</label>
        {formData.emails.map((email, index) => (
          <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr minmax(100px, 120px) 40px", gap: "12px", marginBottom: "12px" }}>
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
              style={{ padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none", color: "#1e293b" }}
            />
            <select
              value={email.type}
              onChange={(e) => {
                const newEmails = [...formData.emails];
                newEmails[index].type = e.target.value;
                handleInputChange("emails", newEmails);
              }}
              style={{ padding: "10px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", color: "#475569" }}
            >
              {emailTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
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
              style={{ borderRadius: "6px", border: "none", background: index === 0 ? "#eff6ff" : "#fef2f2", color: index === 0 ? "#3b82f6" : "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className={`fas ${index === 0 ? "fa-plus" : "fa-trash"}`}></i>
            </button>
          </div>
        ))}
      </div>
    </div>

    {!showOnlyRequired && (
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="fas fa-map-marker-alt" style={{ color: "#6366f1" }}></i> Address Details
          </h3>
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "6px", padding: "4px" }}>
            <button onClick={() => setCurrentAddressType("permanent")} style={{ padding: "6px 12px", borderRadius: "4px", border: "none", background: currentAddressType === "permanent" ? "#fff" : "transparent", color: currentAddressType === "permanent" ? "#0f172a" : "#64748b", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", boxShadow: currentAddressType === "permanent" ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}>Permanent</button>
            <button onClick={() => setCurrentAddressType("correspondence")} style={{ padding: "6px 12px", borderRadius: "4px", border: "none", background: currentAddressType === "correspondence" ? "#fff" : "transparent", color: currentAddressType === "correspondence" ? "#0f172a" : "#64748b", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", boxShadow: currentAddressType === "correspondence" ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}>Correspondence</button>
          </div>
        </div>
        {(() => {
          const addrKey = currentAddressType === "permanent" ? "personalAddress" : "correspondenceAddress";
          const addr = formData[addrKey];
          return (
            <AddressDetailsForm
              title={addrKey === "personalAddress" ? "Personal Address" : "Correspondence Address"}
              address={addr}
              onChange={(newAddr) => handleInputChange(addrKey, newAddr)}
            />
          );
        })()}
      </div>
    )}

    {!showOnlyRequired && (
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <h3 style={{ margin: "0 0 20px 0", fontSize: "1rem", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
          <i className="fas fa-bullhorn" style={{ color: "#f59e0b" }}></i> Source Details
        </h3>
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Tags</label>
          <div style={{ width: "100%", padding: "6px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", minHeight: "42px" }}>
            {formData.tags.map((tag, index) => (
              <div key={index} style={{ background: "#eff6ff", color: "#3b82f6", padding: "4px 10px", borderRadius: "16px", fontSize: "0.8rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
                {tag}
                <span onClick={() => handleInputChange("tags", formData.tags.filter((_, i) => i !== index))} style={{ cursor: "pointer", fontSize: "1rem", lineHeight: "0.8" }}>&times;</span>
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
              style={{ border: "none", outline: "none", fontSize: "0.9rem", color: "#1e293b", flex: 1, minWidth: "120px" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "20px" }}>
          {!hiddenFields.includes("source") && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Source</label>
              <select
                value={formData.source}
                onChange={(e) => {
                  const selectedSourceName = e.target.value;
                  handleInputChange("source", selectedSourceName);
                  handleInputChange("subSource", "");
                  const allCampaigns = leadMasterFields?.campaigns || [];
                  let foundCampaign = null;
                  for (const camp of allCampaigns) {
                    if (camp.sources?.some(s => s.name === selectedSourceName)) {
                      foundCampaign = camp.name;
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
                        if (!allSources.some(s => s.name === src.name)) allSources.push(src);
                      });
                    }
                  });
                  return allSources.map((s) => <option key={s.name} value={s.name}>{s.name}</option>);
                })()}
              </select>
            </div>
          )}

          {!hiddenFields.includes("subSource") && (
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Sub-Source</label>
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
                    const src = camp.sources?.find(s => s.name === formData.source);
                    if (src) { selectedSrc = src; break; }
                  }
                  return (selectedSrc?.mediums || []).map((m) => <option key={m} value={m}>{m}</option>);
                })()}
              </select>
            </div>
          )}
        </div>
      </div>
    )}

    <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <h3 style={{ margin: "0 0 20px 0", fontSize: "1rem", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px", paddingBottom: "12px", borderBottom: "1px solid #f1f5f9" }}>
        <i className="fas fa-sliders-h" style={{ color: "#64748b" }}></i> System Assignment
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Team</label>
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
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Assign <span style={{ color: '#ef4444' }}>*</span></label>
          <select
            value={formData.owner}
            onChange={(e) => handleInputChange("owner", e.target.value)}
            style={customSelectStyle}
          >
            <option value="">Select Owner</option>
            {users.filter((user) => !formData.team || (user.team && (user.team === formData.team || user.team._id === formData.team))).map((user) => (
              <option key={user._id || user.id} value={user._id || user.id}>{user.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "#64748b", marginBottom: "8px" }}>Visibility <span style={{ color: '#ef4444' }}>*</span></label>
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
