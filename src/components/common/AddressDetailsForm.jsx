import React, { useState, useEffect } from "react";
import { api } from "../../utils/api";

// Helper dropdown styles (UNCHANGED)
const getDropdownStyle = (disabled) => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  fontSize: "0.9rem",
  outline: "none",
  color: "#1e293b",
  backgroundColor: disabled ? "#f1f5f9" : "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  height: "42px",
  boxSizing: "border-box",
});
const labelStyle = {
  fontSize: "0.9rem",
  fontWeight: 600,
  color: "#334155",
  marginBottom: "12px",
  display: "block",
};

const getDisabledStyle = () => ({
  ...getDropdownStyle(true),
  color: "#94a3b8",
});

const AddressDetailsForm = ({ address, onChange, title = "Personal Address", disabledFields = [] }) => {
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [postOffices, setPostOffices] = useState([]);
  const [pincodes, setPincodes] = useState([]);
  const [tehsils, setTehsils] = useState([]);

  const handleAddressChange = (updates) => {
    onChange({ ...address, ...updates });
  };

  // Generic Fetch Function
  const fetchLookup = async (lookup_type, parent_lookup_id = null) => {
    try {
      const res = await api.get("/lookups", {
        params: {
          lookup_type,
          parent_lookup_id,
          page: 1,
          limit: 1000,
        },
      });

      if (res.data.status === "success") {
        return res.data.data;
      }
      return [];
    } catch (error) {
      console.error("Fetch Error:", error);
      return [];
    }
  };

  // Load Countries on mount
  useEffect(() => {
    const loadCountries = async () => {
      const data = await fetchLookup("Country", null);
      setCountries(data);
    };
    loadCountries();
  }, []);

  // Country → State
  useEffect(() => {
    if (!address.country) {
      setStates([]);
      return;
    }

    const loadStates = async () => {
      const data = await fetchLookup("State", address.country);
      setStates(data);
    };
    loadStates();
  }, [address.country]);

  // State → City
  useEffect(() => {
    if (!address.state) {
      setCities([]);
      return;
    }

    const loadCities = async () => {
      const data = await fetchLookup("City", address.state);
      setCities(data);
    };
    loadCities();
  }, [address.state]);

  // City → Location
  useEffect(() => {
    if (!address.city) {
      setLocations([]);
      return;
    }

    const loadLocations = async () => {
      const data = await fetchLookup("Location", address.city);
      setLocations(data);
    };
    loadLocations();
  }, [address.city]);

  // City → Tehsil (Parallel to Location)
  useEffect(() => {
    if (!address.city) {
      setTehsils([]);
      return;
    }

    const loadTehsils = async () => {
      const data = await fetchLookup("Tehsil", address.city);
      setTehsils(data);
    };
    loadTehsils();
  }, [address.city]);

  // Location / Tehsil (Same Level)
  useEffect(() => {
    if (!address.location) {
      setPostOffices([]);
      return;
    }

    const loadPO = async () => {
      const data = await fetchLookup("PostOffice", address.location);
      setPostOffices(data);
    };
    loadPO();
  }, [address.location]);

  // Post Office → Pin Code (auto-fill only)
  useEffect(() => {
    if (!address.postOffice) {
      return;
    }

    const loadPin = async () => {
      const data = await fetchLookup("Pincode", address.postOffice);

      // If only one pincode available → auto select
      if (data.length === 1) {
        handleAddressChange({ pinCode: data[0].lookup_value });
      }
    };

    loadPin();
  }, [address.postOffice]);


  return (
    <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <h3 style={{ margin: "0 0 20px 0", fontSize: "1rem", fontWeight: 600, color: "#0f172a", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px" }}>
        {title}
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* Row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px" }}>

          {/* Country */}
          <div>
            <label style={labelStyle}>Country</label>
            <select
              value={address.country || ""}
              onChange={(e) =>
                handleAddressChange({
                  country: e.target.value,
                  state: "",
                  city: "",
                  location: "",
                  tehsil: "",
                  postOffice: "",
                  pinCode: "",
                })
              }
              style={getDropdownStyle(disabledFields.includes('country'))}
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
              value={address.state || ""}
              onChange={(e) =>
                handleAddressChange({
                  state: e.target.value,
                  city: "",
                  location: "",
                  tehsil: "",
                  postOffice: "",
                  pinCode: "",
                })
              }
              disabled={!address.country || disabledFields.includes('state')}
              style={(!address.country || disabledFields.includes('state')) ? getDisabledStyle() : getDropdownStyle(false)}
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
              value={address.city || ""}
              onChange={(e) =>
                handleAddressChange({
                  city: e.target.value,
                  location: "",
                  tehsil: "",
                  postOffice: "",
                  pinCode: "",
                })
              }
              disabled={!address.state || disabledFields.includes('city')}
              style={(!address.state || disabledFields.includes('city')) ? getDisabledStyle() : getDropdownStyle(false)}
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

        {/* Row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "20px" }}>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <select
              value={address.location || ""}
              onChange={(e) =>
                handleAddressChange({
                  location: e.target.value,
                  postOffice: "",
                  pinCode: "",
                })
              }
              disabled={!address.city || disabledFields.includes('location')}
              style={(!address.city || disabledFields.includes('location')) ? getDisabledStyle() : getDropdownStyle(false)}
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
              value={address.tehsil || ""}
              onChange={(e) =>
                handleAddressChange({
                  tehsil: e.target.value,
                })
              }
              disabled={!address.city}
              style={!address.city ? getDisabledStyle() : getDropdownStyle(false)}
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
              value={address.postOffice || ""}
              onChange={(e) =>
                handleAddressChange({
                  postOffice: e.target.value,
                  pinCode: "",
                })
              }
              disabled={!address.location}
              style={!address.location ? getDisabledStyle() : getDropdownStyle(false)}
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
              value={address.pinCode || ""}
              onChange={(e) =>
                handleAddressChange({ pinCode: e.target.value })
              }
              disabled={!address.postOffice}
              style={
                !address.postOffice
                  ? getDisabledStyle()
                  : getDropdownStyle(false)
              }
            />
          </div>

        </div>

        {/* Row 3 */}
        <div style={{ display: "grid", gridTemplateColumns: "120px 2fr 1fr", gap: "20px" }}>

          <div>
            <label style={labelStyle}>House Number</label>
            <input
              type="text"
              value={address.hNo || ""}
              onChange={(e) => handleAddressChange({ hNo: e.target.value })}
              style={getDropdownStyle(false)}
            />
          </div>

          <div>
            <label style={labelStyle}>Street / Road / Landmark</label>
            <input
              type="text"
              value={address.street || ""}
              onChange={(e) => handleAddressChange({ street: e.target.value })}
              style={getDropdownStyle(false)}
            />
          </div>

          <div>
            <label style={labelStyle}>Area</label>
            <input
              type="text"
              value={address.area || ""}
              onChange={(e) => handleAddressChange({ area: e.target.value })}
              style={getDropdownStyle(false)}
            />
          </div>
        </div>

      </div>
    </div>
  );
};

export default AddressDetailsForm;
