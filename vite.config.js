import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
        plugins: [react()],
        resolve: {
            alias: {
                'react-native': 'react-native-web',
                'react': path.resolve(__dirname, 'node_modules/react'),
                'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
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
