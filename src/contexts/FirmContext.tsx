import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Firm, FirmMemberRow, FirmRole } from '../types';
import { mapFirmDirectoryToTeamMembers } from '../lib/firmDirectory';
import type { TeamMember } from '../types';
import { useAuth } from './AuthContext';
import { useProfile } from './ProfileContext';

// Firms are cloud-only (docs/plans/step-1-foundations.md, Decisions #1): a
// linked local folder belongs to one person by construction, so local mode
// never has a firm — `useFirm()` returns firm: null there and the app
// behaves exactly as a single-user install.
const DEV_OFFLINE_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_OFFLINE_AUTH === 'true';

interface FirmContextValue {
  firm: Firm | null;
  /** null while loading, in local mode, or when the signed-in user has no firm yet (see CreateFirmGate). */
  role: FirmRole | null;
  members: FirmMemberRow[];
  /** Active members mapped to the existing TeamMember shape — see lib/firmDirectory.ts. Assignee/owner pickers read this. */
  teamMembers: TeamMember[];
  loading: boolean;
  refreshDirectory: () => Promise<void>;
  createFirm: (name: string) => Promise<string>;
}

const FirmContext = createContext<FirmContextValue | null>(null);

function rowFromRpc(r: any): FirmMemberRow {
  return {
    userId: r.user_id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    status: r.status,
    availability: r.availability,
    joinedAt: r.joined_at,
  };
}

export function FirmProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { profile, refetchProfile, updateProfile } = useProfile();
  const [firm, setFirm] = useState<Firm | null>(null);
  const [members, setMembers] = useState<FirmMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (DEV_OFFLINE_AUTH || !user || profile?.storageMode !== 'cloud') {
      setFirm(null);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let firmId = profile.currentFirmId;

      // Self-heal: a user can be a firm member (e.g. just accepted an invite
      // before ever completing onboarding) without profiles.current_firm_id
      // pointing at it yet if that update raced the row's own creation. Fall
      // back to their first active membership.
      if (!firmId) {
        const { data: membership, error: membershipErr } = await supabase
          .from('firm_members')
          .select('firm_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (membershipErr) throw membershipErr;
        if (membership?.firm_id) {
          firmId = membership.firm_id;
          try {
            await updateProfile({ currentFirmId: firmId });
          } catch (err) {
            console.error('Found an active firm membership but could not set it as current_firm_id:', err);
          }
        }
      }

      if (!firmId) {
        setFirm(null);
        setMembers([]);
        return;
      }

      const [{ data: firmRow, error: firmErr }, { data: dirRows, error: dirErr }] = await Promise.all([
        supabase.from('firms').select('id, name').eq('id', firmId).maybeSingle(),
        supabase.rpc('firm_member_directory', { f: firmId }),
      ]);
      if (firmErr) throw firmErr;
      if (dirErr) throw dirErr;

      setFirm(firmRow ? { id: firmRow.id, name: firmRow.name } : null);
      setMembers((dirRows ?? []).map(rowFromRpc));
    } catch (err) {
      console.error('Failed to load firm context:', err);
      setFirm(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile?.storageMode, profile?.currentFirmId]);

  useEffect(() => {
    load();
  }, [load]);

  const createFirm = useCallback(async (name: string): Promise<string> => {
    const { data, error } = await supabase.rpc('create_firm', { firm_name: name });
    if (error) throw error;
    await refetchProfile();
    return data as string;
  }, [refetchProfile]);

  const role = useMemo<FirmRole | null>(() => {
    if (!user) return null;
    return members.find(m => m.userId === user.id)?.role ?? null;
  }, [members, user]);

  const teamMembers = useMemo(() => mapFirmDirectoryToTeamMembers(members), [members]);

  const value = useMemo<FirmContextValue>(() => ({
    firm, role, members, teamMembers, loading, refreshDirectory: load, createFirm,
  }), [firm, role, members, teamMembers, loading, load, createFirm]);

  return <FirmContext.Provider value={value}>{children}</FirmContext.Provider>;
}

export function useFirm(): FirmContextValue {
  const ctx = useContext(FirmContext);
  if (!ctx) throw new Error('useFirm must be used within FirmProvider');
  return ctx;
}
