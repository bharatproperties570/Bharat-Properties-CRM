import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        strictPort: true,
        warmup: {
            clientFiles: ['./src/main.jsx', './src/App.jsx'],
        },
        proxy: {
            '/api': {
                target: 'http://localhost:5002',
                changeOrigin: true
            }
        },
        hmr: {
            port: 3000
        }
    }
})
