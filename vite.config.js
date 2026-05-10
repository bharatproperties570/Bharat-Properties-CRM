import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
        plugins: [react()],
        define: {
            // This ensures process.env is available for both Vite and Metro
            'process.env': env
        },
        optimizeDeps: {
            include: [],
            esbuildOptions: {
                loader: {
                    '.js': 'jsx',
                },
            },
        },
        build: {
            commonjsOptions: {
                include: [/node_modules/],
                transformMixedEsModules: true,
            },
        },
        server: {
            port: 5174,
            strictPort: true,
            warmup: {
                clientFiles: ['./src/main.jsx', './src/App.jsx'],
            },
            proxy: {
                '/api': {
                    target: 'http://localhost:4000',
                    changeOrigin: true
                }
            },
            hmr: {
                port: 5174
            }
        }
    }
})
