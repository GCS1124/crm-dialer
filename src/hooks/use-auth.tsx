import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { ensureProfile, signOut as signOutRequest, updateProfile } from "@/services/auth";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types/app";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  updateStatus: (status: Profile["status"]) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function hydrate(nextSession: Session | null) {
    setIsLoading(true);
    if (!nextSession?.user) {
      startTransition(() => {
        setSession(null);
        setUser(null);
        setProfile(null);
        setIsLoading(false);
      });
      return;
    }

    const nextProfile = await ensureProfile(nextSession.user);
    startTransition(() => {
      setSession(nextSession);
      setUser(nextSession.user);
      setProfile(nextProfile);
      setIsLoading(false);
    });
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      void hydrate(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      void hydrate(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function refreshProfile() {
    if (!user) return;
    const nextProfile = await ensureProfile(user);
    setProfile(nextProfile);
  }

  async function updateStatus(status: Profile["status"]) {
    if (!profile) return;
    const nextProfile = await updateProfile(profile.id, { status });
    setProfile(nextProfile);
  }

  async function signOut() {
    await signOutRequest();
  }

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      isLoading,
      refreshProfile,
      signOut,
      updateStatus,
    }),
    [isLoading, profile, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
