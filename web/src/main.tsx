import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// الخطوط محلية (بدون الاعتماد على Google Fonts): نفس الأوزان المستعملة في لوحات التصميم.
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

// الترتيب مهم: هيكل اللوحات أولاً، ثم طبقة نظام التصميم فوقه (كما في اللوحات).
import './styles/base.css';
import './styles/shell.css';
import './styles/ds-layer.css';
import './styles/shell-responsive.css';

import { App } from './App';
import { AuthProvider } from './auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
