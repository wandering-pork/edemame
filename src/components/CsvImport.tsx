import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { Upload, X, ArrowRight, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { Client } from '../types';

interface CsvImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (clients: Client[]) => void;
}

type Step = 'upload' | 'preview' | 'map' | 'done';

const CLIENT_FIELDS = [
  { key: 'name', label: 'Full Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'dob', label: 'Date of Birth', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'address', label: 'Address', required: false },
  { key: 'passportNumber', label: 'Passport Number', required: false },
  { key: 'passportExpiry', label: 'Passport Expiry', required: false },
  { key: 'nationality', label: 'Nationality', required: false },
  { key: 'gender', label: 'Gender', required: false },
] as const;

type ClientFieldKey = (typeof CLIENT_FIELDS)[number]['key'];

export const CsvImport: React.FC<CsvImportProps> = ({ isOpen, onClose, onImport }) => {
  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<ClientFieldKey, string>>({} as Record<ClientFieldKey, string>);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMap({} as Record<ClientFieldKey, string>);
    setImportedCount(0);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parsing error: ${results.errors[0].message}`);
          return;
        }
        if (!results.meta.fields || results.meta.fields.length === 0) {
          setError('No columns found in CSV file.');
          return;
        }
        if (results.data.length === 0) {
          setError('CSV file contains no data rows.');
          return;
        }

        const headers = results.meta.fields;
        setCsvHeaders(headers);
        setCsvRows(results.data);

        // Auto-map columns by fuzzy matching header names
        const autoMap: Record<string, string> = {};
        for (const field of CLIENT_FIELDS) {
          const match = headers.find(
            (h) =>
              h.toLowerCase().replace(/[_\s-]/g, '') ===
              field.key.toLowerCase().replace(/[_\s-]/g, '') ||
              h.toLowerCase().replace(/[_\s-]/g, '').includes(field.key.toLowerCase())
          );
          if (match) {
            autoMap[field.key] = match;
          }
        }
        setColumnMap(autoMap as Record<ClientFieldKey, string>);
        setStep('preview');
      },
      error: (err) => {
        setError(`Failed to read CSV: ${err.message}`);
      },
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    multiple: false,
    onDragEnter: () => {},
    onDragOver: () => {},
    onDragLeave: () => {},
  });

  const handleImport = () => {
    if (!columnMap.name || !columnMap.email) return;

    const clients: Client[] = csvRows
      .map((row) => {
        const name = row[columnMap.name]?.trim();
        const email = row[columnMap.email]?.trim();
        if (!name || !email) return null;

        const client: Client = {
          id: uuidv4(),
          name,
          email,
          dob: columnMap.dob ? row[columnMap.dob]?.trim() || '' : '',
          phone: columnMap.phone ? row[columnMap.phone]?.trim() || '' : '',
          address: columnMap.address ? row[columnMap.address]?.trim() || '' : '',
          passportNumber: columnMap.passportNumber ? row[columnMap.passportNumber]?.trim() || undefined : undefined,
          passportExpiry: columnMap.passportExpiry ? row[columnMap.passportExpiry]?.trim() || undefined : undefined,
          nationality: columnMap.nationality ? row[columnMap.nationality]?.trim() || undefined : undefined,
          gender: columnMap.gender ? row[columnMap.gender]?.trim() || undefined : undefined,
        };
        return client;
      })
      .filter((c): c is Client => c !== null);

    onImport(clients);
    setImportedCount(clients.length);
    setStep('done');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100 dark:border-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Import Clients from CSV</h3>
          <button onClick={handleClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-2 text-xs font-medium">
          {(['upload', 'preview', 'map', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div className="flex-1 h-px bg-gray-200 dark:bg-slate-700" />}
              <div
                className={`px-2.5 py-1 rounded-full capitalize ${
                  step === s
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'text-gray-400 dark:text-slate-500'
                }`}
              >
                {s === 'done' ? 'Complete' : s}
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* UPLOAD STEP */}
          {step === 'upload' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                  : 'border-gray-300 dark:border-slate-700 hover:border-green-400 dark:hover:border-green-600'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto mb-4 text-gray-400 dark:text-slate-500" size={40} />
              <p className="text-gray-700 dark:text-slate-300 font-medium">
                {isDragActive ? 'Drop CSV file here...' : 'Drag & drop a CSV file here'}
              </p>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">or click to browse</p>
              <p className="text-xs text-gray-400 dark:text-slate-600 mt-3">
                Expected columns: name, email, phone, dob, address, passportNumber, nationality, gender
              </p>
            </div>
          )}

          {/* PREVIEW STEP */}
          {step === 'preview' && (
            <div>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-3">
                Found <span className="font-semibold text-gray-900 dark:text-white">{csvRows.length}</span> rows and{' '}
                <span className="font-semibold text-gray-900 dark:text-white">{csvHeaders.length}</span> columns.
                Preview of first 5 rows:
              </p>
              <div className="overflow-x-auto border border-gray-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-slate-800">
                      {csvHeaders.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-400 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-slate-800">
                        {csvHeaders.map((h) => (
                          <td key={h} className="px-3 py-2 text-gray-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                            {row[h] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MAP COLUMNS STEP */}
          {step === 'map' && (
            <div>
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                Map your CSV columns to client fields. <span className="text-red-500">*</span> = required.
              </p>
              <div className="space-y-3">
                {CLIENT_FIELDS.map((field) => (
                  <div key={field.key} className="flex items-center gap-3">
                    <label className="w-40 text-sm font-medium text-gray-700 dark:text-slate-300 flex-shrink-0">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <select
                      value={columnMap[field.key] || ''}
                      onChange={(e) =>
                        setColumnMap((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">-- Skip --</option>
                      {csvHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DONE STEP */}
          {step === 'done' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <Check className="text-green-600 dark:text-green-400" size={32} />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Import Complete</h4>
              <p className="text-gray-600 dark:text-slate-400">
                Successfully imported <span className="font-semibold text-green-600 dark:text-green-400">{importedCount}</span> client
                {importedCount !== 1 ? 's' : ''}.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-between">
          <div>
            {(step === 'preview' || step === 'map') && (
              <button
                onClick={() => setStep(step === 'map' ? 'preview' : 'upload')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 'done' ? (
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 rounded-lg shadow-sm transition-colors"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                {step === 'preview' && (
                  <button
                    onClick={() => setStep('map')}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 rounded-lg shadow-sm transition-colors"
                  >
                    Map Columns
                    <ArrowRight size={14} />
                  </button>
                )}
                {step === 'map' && (
                  <button
                    onClick={handleImport}
                    disabled={!columnMap.name || !columnMap.email}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Check size={14} />
                    Import {csvRows.length} Clients
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
