import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
        plugins: [react()],
        resolve: {
            alias: {
                'react-native': 'react-native-web',
            },
            dedupe: ['react', 'react-dom']
        },
        define: {
            // This ensures process.env is available for both Vite and Metro
            'process.env': env
        },
        optimizeDeps: {
            include: ['@googlemaps/markerclusterer'],
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
            strictPort: false,
            warmup: {
                clientFiles: ['./src/main.jsx', './src/App.jsx'],
            },
            proxy: {
                '/api': {
                    // ✅ LOCAL TESTING: Using production backend so MongoDB Atlas is always connected.
                    // Switch back to 'http://localhost:4001' once local MongoDB is configured.
                    target: 'http://localhost:4001',
                    changeOrigin: true,
                    secure: false,
                    rewrite: (path) => path.replace(/^\/api/, '/api')
                },
                '/uploads': {
                    target: 'http://localhost:4001',
                    changeOrigin: true,
                    secure: false
                }
            },
            hmr: {
                port: 5174
            }
        }
    }
})
