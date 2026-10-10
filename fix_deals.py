with open('test_imports.js', 'r') as f:
    content = f.read()

content = content.replace('queryFn: async () => { ... },', '''queryFn: async () => {
            const res = await api.get('/deals', { params });
            return res.data;
        },''')

with open('test_imports.js', 'w') as f:
    f.write(content)
