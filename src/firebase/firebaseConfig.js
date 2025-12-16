// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, setPersistence, browserLocalPersistence, inMemoryPersistence } from "firebase/auth"; // For authentication
import { getAnalytics } from "firebase/analytics"; // Optional, for analytics
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration

// For Firebase JS SDK v7.20.0 and later, measurementId is optional

const firebaseConfig = {

    apiKey: "AIzaSyDdmELgEKKGiP-4EUqvRS0BcWEWEen_g1Y",
  
    authDomain: "tetoncountygis.firebaseapp.com",
  
    projectId: "tetoncountygis",
  
    storageBucket: "tetoncountygis.firebasestorage.app",
  
    messagingSenderId: "594232611140",
  
    appId: "1:594232611140:web:31a4f11c6d9adf12fa8711",
  
    measurementId: "G-B2SDB2WPGR"
  
  };
  
  
// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Detect native Capacitor WebView vs browser
const isNativeWebView = typeof window !== 'undefined' &&
  typeof window.Capacitor !== 'undefined' &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

// Initialize Authentication with environment-appropriate persistence
let createdAuth;
let persistencePromise;
try {
  if (isNativeWebView) {
    // In native Capacitor WebView, try browserLocalPersistence for persistence across app restarts
    // Use initializeAuth with persistence upfront, but don't wait for it to complete
    // This allows persistence to work while avoiding hangs
    try {
      createdAuth = initializeAuth(app, { 
        persistence: browserLocalPersistence 
      });
      // Set persistence promise but don't wait - it will work in background
      persistencePromise = Promise.resolve();
      console.log('🔥 Firebase Auth initialized for native WebView with initializeAuth + browserLocalPersistence');
    } catch (initError) {
      // If initializeAuth fails (e.g., auth already initialized), use getAuth + setPersistence with timeout
      console.warn('🔥 initializeAuth failed (auth may already exist), using getAuth + setPersistence:', initError);
      try {
        createdAuth = getAuth(app);
        // Try to set persistence but with a timeout - don't wait if it hangs
        persistencePromise = Promise.race([
          setPersistence(createdAuth, browserLocalPersistence)
            .then(() => {
              console.log('🔥 Firebase Auth persistence set: browserLocalPersistence (native WebView)');
            })
            .catch((persistError) => {
              console.warn('🔥 Failed to set browserLocalPersistence, falling back to inMemoryPersistence:', persistError);
              return setPersistence(createdAuth, inMemoryPersistence)
                .then(() => console.log('🔥 Firebase Auth fallback to inMemoryPersistence'));
            }),
          new Promise((resolve) => {
            setTimeout(() => {
              console.log('🔥 Persistence setup timeout - proceeding anyway (persistence may work in background)');
              resolve(undefined);
            }, 2000); // 2 second timeout - don't wait longer
          })
        ]);
        console.log('🔥 Firebase Auth using getAuth with browserLocalPersistence (with timeout protection)');
      } catch (getAuthError) {
        console.error('🔥 Both initializeAuth and getAuth failed:', getAuthError);
        // Last resort: try to get existing auth instance
        createdAuth = getAuth(app);
        persistencePromise = Promise.resolve();
      }
    }
  } else {
    // In browser, use standard auth and persistent storage
    createdAuth = getAuth(app);
    persistencePromise = setPersistence(createdAuth, browserLocalPersistence)
      .then(() => console.log('🔥 Firebase Auth persistence set: browserLocalPersistence'))
      .catch(() => setPersistence(createdAuth, inMemoryPersistence)
        .then(() => console.log('🔥 Firebase Auth persistence set: inMemoryPersistence'))
      );
  }
} catch (e) {
  // Fallback for any initialization issues
  console.error('🔥 Firebase Auth initialization error:', e);
  try {
    createdAuth = getAuth(app);
  } catch (fallbackError) {
    console.error('🔥 Even getAuth failed in fallback:', fallbackError);
    // This should never happen, but if it does, we're in trouble
    throw new Error('Failed to initialize Firebase Auth');
  }
  persistencePromise = Promise.resolve(); // Don't wait for persistence in fallback
  console.log('🔥 Firebase Auth fallback path used - proceeding without explicit persistence');
}

export const auth = createdAuth;
// Ensure authPersistenceReady always resolves, even if persistence setup fails
// For native apps using inMemoryPersistence, this should resolve immediately
// Add a timeout as a safety measure to prevent hanging indefinitely
export const authPersistenceReady = Promise.race([
  persistencePromise.catch(() => {
    console.log('🔥 Auth persistence promise rejected, but continuing');
    return undefined;
  }),
  new Promise((resolve) => {
    setTimeout(() => {
      console.log('🔥 Auth persistence timeout - proceeding without waiting (persistence will work in background)');
      resolve(undefined);
    }, 2000) // 2 second timeout - persistence operations happen in background
  })
]).catch(() => {
  console.log('🔥 Auth persistence error caught, proceeding anyway');
  return undefined;
});

// Optional: Initialize Analytics (only if you want to use it)
// Commented out for iOS compatibility
// export const analytics = getAnalytics(app);

export const db = getFirestore(app);

// Initialize Firebase Functions with error handling
let functions;
try {
  functions = getFunctions(app);
} catch (error) {
  console.error('🔥 Error initializing Firebase Functions:', error);
  // Create a dummy functions object to prevent import errors
  functions = null;
}
export { functions };

// Export the app instance for use elsewhere
export default app;