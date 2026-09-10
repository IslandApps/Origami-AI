import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../config/firebase';

import { syncPreferencesFromFirebase } from '../services/preferences';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Password-based accounts must verify their email before the session is
      // considered active. Re-check via reload() in case verification happened
      // in another tab since this cached user object was created.
      const isUnverifiedPasswordAccount =
        !!currentUser &&
        !currentUser.emailVerified &&
        currentUser.providerData.some((p) => p.providerId === 'password');

      if (isUnverifiedPasswordAccount) {
        try {
          await currentUser!.reload();
        } catch {
          // ignore — fall through and treat as unverified
        }
        if (!auth.currentUser || !auth.currentUser.emailVerified) {
          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }
      }

      setUser(auth.currentUser);
      setLoading(false);
      if (auth.currentUser) {
        syncPreferencesFromFirebase();
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

