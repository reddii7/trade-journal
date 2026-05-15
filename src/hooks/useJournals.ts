import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Journal } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

export function useJournals() {
  const { user } = useAuth();
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('journals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
      .then(({ data }) => {
        setJournals((data as Journal[]) || []);
        setLoading(false);
      });
  }, [user]);

  const createJournal = async (name: string, description?: string, color?: string) => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('journals')
      .insert({ user_id: user.id, name, description, color })
      .select()
      .single();
    if (error) throw error;
    setJournals((prev) => [...prev, data as Journal]);
    return data as Journal;
  };

  return { journals, loading, createJournal };
}

export function useTags() {
  const { user } = useAuth();
  const [tags, setTags] = useState<{ id: string; name: string; color: string; category: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('trade_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
      .then(({ data }) => setTags(data || []));
  }, [user]);

  const createTag = async (name: string, color = '#228be6', category = 'general') => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('trade_tags')
      .insert({ user_id: user.id, name, color, category })
      .select()
      .single();
    if (error) throw error;
    setTags((prev) => [...prev, data]);
    return data;
  };

  return { tags, createTag };
}
