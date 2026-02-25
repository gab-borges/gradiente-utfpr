import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    build: {
        outDir: 'dist',
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
    },
});
