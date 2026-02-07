import axios from 'axios';

// Create axios instance for old backend API
const api = axios.create({
  baseURL: 'https://newapi.bharatproperties.co/'
});

export const fetchLookup = async (
  lookup_type,
  parent_lookup_id = null,
  page = 1,
  limit = 1000
) => {
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
      return res.data.data;
    }

    return [];
  } catch (error) {
    console.error("Lookup Fetch Error:", error);
    return [];
  }
};
