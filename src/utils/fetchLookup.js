import { api } from "./api";

// Create axios instance for old backend API (REMOVED)

export const fetchLookup = async (
  lookup_type,
  parent_lookup_id = null,
  page = 1,
  limit = 1000
) => {
  try {


    const res = await api.get("/lookups", {
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
