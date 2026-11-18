'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export async function signInWithGoogle(options?: { redirectTo?: string }) {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: options?.redirectTo ?? `${window.location.origin}/`,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function signInWithPassword(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  return await supabase.auth.signUp({ email, password });
}

