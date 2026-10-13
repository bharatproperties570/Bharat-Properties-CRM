import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../utils/api";
import { useTheme } from "../../context/ThemeContext";

const getInputBaseStyle = (isDark) => ({
  width: "100%",
  padding: "9px 12px",
  borderRadius: "10px",
  border: isDark ? "1px solid rgba(255, 255, 255, 0.14)" : "1.5px solid #e2e8f0",
  fontSize: "0.86rem",
  fontWeight: 500,
  outline: "none",
  color: isDark ? "#f8fafc" : "#1e293b",
  backgroundColor: isDark ? "rgba(255, 255, 255, 0.05)" : "#fff",
  height: "40px",
  boxSizing: "border-box",
  transition: "all 0.15s ease",
});

const getDropdownStyle = (disabled, isDark) => ({
  ...getInputBaseStyle(isDark),
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  backgroundSize: "10px",
  paddingRight: "30px",
  backgroundColor: disabled ? (isDark ? "rgba(255, 255, 255, 0.02)" : "#f8fafc") : (isDark ? "rgba(255, 255, 255, 0.05)" : "#fff"),
  borderColor: disabled ? (isDark ? "rgba(255, 255, 255, 0.06)" : "#f1f5f9") : (isDark ? "rgba(255, 255, 255, 0.14)" : "#e2e8f0"),
  color: disabled ? (isDark ? "#64748b" : "#94a3b8") : (isDark ? "#f8fafc" : "#1e293b"),
  cursor: disabled ? "not-allowed" : "pointer",
});

const getLabelStyle = (isDark) => ({
  fontSize: "0.72rem",
  fontWeight: 700,
  color: isDark ? "var(--text-muted, #94a3b8)" : "#64748b",
  marginBottom: "6px",
  display: "block",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
});

const AddressDetailsForm = ({ address = {}, onChange, title = "Personal Address", disabledFields = [], hideCard = false, hideHeader = false }) => {
  const theme = useTheme();
  const isDark = Boolean(theme?.isDark);
  const inputBaseStyle = getInputBaseStyle(isDark);
  const labelStyle = getLabelStyle(isDark);
  const getDropdown = (disabled) => getDropdownStyle(disabled, isDark);
  const getDisabledStyle = () => getDropdown(true);
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [postOffices, setPostOffices] = useState([]);
  const [tehsils, setTehsils] = useState([]);

  const addressRef = useRef(address);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const handleAddressChange = useCallback((updates) => {
    onChange({ ...addressRef.current, ...updates });
  }, [onChange]);

  // Generic Fetch Function
  const fetchLookup = useCallback(async (lookup_type, parent_lookup_id = null) => {
    try {
      // 🛡️ [SENIOR FIX] Ensure parent_lookup_id is a raw string ID, not an object
      const rawParentId = (typeof parent_lookup_id === 'object' && parent_lookup_id !== null)
        ? (parent_lookup_id._id || parent_lookup_id.id)
        : parent_lookup_id;

      const res = await api.get("/lookups", {
        params: {
          lookup_type,
          parent_lookup_id: rawParentId,
          page: 1,
          limit: 1000,
        },
      });

      if (res.data.status === "success") {
        return res.data.data;
      }
      return [];
    } catch (_) {
      return [];
    }
  }, []);

  // Load Countries on mount
  useEffect(() => {
    const loadCountries = async () => {
      const data = await fetchLookup("Country", null);
      setCountries(data);
    };
    loadCountries();
  }, [fetchLookup]);

  // Country → State
  useEffect(() => {
    const countryId = address?.country?._id || address?.country;
    if (!countryId) {
      setStates([]);
      return;
    }

    const loadStates = async () => {
      const data = await fetchLookup("State", countryId);
      setStates(data);
    };
    loadStates();
  }, [address?.country, fetchLookup]);

  // State → City
  useEffect(() => {
    const stateId = address?.state?._id || address?.state;
    if (!stateId) {
      setCities([]);
      return;
    }

    const loadCities = async () => {
      const data = await fetchLookup("City", stateId);
      setCities(data);
    };
    loadCities();
  }, [address?.state, fetchLookup]);

  // City → Location & Tehsil
  useEffect(() => {
    const cityId = address?.city?._id || address?.city;
    if (!cityId) {
      setLocations([]);
      setTehsils([]);
      return;
    }

    const loadCityChildren = async () => {
      const [locData, tehsilData] = await Promise.all([
        fetchLookup("Location", cityId),
        fetchLookup("Tehsil", cityId)
      ]);
      setLocations(locData);
      setTehsils(tehsilData);
    };
    loadCityChildren();
  }, [address?.city, fetchLookup]);

  // Location → Post Office
  useEffect(() => {
    const locationId = address?.location?._id || address?.location;
    if (!locationId) {
      setPostOffices([]);
      return;
    }

    const loadPO = async () => {
      const data = await fetchLookup("PostOffice", locationId);
      setPostOffices(data);
    };
    loadPO();
  }, [address?.location, fetchLookup]);

  // Post Office → Pin Code
  useEffect(() => {
    const poId = address?.postOffice?._id || address?.postOffice;
    if (!poId) return;

    const loadPin = async () => {
      const data = await fetchLookup("Pincode", poId);
      if (data.length === 1 && !address.pincode) {
        handleAddressChange({ pincode: data[0].lookup_value });
      }
    };
    loadPin();
  }, [address?.postOffice, fetchLookup, handleAddressChange]);


  const showHeader = !hideHeader && Boolean(title && title.trim());

  const containerContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Row 1: Country, State, City */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        {/* Country */}
        <div>
          <label style={labelStyle}>Country</label>
          <select
            value={address.country?._id || address.country || ""}
            onChange={(e) =>
              handleAddressChange({
                country: e.target.value,
                state: "",
                city: "",
                location: "",
                tehsil: "",
                postOffice: "",
                pincode: "",
              })
            }
            style={getDropdown(disabledFields.includes('country'))}
            disabled={disabledFields.includes('country')}
          >
            <option value="">Select Country</option>
            {countries.map((c) => (
              <option key={c._id} value={c._id}>
                {c.lookup_value}
              </option>
            ))}
          </select>
        </div>

        {/* State */}
        <div>
          <label style={labelStyle}>State</label>
          <select
            value={address.state?._id || address.state || ""}
            onChange={(e) =>
              handleAddressChange({
                state: e.target.value,
                city: "",
                location: "",
                tehsil: "",
                postOffice: "",
                pincode: "",
              })
            }
            disabled={!address.country || disabledFields.includes('state')}
            style={(!address.country || disabledFields.includes('state')) ? getDisabledStyle() : getDropdown(false)}
          >
            <option value="">Select State</option>
            {states.map((s) => (
              <option key={s._id} value={s._id}>
                {s.lookup_value}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div>
          <label style={labelStyle}>City</label>
          <select
            value={address.city?._id || address.city || ""}
            onChange={(e) =>
              handleAddressChange({
                city: e.target.value,
                location: "",
                tehsil: "",
                postOffice: "",
                pincode: "",
              })
            }
            disabled={!address.state || disabledFields.includes('city')}
            style={(!address.state || disabledFields.includes('city')) ? getDisabledStyle() : getDropdown(false)}
          >
            <option value="">Select City</option>
            {cities.map((c) => (
              <option key={c._id} value={c._id}>
                {c.lookup_value}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Location, Tehsil, Post Office, Pin Code */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px" }}>
        {/* Location */}
        <div>
          <label style={labelStyle}>Location</label>
          <select
            value={address.location?._id || address.location || ""}
            onChange={(e) =>
              handleAddressChange({
                location: e.target.value,
                postOffice: "",
                pincode: "",
              })
            }
            disabled={!address.city || disabledFields.includes('location')}
            style={(!address.city || disabledFields.includes('location')) ? getDisabledStyle() : getDropdown(false)}
          >
            <option value="">Select Location</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.lookup_value}
              </option>
            ))}
          </select>
        </div>

        {/* Tehsil */}
        <div>
          <label style={labelStyle}>Tehsil</label>
          <select
            value={address.tehsil?._id || address.tehsil || ""}
            onChange={(e) =>
              handleAddressChange({
                tehsil: e.target.value,
              })
            }
            disabled={!address.city}
            style={!address.city ? getDisabledStyle() : getDropdown(false)}
          >
            <option value="">Select Tehsil</option>
            {tehsils.map((t) => (
              <option key={t._id} value={t._id}>
                {t.lookup_value}
              </option>
            ))}
          </select>
        </div>

        {/* Post Office */}
        <div>
          <label style={labelStyle}>Post Office</label>
          <select
            value={address.postOffice?._id || address.postOffice || ""}
            onChange={(e) =>
              handleAddressChange({
                postOffice: e.target.value,
                pincode: "",
              })
            }
            disabled={!address.location}
            style={!address.location ? getDisabledStyle() : getDropdown(false)}
          >
            <option value="">Select Post Office</option>
            {postOffices.map((po) => (
              <option key={po._id} value={po._id}>
                {po.lookup_value}
              </option>
            ))}
          </select>
        </div>

        {/* Pin Code */}
        <div>
          <label style={labelStyle}>Pin Code</label>
          <input
            type="text"
            placeholder="Enter Pin Code"
            value={typeof address.pincode === "object" ? (address.pincode?.lookup_value || address.pincode?.name || "") : (address.pincode || "")}
            onChange={(e) =>
              handleAddressChange({ pincode: e.target.value })
            }
            disabled={!address.postOffice}
            style={
              !address.postOffice
                ? getDisabledStyle()
                : inputBaseStyle
            }
          />
        </div>
      </div>

      {/* Row 3: House Number, Street, Area */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 2fr 1.2fr", gap: "14px" }}>
        <div>
          <label style={labelStyle}>House Number</label>
          <input
            type="text"
            placeholder="e.g. Flat 402, Villa 12"
            value={address.hNo || ""}
            onChange={(e) => handleAddressChange({ hNo: e.target.value })}
            style={inputBaseStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Street / Road / Landmark</label>
          <input
            type="text"
            placeholder="e.g. VIP Road, Near City Mall"
            value={address.street || ""}
            onChange={(e) => handleAddressChange({ street: e.target.value })}
            style={inputBaseStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Area / Sector</label>
          <input
            type="text"
            placeholder="e.g. Sector 82"
            value={typeof address.area === "object" ? (address.area?.lookup_value || address.area?.name || "") : (address.area || "")}
            onChange={(e) => handleAddressChange({ area: e.target.value })}
            style={inputBaseStyle}
          />
        </div>
      </div>
    </div>
  );

  if (hideCard) {
    return (
      <div>
        {showHeader && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", paddingBottom: "10px", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)" }}>
              <i className="fas fa-map-marker-alt" style={{ fontSize: "12px" }}></i>
            </div>
            <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a" }}>{title}</h4>
          </div>
        )}
        {containerContent}
      </div>
    );
  }

  return (
    <div style={{ background: isDark ? "rgba(255, 255, 255, 0.03)" : "#fff", padding: "20px 24px", borderRadius: "16px", border: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", paddingBottom: "12px", borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #f1f5f9" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)" }}>
            <i className="fas fa-map-marker-alt" style={{ fontSize: "12px" }}></i>
          </div>
          <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a" }}>{title}</h4>
        </div>
      )}
      {containerContent}
    </div>
  );
};

export default AddressDetailsForm;
