import api from "../../api"; // adjust path

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
