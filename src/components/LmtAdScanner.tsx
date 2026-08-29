import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertTriangle, Loader2, Megaphone, Sparkles, Upload, X } from 'lucide-react';
import { scanLmtEvidence } from '../services/lmtOcrService';
import { adDurationDays, LMT_MIN_AD_DAYS } from '../lib/lmt';
import { CASE_FILES_MAX_BYTES } from '../lib/supportedFormats';
import type { LmtAdRecord } from '../types';

export interface LmtAdDraft {
  platform: string;
  startDate: string;
  endDate: string;
  notes?: string;
  extractedByAi?: boolean;
}

interface LmtAdScannerProps {
  /** Pass a record to edit it; omit to add a new one. */
  existing?: LmtAdRecord;
  onClose: () => void;
  /**
   * `file` is present only when the user came in through the scan flow — the
   * caller uploads it to Case Files (tagged `LMTEVD`) and links it to the
   * record it creates.
   */
  onSave: (draft: LmtAdDraft, file?: File) => Promise<void>;
}

type Stage = 'upload' | 'processing' | 'form' | 'error';

/**
 * Add or edit one LMT advertisement record (GitHub issue #31).
 *
 * The scan path mirrors `PassportScanner.tsx`: drop a file, Gemini Vision reads
 * it, and the extracted values land in an **editable** form that the user has
 * to confirm. Nothing is saved from OCR output directly — an ad's closing date
 * sets a hard nomination deadline, so a misread date is a compliance failure,
 * not a typo.
 */
export const LmtAdScanner: React.FC<LmtAdScannerProps> = ({ existing, onClose, onSave }) => {
  const [stage, setStage] = useState<Stage>(existing ? 'form' : 'upload');
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [file, setFile] = useState<File | undefined>(undefined);
  const [extractedByAi, setExtractedByAi] = useState(existing?.extractedByAi ?? false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    platform: existing?.platform ?? '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
    notes: existing?.notes ?? '',
  });

  const processFile = useCallback(async (dropped: File) => {
    setFile(dropped);
    setStage('processing');
    setProgress(0);

    const result = await scanLmtEvidence(dropped, setProgress);

    if (result.success && result.fields) {
      const { platform, startDate, endDate, positionTitle, notes } = result.fields;
      setForm({
        platform,
        startDate,
        endDate,
        notes: [positionTitle, notes].filter(Boolean).join(' — '),
      });
      setExtractedByAi(true);
      setStage('form');
    } else {
      setScanError(result.error ?? 'Could not read the advertisement.');
      setStage('error');
    }
  }, []);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) processFile(accepted[0]);
    },
    [processFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/pdf': [] },
    maxSize: CASE_FILES_MAX_BYTES,
    maxFiles: 1,
    multiple: false,
  } as any);

  const validationError = (() => {
    if (!form.platform.trim()) return 'Enter where the advertisement ran.';
    if (!form.startDate) return 'Enter the date the advertisement went live.';
    if (!form.endDate) return 'Enter the date the advertisement closed.';
    if (form.endDate < form.startDate) return 'The closing date cannot be before the start date.';
    return null;
  })();

  const durationDays = (() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate) return null;
    return adDurationDays({ startDate: form.startDate, endDate: form.endDate } as LmtAdRecord);
  })();

  const handleSave = async () => {
    if (validationError || saving) return;
    setSaving(true);
    try {
      await onSave(
        {
          platform: form.platform.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes.trim() || undefined,
          extractedByAi,
        },
        file,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame text-gray-900 dark:text-white outline-none text-sm';
  const labelCls =
    'block text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-edamame" />
            <h3 className="font-semibold text-base text-gray-900 dark:text-white">
              {existing ? 'Edit advertisement' : 'Add LMT advertisement'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {/* Upload stage */}
          {stage === 'upload' && (
            <>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-9 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-edamame bg-edamame/[0.06]'
                    : 'border-gray-300 dark:border-slate-700 hover:border-edamame dark:hover:border-edamame hover:bg-gray-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload size={32} className="mx-auto mb-3 text-gray-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {isDragActive
                    ? 'Drop the advertisement here'
                    : 'Drop a screenshot or PDF of the job ad, or click to browse'}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  The platform and advertising dates are read for you — you confirm them before saving.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStage('form')}
                className="mt-3 w-full text-center text-[12px] font-semibold text-gray-500 dark:text-slate-400 hover:text-edamame transition-colors"
              >
                Skip the scan and enter the dates manually
              </button>
            </>
          )}

          {/* Processing stage */}
          {stage === 'processing' && (
            <div className="py-8 text-center">
              <Loader2 size={36} className="mx-auto mb-4 text-edamame animate-spin" />
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-4">
                Reading the advertisement…
              </p>
              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className="h-2 rounded-full bg-edamame transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error stage */}
          {stage === 'error' && (
            <div className="py-6 text-center">
              <AlertTriangle size={32} className="mx-auto mb-3 text-amber-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Could not read the advertising dates
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                The file may be low resolution, cropped, or may not show the posting and closing dates.
                You can still record the ad by entering the dates yourself.
              </p>
              {scanError && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-left">
                  {scanError}
                </p>
              )}
            </div>
          )}

          {/* Editable confirm form */}
          {stage === 'form' && (
            <div className="space-y-3">
              {extractedByAi && (
                <div className="flex items-start gap-2 text-[11.5px] text-edamame-700 dark:text-edamame-400 bg-edamame/[0.07] border border-edamame/20 rounded-lg px-3 py-2">
                  <Sparkles size={13} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Read from the uploaded file. Check every date against the advertisement before saving —
                    the closing date sets the nomination deadline.
                  </span>
                </div>
              )}

              <div>
                <label className={labelCls}>Platform / publication</label>
                <input
                  autoFocus
                  type="text"
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  placeholder="e.g. Seek, LinkedIn, company careers page"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Ad start date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Ad closing date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              {durationDays !== null && (
                <p
                  className={`text-[11.5px] font-semibold ${
                    durationDays < LMT_MIN_AD_DAYS
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {durationDays < LMT_MIN_AD_DAYS
                    ? `Ran for ${durationDays} day${durationDays === 1 ? '' : 's'} — under the ${LMT_MIN_AD_DAYS}-day minimum.`
                    : `Ran for ${durationDays} days.`}
                </p>
              )}

              <div>
                <label className={labelCls}>Notes (optional)</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. advertised position title, salary range"
                  className={inputCls}
                />
              </div>

              {file && (
                <p className="text-[11.5px] text-gray-500 dark:text-slate-400">
                  Saving will also add <span className="font-semibold">{file.name}</span> to Case Files,
                  tagged <span className="font-mono font-bold">LMTEVD</span>, and link it to this record.
                </p>
              )}

              {validationError && (
                <p className="text-[11.5px] font-semibold text-red-600 dark:text-red-400">{validationError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2">
          {stage === 'error' && (
            <button
              onClick={() => setStage('form')}
              className="px-4 py-2 text-sm font-medium text-white bg-edamame hover:bg-edamame-600 rounded-lg transition-colors"
            >
              Enter dates manually
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {stage === 'form' && (
            <button
              onClick={handleSave}
              disabled={!!validationError || saving}
              className="px-4 py-2 text-sm font-bold text-white bg-edamame hover:bg-edamame-600 disabled:opacity-40 rounded-lg shadow-sm transition-colors"
            >
              {saving ? 'Saving…' : existing ? 'Save changes' : 'Confirm & add record'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LmtAdScanner;
