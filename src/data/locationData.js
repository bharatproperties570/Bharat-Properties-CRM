export const LOCATION_DATA = {
    cities: ["Gurugram", "Mohali", "Chandigarh", "Panchkula", "Zirakpur"],
    projects: {
        "Gurugram": ["DLF Phase 1", "DLF Cyber City", "Golf Course Road", "Sushant Lok 1", "Nirvana Country"],
        "Mohali": ["Homeland Heights", "Falcon View", "Wave Estate", "Aerocity", "IT City"],
        "Chandigarh": ["Sector 17 Plaza", "Elante Mall Area", "Sukhna Enclave", "Modern Housing Complex"],
        "Panchkula": ["Sector 20", "MDC Sector 5", "Sector 11"],
        "Zirakpur": ["Highland Park", "Sushma Grande", "Maya Garden", "VIP Road"]
    },
    blocks: {
        // Gurugram
        "DLF Phase 1": ["Block A", "Block B", "Block C", "Block D"],
        "DLF Cyber City": ["Building 5", "Building 8", "Building 10", "Infinity Tower"],
        "Golf Course Road": ["Tower A", "Tower B", "Phases 1-5"],
        "Sushant Lok 1": ["Block A", "Block B", "Block C"],
        "Nirvana Country": ["Birch Court", "Deerwood", "Espace"],

        // Mohali
        "Homeland Heights": ["Tower 1", "Tower 2", "Tower 3", "Tower 4"],
        "Falcon View": ["Tower A", "Tower B", "Tower C"],
        "Wave Estate": ["Sector 85", "Sector 99", "Block A", "Block B"],
        "Aerocity": ["Block A", "Block B", "Block C", "Block D"],
        "IT City": ["Precinct A", "Precinct B", "Alpha Block"],

        // Chandigarh
        "Sector 17 Plaza": ["Block A", "Block B", "Block C"],
        "Elante Mall Area": ["Industrial Area Ph 1", "Business Park"],
        "Sukhna Enclave": ["Main Street", "South End"],
        "Modern Housing Complex": ["Category 1", "Category 2", "Duplex"],

        // Panchkula
        "Sector 20": ["Group Housing 1", "Group Housing 2", "Sun City"],
        "MDC Sector 5": ["Part 1", "Part 2", "Part 3"],
        "Sector 11": ["Inner Market", "Outer Ring"],

        // Zirakpur
        "Highland Park": ["Tower 1", "Tower 2", "Tower 3"],
        "Sushma Grande": ["Tower A", "Tower B", "Tower C"],
        "Maya Garden": ["Phase 1", "Phase 2", "Phase 3"],
        "VIP Road": ["Apple Heights", "Hollywood Heights", "Savitry Greens"]
    }
};

// Hierarchical Address Data for India (States & Union Territories)
export const INDIAN_ADDRESS_DATA = {
    "India": {
        // --- North India ---
        "Haryana": {
            "Gurugram": {
                tehsils: ["Gurugram", "Manesar", "Sohna", "Pataudi", "Farrukhnagar"],
                postOffices: [
                    { name: "Gurgaon Road", tehsil: "Gurugram", pinCode: "122001" },
                    { name: "DLF QE", tehsil: "Gurugram", pinCode: "122002" },
                    { name: "Sector 56", tehsil: "Gurugram", pinCode: "122011" },
                    { name: "Manesar", tehsil: "Manesar", pinCode: "122050" },
                    { name: "Sohna", tehsil: "Sohna", pinCode: "122103" }
                ]
            },
            "Faridabad": {
                tehsils: ["Faridabad", "Ballabgarh"],
                postOffices: [
                    { name: "Faridabad NIT", tehsil: "Faridabad", pinCode: "121001" },
                    { name: "Ballabgarh", tehsil: "Ballabgarh", pinCode: "121004" }
                ]
            },
            "Panchkula": {
                tehsils: ["Panchkula", "Kalka"],
                postOffices: [{ name: "Panchkula Sector 8", tehsil: "Panchkula", pinCode: "134109" }]
            },
            "Ambala": {
                tehsils: ["Ambala", "Barara", "Naraingarh"],
                postOffices: [{ name: "Ambala City", tehsil: "Ambala", pinCode: "134003" }]
            },
            "Karnal": {
                tehsils: ["Karnal", "Assandh", "Nilokheri"],
                postOffices: [{ name: "Karnal", tehsil: "Karnal", pinCode: "132001" }]
            },
            "Panipat": { tehsils: ["Panipat", "Samalkha"], postOffices: [{ name: "Panipat", tehsil: "Panipat", pinCode: "132103" }] },
            "Sonipat": { tehsils: ["Sonipat", "Gohana"], postOffices: [{ name: "Sonipat", tehsil: "Sonipat", pinCode: "131001" }] },
            "Rohtak": { tehsils: ["Rohtak", "Meham"], postOffices: [{ name: "Rohtak", tehsil: "Rohtak", pinCode: "124001" }] },
            "Hisar": { tehsils: ["Hisar", "Hansi"], postOffices: [{ name: "Hisar", tehsil: "Hisar", pinCode: "125001" }] }
        },
        "Punjab": {
            "Mohali": {
                tehsils: ["Mohali", "Kharar", "Derabassi"],
                postOffices: [
                    { name: "Sas Nagar Phase 7", tehsil: "Mohali", pinCode: "160061" },
                    { name: "Kharar", tehsil: "Kharar", pinCode: "140301" }
                ]
            },
            "Amritsar": { tehsils: ["Amritsar-I", "Amritsar-II", "Ajnala"], postOffices: [{ name: "Amritsar GPO", tehsil: "Amritsar-I", pinCode: "143001" }] },
            "Ludhiana": { tehsils: ["Ludhiana East", "Ludhiana West", "Jagraon"], postOffices: [{ name: "Ludhiana", tehsil: "Ludhiana West", pinCode: "141001" }] },
            "Jalandhar": { tehsils: ["Jalandhar-I", "Jalandhar-II"], postOffices: [{ name: "Jalandhar City", tehsil: "Jalandhar-I", pinCode: "144001" }] },
            "Patiala": { tehsils: ["Patiala", "Nabha", "Rajpura"], postOffices: [{ name: "Patiala", tehsil: "Patiala", pinCode: "147001" }] },
            "Bathinda": { tehsils: ["Bathinda", "Rampura Phul"], postOffices: [{ name: "Bathinda", tehsil: "Bathinda", pinCode: "151001" }] }
        },
        "Himachal Pradesh": {
            "Shimla": { tehsils: ["Shimla (Urban)", "Shimla (Rural)", "Theog"], postOffices: [{ name: "Shimla GPO", tehsil: "Shimla (Urban)", pinCode: "171001" }] },
            "Dharamshala": { tehsils: ["Dharamshala", "Kangra"], postOffices: [{ name: "Dharamshala", tehsil: "Dharamshala", pinCode: "176215" }] },
            "Manali": { tehsils: ["Manali"], postOffices: [{ name: "Manali", tehsil: "Manali", pinCode: "175131" }] }
        },
        "Uttarakhand": {
            "Dehradun": { tehsils: ["Dehradun", "Rishikesh", "Vikasnagar"], postOffices: [{ name: "Dehradun GPO", tehsil: "Dehradun", pinCode: "248001" }] },
            "Haridwar": { tehsils: ["Haridwar", "Roorkee"], postOffices: [{ name: "Haridwar", tehsil: "Haridwar", pinCode: "249401" }] },
            "Nainital": { tehsils: ["Nainital", "Haldwani"], postOffices: [{ name: "Nainital", tehsil: "Nainital", pinCode: "263001" }] }
        },
        "Uttar Pradesh": {
            "Lucknow": { tehsils: ["Lucknow", "Malihabad"], postOffices: [{ name: "Lucknow GPO", tehsil: "Lucknow", pinCode: "226001" }] },
            "Kanpur": { tehsils: ["Kanpur", "Bilhaur"], postOffices: [{ name: "Kanpur", tehsil: "Kanpur", pinCode: "208001" }] },
            "Agra": { tehsils: ["Agra", "Etmadpur"], postOffices: [{ name: "Agra", tehsil: "Agra", pinCode: "282001" }] },
            "Varanasi": { tehsils: ["Varanasi", "Pindra"], postOffices: [{ name: "Varanasi", tehsil: "Varanasi", pinCode: "221001" }] },
            "Noida": { tehsils: ["Dadri", "Jewar"], postOffices: [{ name: "Noida Sector 16", tehsil: "Dadri", pinCode: "201301" }] },
            "Ghaziabad": { tehsils: ["Ghaziabad", "Modinagar"], postOffices: [{ name: "Ghaziabad", tehsil: "Ghaziabad", pinCode: "201001" }] }
        },
        "Delhi": {
            "New Delhi": {
                tehsils: ["Chanakyapuri", "Connaught Place", "Parliament Street", "Vasant Vihar"],
                postOffices: [
                    { name: "Sansad Marg", tehsil: "Parliament Street", pinCode: "110001" },
                    { name: "Connaught Place", tehsil: "Connaught Place", pinCode: "110001" },
                    { name: "Chanakya Puri", tehsil: "Chanakyapuri", pinCode: "110021" },
                    { name: "Vasant Vihar", tehsil: "Vasant Vihar", pinCode: "110057" }
                ]
            },
            "North Delhi": { tehsils: ["Model Town", "Narela", "Alipur"], postOffices: [{ name: "Delhi University", tehsil: "Model Town", pinCode: "110007" }] },
            "South Delhi": { tehsils: ["Saket", "Hauz Khas", "Mehrauli"], postOffices: [{ name: "Saket", tehsil: "Saket", pinCode: "110017" }] },
            "East Delhi": { tehsils: ["Gandhi Nagar", "Preet Vihar"], postOffices: [{ name: "Laxmi Nagar", tehsil: "Preet Vihar", pinCode: "110092" }] },
            "West Delhi": { tehsils: ["Patel Nagar", "Punjabi Bagh", "Rajouri Garden"], postOffices: [{ name: "Rajouri Garden", tehsil: "Rajouri Garden", pinCode: "110027" }] }
        },
        "Rajasthan": {
            "Jaipur": { tehsils: ["Jaipur", "Sanganer", "Amer"], postOffices: [{ name: "Jaipur GPO", tehsil: "Jaipur", pinCode: "302001" }] },
            "Jodhpur": { tehsils: ["Jodhpur", "Osian"], postOffices: [{ name: "Jodhpur", tehsil: "Jodhpur", pinCode: "342001" }] },
            "Udaipur": { tehsils: ["Udaipur", "Girwa"], postOffices: [{ name: "Udaipur", tehsil: "Udaipur", pinCode: "313001" }] },
            "Kota": { tehsils: ["Kota", "Digod"], postOffices: [{ name: "Kota", tehsil: "Kota", pinCode: "324001" }] }
        },
        "Jammu and Kashmir": {
            "Srinagar": { tehsils: ["Srinagar North", "Srinagar South"], postOffices: [{ name: "Srinagar", tehsil: "Srinagar North", pinCode: "190001" }] },
            "Jammu": { tehsils: ["Jammu", "RS Pura"], postOffices: [{ name: "Jammu", tehsil: "Jammu", pinCode: "180001" }] }
        },
        "Ladakh": {
            "Leh": { tehsils: ["Leh"], postOffices: [{ name: "Leh", tehsil: "Leh", pinCode: "194101" }] },
            "Kargil": { tehsils: ["Kargil"], postOffices: [{ name: "Kargil", tehsil: "Kargil", pinCode: "194103" }] }
        },

        // --- West India ---
        "Maharashtra": {
            "Mumbai": {
                tehsils: ["Andheri", "Borivali", "Bandra", "Kurla"],
                postOffices: [
                    { name: "Andheri East", tehsil: "Andheri", pinCode: "400069" },
                    { name: "Bandra West", tehsil: "Bandra", pinCode: "400050" }
                ]
            },
            "Pune": { tehsils: ["Pune City", "Haveli"], postOffices: [{ name: "Pune H.O", tehsil: "Pune City", pinCode: "411001" }] },
            "Nagpur": { tehsils: ["Nagpur (Urban)", "Nagpur (Rural)"], postOffices: [{ name: "Nagpur GPO", tehsil: "Nagpur (Urban)", pinCode: "440001" }] },
            "Nashik": { tehsils: ["Nashik", "Sinnar"], postOffices: [{ name: "Nashik", tehsil: "Nashik", pinCode: "422001" }] }
        },
        "Gujarat": {
            "Ahmedabad": { tehsils: ["Ahmedabad City", "Daskroi"], postOffices: [{ name: "Ahmedabad", tehsil: "Ahmedabad City", pinCode: "380001" }] },
            "Surat": { tehsils: ["Surat City", "Choryasi"], postOffices: [{ name: "Surat", tehsil: "Surat City", pinCode: "395003" }] },
            "Vadodara": { tehsils: ["Vadodara"], postOffices: [{ name: "Vadodara", tehsil: "Vadodara", pinCode: "390001" }] },
            "Rajkot": { tehsils: ["Rajkot"], postOffices: [{ name: "Rajkot", tehsil: "Rajkot", pinCode: "360001" }] }
        },
        "Goa": {
            "North Goa": { tehsils: ["Tiswadi (Panaji)", "Bardez (Mapusa)"], postOffices: [{ name: "Panaji", tehsil: "Tiswadi (Panaji)", pinCode: "403001" }] },
            "South Goa": { tehsils: ["Salcete (Margao)", "Mormugao"], postOffices: [{ name: "Margao", tehsil: "Salcete (Margao)", pinCode: "403601" }] }
        },

        // --- South India ---
        "Karnataka": {
            "Bengaluru": { tehsils: ["Bengaluru North", "Bengaluru South", "Bengaluru East"], postOffices: [{ name: "Bengaluru GPO", tehsil: "Bengaluru North", pinCode: "560001" }] },
            "Mysuru": { tehsils: ["Mysuru", "Hunsur"], postOffices: [{ name: "Mysuru", tehsil: "Mysuru", pinCode: "570001" }] },
            "Hubballi": { tehsils: ["Hubballi"], postOffices: [{ name: "Hubballi", tehsil: "Hubballi", pinCode: "580020" }] }
        },
        "Tamil Nadu": {
            "Chennai": { tehsils: ["Egmore", "Mambalam", "Mylapore"], postOffices: [{ name: "Chennai GPO", tehsil: "Egmore", pinCode: "600001" }] },
            "Coimbatore": { tehsils: ["Coimbatore North", "Coimbatore South"], postOffices: [{ name: "Coimbatore", tehsil: "Coimbatore North", pinCode: "641001" }] },
            "Madurai": { tehsils: ["Madurai North", "Madurai South"], postOffices: [{ name: "Madurai", tehsil: "Madurai North", pinCode: "625001" }] }
        },
        "Telangana": {
            "Hyderabad": { tehsils: ["Hyderabad", "Secunderabad"], postOffices: [{ name: "Hyderabad GPO", tehsil: "Hyderabad", pinCode: "500001" }] },
            "Warangal": { tehsils: ["Warangal"], postOffices: [{ name: "Warangal", tehsil: "Warangal", pinCode: "506002" }] }
        },
        "Andhra Pradesh": {
            "Visakhapatnam": { tehsils: ["Visakhapatnam (Urban)"], postOffices: [{ name: "Waltair", tehsil: "Visakhapatnam (Urban)", pinCode: "530001" }] },
            "Vijayawada": { tehsils: ["Vijayawada (Urban)"], postOffices: [{ name: "Vijayawada", tehsil: "Vijayawada (Urban)", pinCode: "520001" }] }
        },
        "Kerala": {
            "Thiruvananthapuram": { tehsils: ["Thiruvananthapuram"], postOffices: [{ name: "Thiruvananthapuram GPO", tehsil: "Thiruvananthapuram", pinCode: "695001" }] },
            "Kochi": { tehsils: ["Kanayannur"], postOffices: [{ name: "Ernakulam", tehsil: "Kanayannur", pinCode: "682011" }] },
            "Kozhikode": { tehsils: ["Kozhikode"], postOffices: [{ name: "Kozhikode", tehsil: "Kozhikode", pinCode: "673001" }] }
        },

        // --- East India ---
        "West Bengal": {
            "Kolkata": { tehsils: ["Kolkata"], postOffices: [{ name: "Kolkata GPO", tehsil: "Kolkata", pinCode: "700001" }] },
            "Howrah": { tehsils: ["Howrah"], postOffices: [{ name: "Howrah", tehsil: "Howrah", pinCode: "711101" }] },
            "Darjeeling": { tehsils: ["Darjeeling", "Kalimpong"], postOffices: [{ name: "Darjeeling", tehsil: "Darjeeling", pinCode: "734101" }] }
        },
        "Odisha": {
            "Bhubaneswar": { tehsils: ["Bhubaneswar"], postOffices: [{ name: "Bhubaneswar GPO", tehsil: "Bhubaneswar", pinCode: "751001" }] },
            "Cuttack": { tehsils: ["Cuttack"], postOffices: [{ name: "Cuttack", tehsil: "Cuttack", pinCode: "753001" }] }
        },
        "Bihar": {
            "Patna": { tehsils: ["Patna Sadar"], postOffices: [{ name: "Patna GPO", tehsil: "Patna Sadar", pinCode: "800001" }] },
            "Gaya": { tehsils: ["Gaya Town"], postOffices: [{ name: "Gaya", tehsil: "Gaya Town", pinCode: "823001" }] }
        },
        "Jharkhand": {
            "Ranchi": { tehsils: ["Ranchi"], postOffices: [{ name: "Ranchi GPO", tehsil: "Ranchi", pinCode: "834001" }] },
            "Jamshedpur": { tehsils: ["Golmuri-Cum-Jugsalai"], postOffices: [{ name: "Jamshedpur", tehsil: "Golmuri-Cum-Jugsalai", pinCode: "831001" }] }
        },

        // --- Central India ---
        "Madhya Pradesh": {
            "Bhopal": { tehsils: ["Huzur"], postOffices: [{ name: "Bhopal GPO", tehsil: "Huzur", pinCode: "462001" }] },
            "Indore": { tehsils: ["Indore"], postOffices: [{ name: "Indore", tehsil: "Indore", pinCode: "452001" }] },
            "Gwalior": { tehsils: ["Gwalior"], postOffices: [{ name: "Gwalior", tehsil: "Gwalior", pinCode: "474001" }] }
        },
        "Chhattisgarh": {
            "Raipur": { tehsils: ["Raipur"], postOffices: [{ name: "Raipur", tehsil: "Raipur", pinCode: "492001" }] },
            "Bhilai": { tehsils: ["Durg"], postOffices: [{ name: "Bhilai", tehsil: "Durg", pinCode: "490001" }] }
        },

        // --- North East India ---
        "Assam": {
            "Guwahati": { tehsils: ["Guwahati"], postOffices: [{ name: "Guwahati GPO", tehsil: "Guwahati", pinCode: "781001" }] },
            "Dibrugarh": { tehsils: ["Dibrugarh"], postOffices: [{ name: "Dibrugarh", tehsil: "Dibrugarh", pinCode: "786001" }] }
        },
        "Sikkim": {
            "Gangtok": { tehsils: ["Gangtok"], postOffices: [{ name: "Gangtok", tehsil: "Gangtok", pinCode: "737101" }] }
        },
        "Meghalaya": {
            "Shillong": { tehsils: ["Mylliem"], postOffices: [{ name: "Shillong GPO", tehsil: "Mylliem", pinCode: "793001" }] }
        },
        "Manipur": {
            "Imphal": { tehsils: ["Imphal West", "Imphal East"], postOffices: [{ name: "Imphal", tehsil: "Imphal West", pinCode: "795001" }] }
        },
        "Mizoram": {
            "Aizawl": { tehsils: ["Tlangnuam"], postOffices: [{ name: "Aizawl", tehsil: "Tlangnuam", pinCode: "796001" }] }
        },
        "Nagaland": {
            "Kohima": { tehsils: ["Kohima Sadar"], postOffices: [{ name: "Kohima", tehsil: "Kohima Sadar", pinCode: "797001" }] },
            "Dimapur": { tehsils: ["Dimapur Sadar"], postOffices: [{ name: "Dimapur", tehsil: "Dimapur Sadar", pinCode: "797112" }] }
        },
        "Tripura": {
            "Agartala": { tehsils: ["Agartala"], postOffices: [{ name: "Agartala", tehsil: "Agartala", pinCode: "799001" }] }
        },
        "Arunachal Pradesh": {
            "Itanagar": { tehsils: ["Itanagar"], postOffices: [{ name: "Itanagar", tehsil: "Itanagar", pinCode: "791111" }] }
        },

        // --- Other Union Territories ---
        "Puducherry": {
            "Puducherry": { tehsils: ["Puducherry"], postOffices: [{ name: "Puducherry", tehsil: "Puducherry", pinCode: "605001" }] }
        },
        "Andaman and Nicobar Islands": {
            "Port Blair": { tehsils: ["Port Blair"], postOffices: [{ name: "Port Blair", tehsil: "Port Blair", pinCode: "744101" }] }
        },
        "Dadra and Nagar Haveli and Daman and Diu": {
            "Daman": { tehsils: ["Daman"], postOffices: [{ name: "Daman", tehsil: "Daman", pinCode: "396210" }] },
            "Silvassa": { tehsils: ["Silvassa"], postOffices: [{ name: "Silvassa", tehsil: "Silvassa", pinCode: "396230" }] }
        },
        "Lakshadweep": {
            "Kavaratti": { tehsils: ["Kavaratti"], postOffices: [{ name: "Kavaratti", tehsil: "Kavaratti", pinCode: "682555" }] }
        }
    }
};
