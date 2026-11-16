'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/auth';
import { ROLES, type Role } from '@/lib/role-types';

export interface Profile {
  role: Role;
  roleChosenAt: string | null;
  displayName: string | null;
}

interface ProfileContextValue {
  user: User | null;
  // Null while loading, when signed out, or if the profile couldn't be loaded.
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// Reads the signed-in user's own row (RLS allows only that). A missing row,
// e.g. if the sign-up trigger failed, is treated as a new student, matching
// getAuthedUser() on the server.
async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, role_chosen_at, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return {
    role: ROLES.includes(data?.role) ? (data!.role as Role) : 'student',
    roleChosenAt: data?.role_chosen_at ?? null,
    displayName: data?.display_name ?? null,
  };
}

interface LoadedProfile {
  userId: string;
  profile: Profile | null;
}

async function loadProfile(userId: string): Promise<LoadedProfile> {
  try {
    return { userId, profile: await fetchProfile(userId) };
  } catch (err) {
    console.error('[profile] could not load profile:', err);
    return { userId, profile: null };
  }
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id ?? null;

  // Keyed by user id so signing out or switching accounts never shows the
  // previous user's profile.
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadProfile(userId).then((result) => {
      if (!cancelled) setLoaded(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (userId) setLoaded(await loadProfile(userId));
  }, [userId]);

  const value = useMemo<ProfileContextValue>(() => {
    const isCurrent = userId !== null && loaded?.userId === userId;
    return {
      user,
      profile: isCurrent ? loaded!.profile : null,
      loading: userLoading || (userId !== null && !isCurrent),
      refreshProfile,
    };
  }, [user, userId, userLoading, loaded, refreshProfile]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used inside <ProfileProvider>');
  return context;
}
