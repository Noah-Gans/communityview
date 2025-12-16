// src/index.js
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);

// Register service worker for offline functionality
// Set to false to disable service worker (useful for development with localhost tile servers)
const ENABLE_SERVICE_WORKER = false; // Disabled for localhost tile server development

if ('serviceWorker' in navigator && ENABLE_SERVICE_WORKER) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('Service Worker registration failed: ', registrationError);
      });
  });
} else if ('serviceWorker' in navigator && !ENABLE_SERVICE_WORKER) {
  // Unregister any existing service workers
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
        console.log('Service Worker unregistered for development');
      });
    });
  });
}
