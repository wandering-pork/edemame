import React, { useState, useEffect } from 'react';
import { Theme } from '../types';
import { Moon, Sun, Monitor, Save, Check, Palette } from 'lucide-react';

interface SettingsProps {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}

export const Settings: React.FC<SettingsProps> = ({ currentTheme, onThemeChange }) => {
  const [selectedTheme, setSelectedTheme] = useState<Theme>(currentTheme);
  const [hasChanges, setHasChanges] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelectedTheme(currentTheme);
  }, [currentTheme]);

  const handleSelect = (theme: Theme) => {
    setSelectedTheme(theme);
    setHasChanges(theme !== currentTheme);
    setSaved(false);
  };

  const handleSave = () => {
    onThemeChange(selectedTheme);
    setHasChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white font-ibm-serif tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Customize your workspace appearance.
          </p>
        </div>

        {/* Appearance section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-600 dark:text-edamame-400 flex items-center justify-center">
              <Palette size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Appearance</h2>
              <p className="text-xs text-gray-400 dark:text-slate-500">Choose how the interface looks.</p>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Classic Light */}
              <button
                onClick={() => handleSelect('classic')}
                className={`group relative rounded-2xl border-2 text-left transition-all duration-200 overflow-hidden ${
                  selectedTheme === 'classic'
                    ? 'border-edamame shadow-lg shadow-edamame/15 ring-2 ring-edamame/20'
                    : 'border-gray-200 dark:border-slate-700 hover:border-edamame/40 dark:hover:border-edamame/30'
                }`}
              >
                {/* Preview area */}
                <div className="h-36 bg-gradient-to-br from-gray-50 to-gray-100 p-4 pointer-events-none">
                  {/* Mock sidebar */}
                  <div className="flex gap-2 h-full">
                    <div className="w-14 bg-edamame rounded-xl flex flex-col gap-1.5 p-2">
                      <div className="h-2 w-8 bg-white/30 rounded" />
                      <div className="h-1.5 w-6 bg-white/20 rounded" />
                      <div className="h-1.5 w-10 bg-white/20 rounded mt-1" />
                      <div className="h-1.5 w-8 bg-white/20 rounded" />
                      <div className="h-1.5 w-7 bg-white/20 rounded" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="h-2.5 w-24 bg-gray-300 rounded" />
                      <div className="flex gap-1.5">
                        {[1,2,3].map(i => (
                          <div key={i} className="flex-1 bg-white rounded-lg h-12 shadow-sm border border-gray-200 p-1.5">
                            <div className="h-1 w-6 bg-edamame/30 rounded mb-1" />
                            <div className="h-2 w-4 bg-gray-300 rounded" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <Sun size={16} className="text-amber-500" />
                    <span className="font-semibold text-sm text-gray-900">Classic Light</span>
                  </div>
                  {selectedTheme === 'classic' && (
                    <div className="w-5 h-5 bg-edamame rounded-full flex items-center justify-center">
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </div>
                  )}
                </div>
              </button>

              {/* Dark Mode */}
              <button
                onClick={() => handleSelect('dark')}
                className={`group relative rounded-2xl border-2 text-left transition-all duration-200 overflow-hidden ${
                  selectedTheme === 'dark'
                    ? 'border-edamame shadow-lg shadow-edamame/15 ring-2 ring-edamame/20'
                    : 'border-gray-200 dark:border-slate-700 hover:border-edamame/40 dark:hover:border-edamame/30'
                }`}
              >
                {/* Preview area */}
                <div className="h-36 bg-gradient-to-br from-slate-900 to-slate-950 p-4 pointer-events-none">
                  <div className="flex gap-2 h-full">
                    <div className="w-14 bg-edamame/70 rounded-xl flex flex-col gap-1.5 p-2">
                      <div className="h-2 w-8 bg-white/20 rounded" />
                      <div className="h-1.5 w-6 bg-white/10 rounded" />
                      <div className="h-1.5 w-10 bg-white/15 rounded mt-1" />
                      <div className="h-1.5 w-8 bg-white/10 rounded" />
                      <div className="h-1.5 w-7 bg-white/10 rounded" />
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="h-2.5 w-24 bg-slate-600 rounded" />
                      <div className="flex gap-1.5">
                        {[1,2,3].map(i => (
                          <div key={i} className="flex-1 bg-slate-800 rounded-lg h-12 border border-slate-700 p-1.5">
                            <div className="h-1 w-6 bg-edamame/40 rounded mb-1" />
                            <div className="h-2 w-4 bg-slate-600 rounded" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 flex items-center justify-between bg-slate-900 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <Moon size={16} className="text-indigo-400" />
                    <span className="font-semibold text-sm text-slate-200">Dark Mode</span>
                  </div>
                  {selectedTheme === 'dark' && (
                    <div className="w-5 h-5 bg-edamame rounded-full flex items-center justify-center">
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-slate-900/60 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
            {saved ? (
              <span className="text-xs font-semibold text-edamame-600 dark:text-edamame-400 flex items-center gap-1.5">
                <Check size={13} />
                Saved successfully
              </span>
            ) : (
              <span className="text-xs text-gray-400 dark:text-slate-600">
                {hasChanges ? 'You have unsaved changes.' : 'All changes saved.'}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={`btn-press flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                hasChanges
                  ? 'bg-edamame hover:bg-edamame-600 text-white shadow-md shadow-edamame/20'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600 cursor-not-allowed'
              }`}
            >
              <Save size={15} />
              Save Changes
            </button>
          </div>
        </div>

        {/* App info */}
        <div className="mt-6 px-2">
          <p className="text-xs text-gray-400 dark:text-slate-700 text-center">
            Edamame Legal Flow · Built for AU/NZ Immigration Practitioners
          </p>
        </div>
      </div>
    </div>
  );
};
