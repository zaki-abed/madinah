import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // قوالب الحقول المشتركة مع الخادم (نفس التحقق في الطرفين).
  resolve: { alias: { '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)) } },
  server: {
    port: 5173,
    // طلبات /api تذهب إلى الخادم، فتبقى كوكي الجلسة على نفس العنوان.
    proxy: { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:3001' },
  },
});
