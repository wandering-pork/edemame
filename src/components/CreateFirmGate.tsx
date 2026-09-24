import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { LogoBrand } from '@/components/LogoBrand';
import { useFirm } from '@/contexts/FirmContext';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Shown to a cloud-mode user with no firm yet (Step 1 · 1F). Firms are
 * created here rather than inline in pages/Onboarding.tsx because a firm is
 * required before any cloud repository can be constructed — see
 * App.tsx's CloudAppGate. A user who instead has a pending invite accepts it
 * from the emailed link (/invite/:token — see pages/InviteAccept.tsx), which
 * sets profiles.current_firm_id and short-circuits this gate on next load.
 */
export const CreateFirmGate: React.FC = () => {
  const { createFirm } = useFirm();
  const { signOut } = useAuth();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createFirm(name.trim());
      // No further navigation needed: createFirm() refetches the profile,
      // FirmContext reloads, and CloudAppGate re-renders past this gate.
    } catch (err) {
      console.error('Failed to create firm:', err);
      setError('Could not create your firm. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-plate flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <LogoBrand />
        </div>
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-edamame-500 text-white flex items-center justify-center mx-auto mb-5">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="font-ibm-sans text-2xl font-semibold text-ink dark:text-plate-ink mb-2">
            Create your firm
          </h1>
          <p className="text-ink-soft dark:text-plate-ink-soft text-sm">
            Cloud storage is shared across your firm's team. Give it a name to get started — you can invite
            colleagues afterwards from Team Members.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ink-soft dark:text-plate-ink-soft mb-2">Firm name</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Chen Migration Lawyers"
              className="focus-ring w-full px-4 py-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink outline-none transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className={`w-full px-6 py-3 rounded-xl text-base font-medium transition-all duration-200 ${
              name.trim() && !submitting
                ? 'bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg cursor-pointer'
                : 'bg-paper-2 dark:bg-plate-card text-ink-faint dark:text-plate-ink-faint cursor-not-allowed'
            }`}
          >
            {submitting ? 'Creating...' : 'Create firm'}
          </button>
        </form>

        <p className="text-center text-xs text-ink-faint dark:text-plate-ink-faint mt-6">
          Expecting a colleague's invite instead? Open the link from your invite email — it'll bring you here
          automatically once you're signed in.
        </p>
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => signOut()}
            className="text-xs text-ink-faint dark:text-plate-ink-faint hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
