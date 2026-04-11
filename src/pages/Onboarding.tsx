import React, { useState } from 'react';
import { HardDrive, Cloud } from 'lucide-react';
import { LogoBrand } from '@/components/LogoBrand';
import type { StorageMode } from '../types';

interface OnboardingProps {
  onComplete: (mode: StorageMode) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [selected, setSelected] = useState<StorageMode | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <LogoBrand />
        </div>

        {/* Heading */}
        <div className="text-center mb-10">
          <h1 className="font-ibm-sans text-3xl font-semibold text-gray-900 dark:text-white mb-3">
            Welcome to Edamame
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Choose how you'd like to store your data to get started.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {/* Local Storage Card */}
          <button
            type="button"
            onClick={() => setSelected('local')}
            className={`relative flex flex-col items-center text-center rounded-2xl border-2 p-8 transition-all duration-200 cursor-pointer
              ${
                selected === 'local'
                  ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-950 shadow-lg ring-2 ring-edamame-500/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-edamame-300 dark:hover:border-edamame-700 hover:shadow-md'
              }`}
          >
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors duration-200
                ${
                  selected === 'local'
                    ? 'bg-edamame-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
            >
              <HardDrive className="w-7 h-7" />
            </div>
            <h2 className="font-ibm-sans text-xl font-medium text-gray-900 dark:text-white mb-2">
              Local Storage
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              All data stays on this device. No account required. Full privacy compliance.
            </p>
            {selected === 'local' && (
              <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-edamame-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>

          {/* Cloud Storage Card */}
          <button
            type="button"
            onClick={() => setSelected('cloud')}
            className={`relative flex flex-col items-center text-center rounded-2xl border-2 p-8 transition-all duration-200 cursor-pointer
              ${
                selected === 'cloud'
                  ? 'border-edamame-500 bg-edamame-50 dark:bg-edamame-950 shadow-lg ring-2 ring-edamame-500/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-edamame-300 dark:hover:border-edamame-700 hover:shadow-md'
              }`}
          >
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors duration-200
                ${
                  selected === 'cloud'
                    ? 'bg-edamame-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
            >
              <Cloud className="w-7 h-7" />
            </div>
            <h2 className="font-ibm-sans text-xl font-medium text-gray-900 dark:text-white mb-2">
              Cloud Storage
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              Multi-device access. Team collaboration. Requires account.
            </p>
            {selected === 'cloud' && (
              <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-edamame-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        </div>

        {/* Continue Button */}
        <div className="flex justify-center">
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onComplete(selected)}
            className={`px-10 py-3 rounded-xl text-base font-medium transition-all duration-200
              ${
                selected
                  ? 'bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg cursor-pointer'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
          >
            Continue
          </button>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-8">
          You can change this later in Settings.
        </p>
      </div>
    </div>
  );
}
