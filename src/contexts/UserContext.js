import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { REGRID_BATCH_REPORTS_ENABLED } from '../config/featureFlags';
import { fetchSavedMapsSummaries, invalidateSavedMapsCache } from '../utils/savedMapsCache';

const UserContext = createContext(null);

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [role, setRole] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [hasUserChangedSettings, setHasUserChangedSettings] = useState(false);
  
  const [highlightSettings, setHighlightSettings] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // User authentication with real-time subscription updates
  useEffect(() => {
    let unsubscribeAuth = null;
    let unsubscribeFirestore = null;

    unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('🔐 onAuthStateChanged fired:', firebaseUser ? firebaseUser.email : 'null');
      
      if (firebaseUser) {
        setUser(firebaseUser);
        fetchSavedMapsSummaries(firebaseUser).catch(() => {});

        // Clean up any existing Firestore listener
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
        }
        
        console.log('📖 Setting up Firestore listener for user:', firebaseUser.uid);
        
        // Set loading to false immediately so navigation isn't blocked
        // Firestore will load in the background
        setLoading(false);
        
        // Set up real-time listener for user document updates
        // Add timeout to prevent hanging in native apps
        const firestoreTimeout = setTimeout(() => {
          console.warn('⚠️ Firestore listener timeout - setting defaults and continuing');
          setSubscriptionStatus('none');
          setHighlightSettings({
            fillColor: 'rgba(255, 0, 0, 0.25)',
            fillOutlineColor: '#FF0000',
            lineColor: '#FF0000',
            fillOpacity: 1,
            lineWidth: 3,
          });
        }, 5000); // 5 second timeout for Firestore
        
        unsubscribeFirestore = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (userDoc) => {
            clearTimeout(firestoreTimeout);
            console.log('🔄 Real-time update received');
            if (userDoc.exists()) {
              const data = userDoc.data();
              console.log('🔄 Subscription status update:', data.subscriptionStatus);
              setSubscriptionStatus(data.subscriptionStatus || 'none');
              setRole(data.role || 'none');
              setUserProfile({
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                contactPhone: data.contactPhone || '',
                contactEmail: data.contactEmail || '',
                profilePhotoUrl: data.profilePhotoUrl || '',
                firmLogoUrl: data.firmLogoUrl || '',
              });
              
              // 🎯 Load highlight settings if they exist, otherwise use defaults
              if (data.highlightSettings) {
                console.log('🎨 Loading saved highlight settings:', data.highlightSettings);
                setHighlightSettings(data.highlightSettings);
                setHasUserChangedSettings(true);
              } else {
                // 🎯 Only set defaults if no custom settings exist
                console.log('🎨 No custom settings found, using defaults');
                setHighlightSettings({
                  fillColor: 'rgba(255, 0, 0, 0.25)',
                  fillOutlineColor: '#FF0000',
                  lineColor: '#FF0000',
                  fillOpacity: 1,
                  lineWidth: 3,
                });
                setHasUserChangedSettings(false);
              }
            } else {
              clearTimeout(firestoreTimeout);
              setSubscriptionStatus('none');
              setUserProfile(null);
              // 🎯 Set defaults for new users
              setHighlightSettings({
                fillColor: 'rgba(255, 0, 0, 0.25)',
                fillOutlineColor: '#FF0000',
                lineColor: '#FF0000',
                fillOpacity: 1,
                lineWidth: 3,
              });
            }
          },
          (error) => {
            clearTimeout(firestoreTimeout);
            console.error('❌ Firestore error:', error.code, error.message);
            setSubscriptionStatus('none');
            // 🎯 Set defaults on error
            setHighlightSettings({
              fillColor: 'rgba(255, 0, 0, 0.25)',
              fillOutlineColor: '#FF0000',
              lineColor: '#FF0000',
              fillOpacity: 1,
              lineWidth: 3,
            });
          }
        );
      } else {
        invalidateSavedMapsCache();
        setUser(null);
        setSubscriptionStatus(null);
        setRole(null);
        setHighlightSettings(null);
        setUserProfile(null);
        setLoading(false);
      }
    });
    
    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, []);

  // 🎨 Create a custom setter that marks settings as changed and saves to Firebase
  const setHighlightSettingsWithTracking = async (newSettings) => {
    setHasUserChangedSettings(true);
    setHighlightSettings(newSettings);
    
    // Save to Firebase if user is logged in
    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid), {
          highlightSettings: newSettings
        }, { merge: true }); // merge: true preserves other user data
        console.log('🎨 Highlight settings saved to Firebase:', newSettings);
      } catch (error) {
        console.error('❌ Error saving highlight settings to Firebase:', error);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      invalidateSavedMapsCache();
      setUser(null);
      console.log("User successfully signed out");
    } catch (error) {
      console.error("Error signing out:", error.message);
    }
  };

  // Delete account completely from Firebase (Auth, Firestore, Stripe)
  const deleteAccount = async () => {
    if (!user) {
      console.error("❌ Delete account attempted without user");
      throw new Error("No user logged in");
    }

    console.log("🗑️ Starting account deletion for user:", user.uid, user.email);

    try {
      // Call Firebase function to handle account deletion server-side
      // This bypasses the "requires-recent-login" error
      const functions = getFunctions();
      console.log("📞 Calling deleteAccount function...");
      
      const deleteAccountFunction = httpsCallable(functions, "deleteAccount");
      console.log("📞 Function callable created, calling now...");
      
      const result = await deleteAccountFunction({});
      console.log("✅ Account deletion result:", result);
      console.log("✅ Account deletion result data:", result.data);

      // Clear local state after successful deletion
      console.log("🧹 Clearing local state...");
      setUser(null);
      setSubscriptionStatus(null);
      setRole(null);
      setHighlightSettings(null);
      
      // The function handles Firebase Auth deletion, so user will be signed out automatically
      // But we'll also sign out locally to be safe
      try {
        console.log("🔓 Signing out locally...");
        await signOut(auth);
        console.log("✅ Signed out successfully");
      } catch (signOutError) {
        // User might already be deleted, so signOut might fail - that's OK
        console.log("⚠️ Sign out after deletion (user may already be deleted):", signOutError);
      }

      return result.data;
    } catch (error) {
      console.error("❌ Error deleting account - Full error object:", error);
      console.error("❌ Error code:", error.code);
      console.error("❌ Error message:", error.message);
      console.error("❌ Error details:", error.details);
      
      // Extract more detailed error message
      let errorMessage = "Failed to delete account";
      
      if (error.code) {
        errorMessage += ` (${error.code})`;
      }
      
      if (error.message) {
        // If it's a Firebase function error, the message might be in error.message
        if (error.message !== "internal") {
          errorMessage += `: ${error.message}`;
        } else {
          // Try to get more details from error.details
          if (error.details) {
            errorMessage += `: ${JSON.stringify(error.details)}`;
          } else {
            errorMessage += ": Internal server error. Please check the Firebase function logs.";
          }
        }
      }
      
      // Create a more descriptive error
      const detailedError = new Error(errorMessage);
      detailedError.code = error.code;
      detailedError.details = error.details;
      detailedError.originalError = error;
      
      throw detailedError;
    }
  };

  // Helper function to check if user has access to a feature
  const hasAccessToFeature = (featureName) => {
    const reportFeatures = ['reports', 'unlimited_reports'];
    if (!REGRID_BATCH_REPORTS_ENABLED && reportFeatures.includes(featureName)) {
      return false;
    }

    // Features available to all paid users
    const basicFeatures = ['search', 'map_view', 'basic_search'];
    
    // Features only available to Plus users
    const plusOnlyFeatures = ['advanced_search', 'reports', 'print_maps', 'unlimited_reports', 'unlimited_print', 'export_formats', 'mailing_address_search', 'priority_support'];
    
    // No subscription
    if (!subscriptionStatus || subscriptionStatus === 'none') {
      return false;
    }
    
    // Regular tier: Only basic features, NO reports, print, or advanced search
    if (subscriptionStatus === 'regular') {
      return basicFeatures.includes(featureName);
    }
    
    // Plus and legacy active users: All features
    if (subscriptionStatus === 'plus' || subscriptionStatus === 'active') {
      return true;
    }
    
    return false;
  };

  return (
    <UserContext.Provider value={{ 
      user, 
      subscriptionStatus, 
      role, 
      loading, 
      logout,
      deleteAccount,
      highlightSettings, 
      setHighlightSettings: setHighlightSettingsWithTracking,
      userProfile,
      hasAccessToFeature
    }}>
      {children}
    </UserContext.Provider>
  );
}
