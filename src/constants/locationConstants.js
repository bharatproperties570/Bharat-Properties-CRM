export const LOCATION_DATA = {
    cities: [],
    projects: {},
    blocks: {}
};

export const INDIAN_ADDRESS_DATA = {
    "India": {
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
        }
    }
};
