import re

with open('src/pages/Booking/BookingPage.jsx', 'r') as f:
    content = f.read()

content = content.replace("onSave={() => { fetchBookings(); fetchDashStats(); }}", "onSave={() => {}}")
content = content.replace("onUpdate={() => { fetchBookings(); fetchDashStats(); }}", "onUpdate={() => {}}")
content = content.replace("fetchDashStats();\n                }}", "                }}")
content = content.replace("onComplete={() => {\n                        fetchBookings();\n                        setSelectedIds([]);\n                    }}", "onComplete={() => {\n                        setSelectedIds([]);\n                    }}")

with open('src/pages/Booking/BookingPage.jsx', 'w') as f:
    f.write(content)
