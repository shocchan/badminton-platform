import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Tournament } from '../types';

export const useTournaments = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTournaments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('event_date', { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setTournaments(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  const createTournament = async (tournamentData: Omit<Tournament, 'id' | 'created_at' | 'updated_at'>) => {
    const { data, error } = await supabase
      .from('tournaments')
      .insert([tournamentData])
      .select()
      .single();

    if (error) throw error;
    await fetchTournaments();
    return data;
  };

  const updateTournament = async (id: number, tournamentData: Partial<Tournament>) => {
    const { data, error } = await supabase
      .from('tournaments')
      .update({ ...tournamentData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await fetchTournaments();
    return data;
  };

  const deleteTournament = async (id: number) => {
    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    await fetchTournaments();
  };

  return { tournaments, loading, error, createTournament, updateTournament, deleteTournament, refetch: fetchTournaments };
};
