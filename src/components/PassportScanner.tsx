import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { X, Upload, CheckCircle, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';
import { scanPassport, PassportOcrResult } from '../services/ocrService';

interface PassportScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onResult: (data: {
    name: string;
    dob: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
    gender: string;
  }) => void;
}

type Stage = 'upload' | 'processing' | 'results' | 'error';

const statusMessages: Record<number, string> = {
  0: 'Preparing image...',
  5: 'Preprocessing passport image...',
  10: 'Loading OCR engine...',
  30: 'Scanning passport...',
  75: 'Extracting MRZ data...',
  85: 'Parsing machine-readable zone...',
  95: 'Validating fields...',
  100: 'Complete!',
};

function getStatusMessage(progress: number): string {
  const thresholds = Object.keys(statusMessages)
    .map(Number)
    .sort((a, b) => b - a);
  for (const t of thresholds) {
    if (progress >= t) return statusMessages[t];
  }
  return 'Processing...';
}

export const PassportScanner: React.FC<PassportScannerProps> = ({
  isOpen,
  onClose,
  onResult,
}) => {
  const [stage, setStage] = useState<Stage>('upload');
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [result, setResult] = useState<PassportOcrResult | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [hasUsedBefore] = useState(() => {
    try {
      return localStorage.getItem('edamame_ocr_used') === 'true';
    } catch {
      return false;
    }
  });

  const handleProgress = useCallback((p: number) => {
    setProgress(p);
    setStatusMsg(getStatusMessage(p));
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      setStage('processing');
      setProgress(0);
      setStatusMsg('Preparing image...');

      const ocrResult = await scanPassport(file, handleProgress);

      // Mark as used for the first-use note
      try {
        localStorage.setItem('edamame_ocr_used', 'true');
      } catch {
        // ignore storage errors
      }

      setResult(ocrResult);

      if (ocrResult.success && ocrResult.fields) {
        setEditedFields({
          lastName: ocrResult.fields.lastName,
          firstName: ocrResult.fields.firstName,
          dateOfBirth: ocrResult.fields.dateOfBirth,
          nationality: ocrResult.fields.nationality,
          passportNumber: ocrResult.fields.passportNumber,
          expiryDate: ocrResult.fields.expiryDate,
          gender: ocrResult.fields.gender,
        });
        setStage('results');
      } else {
        setStage('error');
      }
    },
    [handleProgress]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        processFile(acceptedFiles[0]);
      }
    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [] },
    maxFiles: 1,
    multiple: false,
  } as any);

  const handleConfirm = () => {
    const fullName = [editedFields.firstName, editedFields.lastName]
      .filter(Boolean)
      .join(' ');

    onResult({
      name: fullName,
      dob: editedFields.dateOfBirth || '',
      nationality: editedFields.nationality || '',
      passportNumber: editedFields.passportNumber || '',
      passportExpiry: editedFields.expiryDate || '',
      gender: editedFields.gender || '',
    });

    handleClose();
  };

  const handleClose = () => {
    setStage('upload');
    setProgress(0);
    setResult(null);
    setEditedFields({});
    onClose();
  };

  const handleRetry = () => {
    setStage('upload');
    setProgress(0);
    setResult(null);
    setEditedFields({});
  };

  if (!isOpen) return null;

  const fieldLabels: Record<string, string> = {
    firstName: 'First Name',
    lastName: 'Last Name',
    dateOfBirth: 'Date of Birth',
    nationality: 'Nationality',
    passportNumber: 'Passport Number',
    expiryDate: 'Expiry Date',
    gender: 'Gender',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100 dark:border-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-green-600 dark:text-green-400" />
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
              Passport Scanner
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Privacy badge */}
        <div className="mx-6 mt-4 flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          <ShieldCheck size={14} />
          <span>
            Privacy-first: all processing happens in your browser. Passport images are never sent to any server.
          </span>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload stage */}
          {stage === 'upload' && (
            <>
              {!hasUsedBefore && (
                <div className="mb-4 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  First use: the OCR engine (~45MB) will be downloaded and cached in your browser for future use.
                </div>
              )}

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                    : 'border-gray-300 dark:border-slate-700 hover:border-green-400 dark:hover:border-green-600 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload
                  size={36}
                  className="mx-auto mb-3 text-gray-400 dark:text-slate-500"
                />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {isDragActive
                    ? 'Drop your passport image here'
                    : 'Drag & drop a passport image, or click to browse'}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  Supports JPG and PNG files
                </p>
              </div>
            </>
          )}

          {/* Processing stage */}
          {stage === 'processing' && (
            <div className="py-8 text-center">
              <Loader2
                size={40}
                className="mx-auto mb-4 text-green-600 dark:text-green-400 animate-spin"
              />
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-4">
                {statusMsg}
              </p>
              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="h-2.5 rounded-full bg-green-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                {progress}%
              </p>
            </div>
          )}

          {/* Results stage */}
          {stage === 'results' && result?.fields && (
            <div className="space-y-3 max-h-[55vh] overflow-y-auto">
              {Object.entries(fieldLabels).map(([key, label]) => {
                const isValid = result.validationFlags?.[key] ?? null;
                const isDateField = key === 'dateOfBirth' || key === 'expiryDate';
                const isGenderField = key === 'gender';

                return (
                  <div key={key}>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 mb-1 uppercase">
                      {label}
                      {isValid === true && (
                        <CheckCircle
                          size={12}
                          className="text-green-500"
                          aria-label="Validated"
                        />
                      )}
                      {isValid === false && (
                        <AlertTriangle
                          size={12}
                          className="text-amber-500"
                          aria-label="Unvalidated"
                        />
                      )}
                    </label>
                    {isGenderField ? (
                      <select
                        value={editedFields[key] || ''}
                        onChange={(e) =>
                          setEditedFields((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none text-sm"
                      >
                        <option value="">-- Select --</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <input
                        type={isDateField ? 'date' : 'text'}
                        value={editedFields[key] || ''}
                        onChange={(e) =>
                          setEditedFields((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none text-sm"
                      />
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-slate-500">
                <CheckCircle size={12} className="text-green-500" />
                <span>MRZ check digit validated</span>
                <span className="mx-1">|</span>
                <AlertTriangle size={12} className="text-amber-500" />
                <span>Needs manual verification</span>
              </div>
            </div>
          )}

          {/* Error stage */}
          {stage === 'error' && (
            <div className="py-6 text-center">
              <AlertTriangle
                size={36}
                className="mx-auto mb-3 text-amber-500"
              />
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Could not extract passport data
              </p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                <span className="block mb-2">The image may be blurry, poorly lit, or at an angle.</span>
                <span className="block">Try again with a clear photo, or fill in details manually below.</span>
              </p>
              {result?.error && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 mb-4 text-left">
                  {result.error}
                </p>
              )}
              {result?.rawText && (
                <details className="text-left mb-4">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 dark:hover:text-slate-300 font-medium">
                    📋 Show extracted text (for debugging)
                  </summary>
                  <pre className="mt-2 text-xs bg-gray-50 dark:bg-slate-800 p-3 rounded-lg overflow-auto max-h-32 text-gray-600 dark:text-slate-400 whitespace-pre-wrap border border-gray-200 dark:border-slate-700">
                    {result.rawText}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2">
          {stage === 'error' && (
            <>
              <button
                onClick={() => {
                  // Close scanner and let user fill form manually
                  handleClose();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-edamame hover:bg-edamame-600 rounded-lg transition-colors"
              >
                Continue with Manual Entry
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </>
          )}
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {stage === 'results' && (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 rounded-lg shadow-sm transition-colors"
            >
              Confirm & Fill Form
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
