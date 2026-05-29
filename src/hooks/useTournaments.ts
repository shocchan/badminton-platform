import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Tournament } from '../types';

export const useTournaments = () => {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTournaments = async () => {
          setLoading(true);
          console.log('[useTournaments] fetchTournaments 開始');

          const { data, error } = await supabase
            .from('tournaments')
            .select('*')
            .order('event_date', { ascending: true });

          if (error) {
                  console.error('[useTournaments] fetchTournaments エラー:', {
                            message: error.message,
                            details: error.details,
                            hint: error.hint,
                            code: error.code,
                  });
                  setError(error.message);
          } else {
                  console.log('[useTournaments] fetchTournaments 成功:', data?.length, '件');
                  setTournaments(data || []);
          }
          setLoading(false);
    };

    useEffect(() => {
          fetchTournaments();
    }, []);

    const createTournament = async (tournamentData: Omit<Tournament, 'id' | 'created_at' | 'updated_at'>) => {
          console.log('[useTournaments] createTournament 開始 (生データ):', tournamentData);

          const payload = {
                  ...tournamentData,
                  payment_required: tournamentData.payment_required ?? false,
                  payment_deadline: tournamentData.payment_deadline || null,
                  bank_account: tournamentData.bank_account?.trim() || null,
                  paypay_id: tournamentData.paypay_id?.trim() || null,
                  description: tournamentData.description?.trim() || null,
          };

          console.log('[useTournaments] INSERT 送信ペイロード:', payload);

          const { data, error } = await supabase
            .from('tournaments')
            .insert([payload])
            .select()
            .single();

          if (error) {
                  console.error('[useTournaments] INSERT エラー:', {
                            message: error.message,
                            details: error.details,
                            hint: error.hint,
                            code: error.code,
                  });
                  throw error;
          }

          console.log('[useTournaments] INSERT 成功:', data);
          await fetchTournaments();
          return data;
    };

    const updateTournament = async (id: number, tournamentData: Partial<Tournament>) => {
          console.log('[useTournaments] updateTournament 開始:', { id, tournamentData });

          const payload = {
                  ...tournamentData,
                  payment_deadline: tournamentData.payment_deadline || null,
                  bank_account: (tournamentData.bank_account as string)?.trim() || null,
                  paypay_id: (tournamentData.paypay_id as string)?.trim() || null,
                  description: (tournamentData.description as string)?.trim() || null,
                  updated_at: new Date().toISOString(),
          };

          const { data, error } = await supabase
            .from('tournaments')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

          if (error) {
                  console.error('[useTournaments] UPDATE エラー:', {
                            message: error.message,
                            details: error.details,
                            hint: error.hint,
                            code: error.code,
                  });
                  throw error;
          }

          console.log('[useTournaments] UPDATE 成功:', data);
          await fetchTournaments();
          return data;
    };

    const deleteTournament = async (id: number) => {
          console.log('[useTournaments] deleteTournament 開始:', { id });

          const { error } = await supabase
            .from('tournaments')
            .delete()
            .eq('id', id);

          if (error) {
                  console.error('[useTournaments] DELETE エラー:', {
                            message: error.message,
                            details: error.details,
                            hint: error.hint,
                            code: error.code,
                  });
                  throw error;
          }

          console.log('[useTournaments] DELETE 成功:', { id });
          await fetchTournaments();
    };

    return {
          tournaments,
          loading,
          error,
          createTournament,
          updateTournament,
          deleteTournament,
          refetch: fetchTournaments,
    };
};
