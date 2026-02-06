// src/hooks/useLookup.js

import { useState, useEffect, useCallback } from "react";
import api from "../../api"; // adjust path if needed

const useLookup = (lookup_type, parent_lookup_id = null, page = 1, limit = 1000) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLookup = useCallback(async () => {
    if (!lookup_type) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.get("api/LookupList", {
        params: {
          lookup_type,
          parent_lookup_id,
          page,
          limit,
        },
      });

      if (res.data.status === "success") {
        setData(res.data.data);
      } else {
        setData([]);
      }
    } catch (err) {
      console.error("Lookup Fetch Error:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [lookup_type, parent_lookup_id, page, limit]);

  useEffect(() => {
    fetchLookup();
  }, [fetchLookup]);

  return {
    data,
    loading,
    error,
    refetch: fetchLookup,
  };
};

export default useLookup;
