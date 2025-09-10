import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, getIdTokenResult } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, getUserProfile, createUserProfile } from '../lib/firebase';
import type { UserProfile } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  isAdmin?: boolean;
  isReviewer?: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  isAdmin: false,
  isReviewer: false,
});

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isAdminClaim, setIsAdminClaim] = useState(false);
  const [isReviewerClaim, setIsReviewerClaim] = useState(false);

  useEffect(() => {
    // Create a single auth state listener for the entire app
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('Auth state changed:', firebaseUser?.email);
      setUser(firebaseUser);

      if (firebaseUser) {
        setProfileLoading(true);
        try {
          // Load token claims for role gating
          try {
            const token = await getIdTokenResult(firebaseUser, true);
            const claims = token?.claims || {} as any;
            setIsAdminClaim(!!claims.admin);
            setIsReviewerClaim(!!claims.reviewer);
          } catch (e) {
            console.warn('Failed to get token claims:', e);
            setIsAdminClaim(false);
            setIsReviewerClaim(false);
          }
          // Try to get existing profile
          let userProfile = await getUserProfile(firebaseUser.uid);

          // If no profile exists, create one
          if (!userProfile) {
            console.log('Creating new profile for:', firebaseUser.email);
            userProfile = await createUserProfile(
              firebaseUser.uid,
              firebaseUser.email || '',
              firebaseUser.displayName || undefined
            );
          }

          setProfile(userProfile);
        } catch (error) {
          console.error('Error loading/creating profile:', error);
          setProfile(null);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setProfile(null);
        setProfileLoading(false);
        setIsAdminClaim(false);
        setIsReviewerClaim(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    loading,
    profileLoading,
    isAdmin: isAdminClaim,
    isReviewer: isReviewerClaim,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
