import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
// Register Offline & Background Sync Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      window.addEventListener('online', () => {
        if (reg.active) {
          reg.active.postMessage({ type: 'SYNC_NOW' });
        }
      });
    }).catch(() => {});
  });
}