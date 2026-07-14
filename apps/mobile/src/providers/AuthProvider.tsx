import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';

import { firebaseAuth } from '@/config/firebase';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOutUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setInitializing(false);
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(
      firebaseAuth,
      email.trim().toLowerCase(),
      password
    );
  }, []);

  const signOutUser = useCallback(async () => {
    await signOut(firebaseAuth);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, signIn, signOutUser }),
    [initializing, signIn, signOutUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
