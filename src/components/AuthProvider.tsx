import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useConnection } from './ConnectionProvider';

type ProfileState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; displayName: string | null };

interface AuthContextValue {
  session: Session | null;
  /** True until the stored session is read and, when signed in, the profile is loaded. */
  loading: boolean;
  /** True when the profile could not be loaded for another reason than the connection. */
  profileFailed: boolean;
  displayName: string | null;
  /** Called after the name was saved, so screens react without a reload. */
  setDisplayName: (name: string) => void;
  /** Loads the profile again after a failure. */
  retryProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const KEY = 'profile';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { report, resolve } = useConnection();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionKnown, setSessionKnown] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });
  const userId = session?.user.id ?? null;
  const active = useRef(true);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  useEffect(() => {
    active.current = true;
    // INITIAL_SESSION arrives once the stored session (or the login link in the URL) was processed.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active.current) return;
      setSession(next);
      setSessionKnown(true);
    });
    return () => {
      active.current = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(
    async (id: string) => {
      const { data, error, status } = await supabase.from('profiles').select('display_name').eq('id', id).single();
      // A late answer for a user who signed out (or another user) must not land in state.
      if (!active.current || userIdRef.current !== id) return;
      if (error) {
        // Connection errors get the banner and keep the loading state; the banner's retry button runs this again.
        const isConnection = report(KEY, error, status, () => void loadProfile(id));
        setProfile(isConnection ? { status: 'loading' } : { status: 'error' });
        return;
      }
      resolve(KEY);
      setProfile({ status: 'ready', displayName: data.display_name as string | null });
    },
    [report, resolve],
  );

  // Keyed on the user id, not the session object: token refreshes must not reload the profile.
  useEffect(() => {
    if (!userId) {
      resolve(KEY);
      setProfile({ status: 'loading' });
      return;
    }
    setProfile({ status: 'loading' });
    void loadProfile(userId);
  }, [userId, loadProfile, resolve]);

  const setDisplayName = useCallback((name: string) => setProfile({ status: 'ready', displayName: name }), []);

  const retryProfile = useCallback(() => {
    const id = userIdRef.current;
    if (!id) return;
    setProfile({ status: 'loading' });
    void loadProfile(id);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading: !sessionKnown || (session !== null && profile.status === 'loading'),
      profileFailed: session !== null && profile.status === 'error',
      displayName: profile.status === 'ready' ? profile.displayName : null,
      setDisplayName,
      retryProfile,
    }),
    [session, sessionKnown, profile, setDisplayName, retryProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
