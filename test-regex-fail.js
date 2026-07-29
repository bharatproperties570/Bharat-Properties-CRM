const msg = '[Template: property_match_detailed] Payload: [{"type":"header","parameters":[{"type":"document","document":{"link":"https://api.bharatproperties.co/uploads/Huda_Map_Book_KKR.pdf?v=compressed_v1","filename":"Huda_Map_Book_KKR.pdf"}}]},{"type":"body","parameters":[{"type":"text","text":"Vishal Anand","parameter_name":"full_name"},{"type":"text","text":"Plot (Ordinary) | 8 Marla (215.28 Sq Yd) | Sector 8 Kurukshetra | Direction-East | Road 9 Mtr (30 Feet) Wide | Facing T Point | ₹1.85 Cr","parameter_name":"property_list_dtl"}]},{"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9~eyJsZWFkSWQiOiI2YTM5MDVkNmYxY2FiMmJmYjI5ODVlMTkiLCJzb3VyY2UiOiJ3YV9tYXRjaF9jZW50cmUiLCJwcm9wZXJ0aWVzIjpbeyJpZCI6IjZhNGZhOGMxNjk4MDc3NWY1MWRhY2MxMyIsIm5hbWUiOlsiU2VjdG9yIDEzIEt1cnVrc2hldHJhIiwiU2VjdG9yIDggS3VydWtzaGV0cmEiLCJTZWN0b3IgNSBLdXJ1a3NoZXRyYSJdLCJibG9jayI6IlNlY29uZCBCbG9jayIsInVuaXQiOiIifV0sImhpZGVQcmljZSI6ZmFsc2UsImhpZGVVbml0Ijp0cnVlLCJoaWRlTG9jYXRpb24iOnRydWUsImlhdCI6MTc4NTA3NzIwMSwiZXhwIjoxNzg3NjY5MjAxfQ~O2l1jYI7kQtnWb48E_ctevvz5TbfjuHFFpanoopEoKY"}]}]';
const templateMatch = msg.match(/\[Template:\s*(.+?)\]\s*Payload:\s*([\s\S]*)/i);
if(templateMatch) {
    try {
        JSON.parse(templateMatch[2]);
        console.log("Success");
    } catch(e) {
        console.log("Error:", e.message);
    }
} else {
    console.log("No match");
}
