import React, { useState } from 'react';
import { FileText, Image as ImageIcon, File as FileIcon, MoreVertical, AlertTriangle } from 'lucide-react';
import type { Client, Document } from '../../types';
import { DocumentUpload } from '../DocumentUpload';
import { DOHA_MAX_BYTES } from '../../lib/autoPackager';

export interface RailAlert {
  color: 'red' | 'amber' | 'blue';
  text: string;
}

const alertColor: Record<RailAlert['color'], string> = {
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  blue: 'text-blue-600 dark:text-blue-400',
};

/** MIME type used on the drag payload when dragging a Case Files row onto a Document Checklist item. */
export const CASE_FILE_DRAG_MIME = 'application/x-edamame-document-id';

function fileIconFor(fileType: string) {
  if (fileType.startsWith('image/')) return ImageIcon;
  if (fileType === 'application/pdf' || fileType.includes('wordprocessing')) return FileText;
  return FileIcon;
}

interface CaseRailProps {
  client: Client;
  applicant?: Client;
  progress: number;
  completedCount: number;
  pendingCount: number;
  alerts: RailAlert[];
  /** Case Files panel (formerly a "WORKSPACE" left-panel subsection; the "DOCS" subsection has been removed). */
  documents?: Document[];
  onOpenDocument?: (doc: Document) => void;
  /** Case id + visa subclass, needed to upload new files directly from this rail. */
  caseId: string;
  visaSubclass?: string;
  /** Called after a file finishes uploading via repos.documents.create(), so the caller can refresh its document list. */
  onDocumentUploaded?: (doc: Document) => void;
  /** CF-2: bubbled up from DocumentUpload when the user opts to compress an over-the-limit file instead of re-browsing. */
  onRequestCompress?: (files: File[]) => void;
  /** CF-4: "Remove file" action from a Case Files row's hover menu. */
  onRemoveDocument?: (doc: Document) => void;
  /** Opens the full-size "Case Files" tab — more room for browsing/actions than this rail. */
  onOpenCaseFilesTab?: () => void;
}

const RailLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-gray-400 dark:text-slate-500">{children}</div>
);

export const CaseRail: React.FC<CaseRailProps> = ({
  client,
  applicant,
  progress,
  completedCount,
  pendingCount,
  alerts,
  documents = [],
  onOpenDocument,
  caseId,
  visaSubclass,
  onDocumentUploaded,
  onRequestCompress,
  onRemoveDocument,
  onOpenCaseFilesTab,
}) => {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  return (
    <aside className="ed-rail xl:sticky xl:top-4 self-start bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm p-[18px]">
      <RailLabel>Case Info</RailLabel>

      {/* Client */}
      <div className="flex items-center gap-3 mt-3.5">
        <div className="w-9 h-9 rounded-full bg-edamame/10 dark:bg-edamame/15 text-edamame flex items-center justify-center text-xs font-bold flex-shrink-0">
          {client.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900 dark:text-white tracking-tight truncate">{client.name}</div>
          <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">DOB {client.dob}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1 mt-2.5 text-[11.5px] text-gray-500 dark:text-slate-400">
        <span className="truncate">{client.email}</span>
        <span>{client.phone}</span>
      </div>

      {applicant && applicant.id !== client.id && (
        <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-slate-800">
          <RailLabel>Applicant</RailLabel>
          <div className="flex items-center gap-2.5 mt-2.5">
            <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {applicant.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">{applicant.name}</div>
              <div className="text-[10px] text-gray-400 dark:text-slate-500">DOB {applicant.dob}</div>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <RailLabel>Progress</RailLabel>
          <span className="text-[13px] font-extrabold text-gray-900 dark:text-white">{progress}%</span>
        </div>
        <div className="h-[5px] rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden mt-2">
          <div className="progress-fill h-full bg-edamame rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-gray-400 dark:text-slate-500 mt-1.5">
          <span>{completedCount} done</span>
          <span>{pendingCount} pending</span>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-slate-800">
          <RailLabel>Alerts</RailLabel>
          <div className="mt-2 space-y-0.5">
            {alerts.map((al, i) => (
              <div key={i} className={`flex items-center gap-2 text-[11.5px] font-semibold py-1 ${alertColor[al.color]}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                {al.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Case Files — drag a row onto a Document Checklist item to link it */}
      <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <RailLabel>Case Files</RailLabel>
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-gray-400 dark:text-slate-500">{documents.length}</span>
            {onOpenCaseFilesTab && (
              <button
                type="button"
                onClick={onOpenCaseFilesTab}
                title="Open full Case Files view"
                className="text-[10px] font-bold text-edamame-600 dark:text-edamame-400 hover:underline"
              >
                Open in tab
              </button>
            )}
          </div>
        </div>
        <div className="mt-2">
          <DocumentUpload
            caseId={caseId}
            visaSubclass={visaSubclass}
            onUpload={(doc) => onDocumentUploaded?.(doc)}
            onRequestCompress={onRequestCompress}
            compact
          />
        </div>
        {documents.length === 0 ? (
          <p className="mt-2 text-[11px] text-gray-400 dark:text-slate-500 leading-relaxed">
            No files in this case yet.
          </p>
        ) : (
          <div className="mt-2 space-y-1 max-h-64 overflow-y-auto custom-scrollbar pr-0.5">
            {documents.map(doc => {
              const Icon = fileIconFor(doc.fileType);
              const oversized = doc.fileSize > DOHA_MAX_BYTES;
              return (
                <div
                  key={doc.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(CASE_FILE_DRAG_MIME, doc.id);
                    e.dataTransfer.effectAllowed = 'link';
                  }}
                  title={oversized ? 'This file is over 5MB and will be rejected by the Department of Home Affairs.' : 'Drag onto a Document Checklist item to link it'}
                  className="group relative flex items-center gap-1.5 px-1.5 py-1 rounded-md cursor-grab active:cursor-grabbing hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Icon size={12} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                  <button
                    type="button"
                    onClick={() => onOpenDocument?.(doc)}
                    className="text-[11px] text-gray-600 dark:text-slate-300 truncate group-hover:text-edamame text-left flex-1 min-w-0"
                  >
                    {doc.fileName}
                  </button>
                  {oversized && (
                    <AlertTriangle size={11} className="flex-shrink-0 text-amber-500" />
                  )}

                  {/* CF-4: hover ⋮ menu */}
                  <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(m => (m === doc.id ? null : doc.id)); }}
                      title="More actions"
                      className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-150 dark:hover:bg-slate-700"
                    >
                      <MoreVertical size={12} />
                    </button>
                    {menuOpenId === doc.id && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 top-full mt-1 z-40 w-32 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-gray-100 dark:border-slate-800 p-1">
                          <button
                            type="button"
                            onClick={() => { setMenuOpenId(null); onOpenDocument?.(doc); }}
                            className="w-full text-left px-2 py-1.5 rounded-md text-[11px] font-semibold text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            View file
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMenuOpenId(null); onRemoveDocument?.(doc); }}
                            className="w-full text-left px-2 py-1.5 rounded-md text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            Remove file
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

export default CaseRail;
