import React, { useState } from 'react';
import { Tags, Stamp, ListOrdered } from 'lucide-react';
import { DocumentTypeSettings } from '../components/configuration/DocumentTypeSettings';
import { VisaTypeSettings } from '../components/configuration/VisaTypeSettings';
import { CasePhaseSettings } from '../components/configuration/CasePhaseSettings';

/**
 * Configuration — one central place for module-level settings used across
 * the app (distinct from the account-level `pages/Settings.tsx`).
 *
 * Settings are grouped by the module they belong to. To add a new setting
 * type, add an entry to `SETTING_GROUPS` with its own pane component — the
 * left nav and detail pane pick it up without any other change.
 */

interface SettingTypeDef {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  Pane: React.FC;
}

interface SettingGroupDef {
  label: string;
  items: SettingTypeDef[];
}

const SETTING_GROUPS: SettingGroupDef[] = [
  {
    label: 'Case Manager',
    items: [
      {
        id: 'document-types',
        label: 'Document Types',
        description: 'The firm-wide list of document types, and which of them auto-link.',
        icon: Tags,
        Pane: DocumentTypeSettings,
      },
    ],
  },
  {
    label: 'Work Plans',
    items: [
      {
        id: 'visa-types',
        label: 'Visa Types',
        description: 'Subclasses and substreams offered on Work Plans and cases.',
        icon: Stamp,
        Pane: VisaTypeSettings,
      },
      {
        id: 'phases',
        label: 'Phases',
        description: 'The ordered phases a case moves through; tasks are grouped by phase.',
        icon: ListOrdered,
        Pane: CasePhaseSettings,
      },
    ],
  },
];

const ALL_SETTINGS = SETTING_GROUPS.flatMap(g => g.items);

const Configuration: React.FC = () => {
  const [activeId, setActiveId] = useState(ALL_SETTINGS[0].id);
  const active = ALL_SETTINGS.find(s => s.id === activeId) ?? ALL_SETTINGS[0];
  const ActivePane = active.Pane;

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper dark:bg-plate min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1200px] mx-auto">
        <div>
          <h1 className="font-serif text-[28px] md:text-[29px] font-semibold tracking-[-0.02em] text-ink dark:text-plate-ink">
            Configuration
          </h1>
          <p className="text-[13px] text-ink-soft dark:text-plate-ink-soft mt-1">
            Settings used across modules, shared by everyone in this account
          </p>
        </div>

        <div className="mt-6 bg-paper-2 dark:bg-plate-card rounded-2xl border border-ink/10 dark:border-plate-ink/15 overflow-hidden grid grid-cols-1 sm:grid-cols-[230px_1fr] min-h-[70vh]">
          {/* Mobile: a plain select instead of the left nav */}
          <div className="sm:hidden p-3 border-b border-ink/10 dark:border-plate-ink/15">
            <label htmlFor="config-setting" className="sr-only">Setting</label>
            <select
              id="config-setting"
              value={active.id}
              onChange={e => setActiveId(e.target.value)}
              className="w-full rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate px-3 py-2 text-[13px] text-ink dark:text-plate-ink"
            >
              {SETTING_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          <nav aria-label="Configuration settings" className="hidden sm:block border-r border-ink/10 dark:border-plate-ink/15 p-3 overflow-y-auto custom-scrollbar">
            {SETTING_GROUPS.map(g => (
              <div key={g.label} className="mb-3 last:mb-0">
                <div className="px-3 pt-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-faint dark:text-plate-ink-faint">
                  {g.label}
                </div>
                <div className="space-y-1">
                  {g.items.map(s => {
                    const Icon = s.icon;
                    const isActive = s.id === active.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiveId(s.id)}
                        aria-current={isActive ? 'page' : undefined}
                        title={s.description}
                        className={`focus-ring w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                          isActive
                            ? 'bg-edamame/[0.08] dark:bg-edamame/[0.12] text-edamame-700 dark:text-edamame-400'
                            : 'text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate'
                        }`}
                      >
                        <Icon size={14} className="mt-0.5 flex-shrink-0" />
                        <span className="text-[12.5px] font-bold leading-tight">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <section aria-label={active.label} className="min-h-0 overflow-y-auto custom-scrollbar p-5">
            <ActivePane />
          </section>
        </div>
      </div>
    </div>
  );
};

export default Configuration;
