import React, { useState } from 'react';
import { HardDrive, RefreshCw, AlertTriangle } from 'lucide-react';
import { LogoBrand } from '@/components/LogoBrand';
import type { FolderStatus } from '@/contexts/LocalFolderContext';

interface LinkFolderGateProps {
  status: FolderStatus;
  supported: boolean;
  linkedFolderName: string | null;
  onLink: () => Promise<void>;
  onReconnect: () => Promise<void>;
}

export const LinkFolderGate: React.FC<LinkFolderGateProps> = ({ status, supported, linkedFolderName, onLink, onReconnect }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      // AbortError = user cancelled the picker — not a real error.
      if ((e as Error)?.name !== 'AbortError') {
        setError('Could not access that folder. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <LogoBrand />
        </div>

        <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-5 bg-edamame-500 text-white">
          <HardDrive className="w-7 h-7" />
        </div>

        {!supported ? (
          <>
            <h1 className="font-ibm-sans text-xl font-medium text-gray-900 dark:text-white mb-2">
              Browser not supported
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Local storage mode needs the File System Access API, currently only available in Chrome and Edge.
              Please switch browsers to continue.
            </p>
          </>
        ) : status === 'needs-permission' ? (
          <>
            <h1 className="font-ibm-sans text-xl font-medium text-gray-900 dark:text-white mb-2">
              Reconnect your data folder
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {linkedFolderName ? <>Your browser needs permission to access <strong>{linkedFolderName}</strong> again.</> : 'Your browser needs permission to access your linked folder again.'}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(onReconnect)}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw size={18} className={busy ? 'animate-spin' : ''} />
              Reconnect
            </button>
          </>
        ) : (
          <>
            <h1 className="font-ibm-sans text-xl font-medium text-gray-900 dark:text-white mb-2">
              Link your data folder
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Choose a folder on this device — your clients, cases, and tasks will be stored there as files. Put it
              inside Dropbox, OneDrive, or iCloud Drive to keep it in sync across your machines.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(onLink)}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-base font-medium bg-edamame-500 hover:bg-edamame-600 text-white shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            >
              <HardDrive size={18} />
              Choose Folder
            </button>
          </>
        )}

        {error && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle size={14} />
            {error}
          </p>
        )}
      </div>
    </div>
  );
};
