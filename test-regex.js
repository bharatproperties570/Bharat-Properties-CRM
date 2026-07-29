const msg = '> [Template: property_match_detailed] Payload: [{"type":"header","parameters":[{"type":"document","document":{"link":"https://api.bharatproperties.co/uploads/Huda_Map_Book_KKR.pdf?v=compressed_v1","filename":"Huda_Map_Book_KKR.pdf"}}]},{"type":"body","parameters":[{"type":"text","text":"Sooraj","parameter_name":"full_name"},{"type":"text","text":"Plot (Ordinary) | 8 Marla (215.28 Sq Yd) | Sector 8 Kurukshetra | Direction-East | Road 9 Mtr (30 Feet) Wide | Facing T Point | ₹1.85 Cr","parameter_name":"property_list_dtl"}]},{"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9~eyJsZWFkSWQiOiI2OWRkMjUwZjQ4ODBhYjczYzVmOGQyYTkiLCJzb3VyY2UiOiJ3YV9tYXRjaF9jZW50cmUiLCJwcm9wZXJ0aWVzIjpbeyJpZCI6IjZhNGZhOGMxNjk4MDc3NWY1MWRhY2MxMyIsIm5hbWUiOlsiU2VjdG9yIDMgS3VydWtzaGV0cmEiLCJTZWN0b3IgNCBLdXJ1a3NoZXRyYSIsIlNlY3RvciA4IEt1cnVrc2hldHJhIl0sImJsb2NrIjoiU2Vjb25kIEJsb2NrIiwidW5pdCI6IiJ9XSwiaGlkZVByaWNlIjpmYWxzZSwiaGlkZVVuaXQiOnRydWUsImhpZGVMb2NhdGlvbiI6dHJ1ZSwiaWF0IjoxNzg1MDc3MjUxLCJleHAiOjE3ODc2NjkyNTF9~EJ5MYceh5MJ3xUCrvuTtUjb0hhWJWeLX9dHgnaGHnSg"}]}]';
const templateMatch = msg.match(/\[Template:\s*(.+?)\]\s*Payload:\s*(.*)/i);
if (templateMatch) {
    try {
        const payload = JSON.parse(templateMatch[2]);
        const bodyComponent = payload.find(c => c.type === 'body');
        if (bodyComponent && bodyComponent.parameters) {
            console.log("SUCCESS!");
        } else {
            console.log("No body component");
        }
    } catch (e) {
        console.error("Parse Error:", e.message);
    }
} else {
    console.log("No Match");
}
