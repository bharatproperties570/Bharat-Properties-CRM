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
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        const normalizedId = id.replace(/\\/g, '/');
                        if (normalizedId.includes('/node_modules/')) {
                            if (
                                normalizedId.includes('/node_modules/react/') ||
                                normalizedId.includes('/node_modules/react-dom/') ||
                                normalizedId.includes('/node_modules/react-router/') ||
                                normalizedId.includes('/node_modules/react-router-dom/') ||
                                normalizedId.includes('/node_modules/scheduler/')
                            ) {
                                return 'vendor-react';
                            }
                            if (normalizedId.includes('/node_modules/react-native-web/')) {
                                return 'vendor-rnw';
                            }
                            if (
                                normalizedId.includes('/node_modules/apexcharts/')
                            ) {
                                return 'vendor-apexcharts';
                            }
                            if (normalizedId.includes('/node_modules/recharts/')) {
                                return 'vendor-recharts';
                            }
                            if (
                                normalizedId.includes('/node_modules/jspdf/') ||
                                normalizedId.includes('/node_modules/jspdf-autotable/')
                            ) {
                                return 'vendor-jspdf';
                            }
                            if (normalizedId.includes('/node_modules/html2canvas/')) {
                                return 'vendor-html2canvas';
                            }
                            if (normalizedId.includes('/node_modules/pdfjs-dist/')) {
                                return 'vendor-pdfjs';
                            }
                            if (normalizedId.includes('/node_modules/framer-motion/')) {
                                return 'vendor-motion';
                            }
                            if (
                                normalizedId.includes('/node_modules/lucide-react/') ||
                                normalizedId.includes('/node_modules/sweetalert2/') ||
                                normalizedId.includes('/node_modules/react-hot-toast/')
                            ) {
                                return 'vendor-ui';
                            }
                            if (
                                normalizedId.includes('/node_modules/@tanstack/') ||
                                normalizedId.includes('/node_modules/axios/')
                            ) {
                                return 'vendor-query';
                            }
                        }
                    }
                }
            }
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
