import React from 'react';
import { FileText, Image as ImageIcon, File as FileIcon, AlertTriangle } from 'lucide-react';
import type { Document } from '../../types';
import { CASE_FILE_DRAG_MIME } from './CaseRail';
import { DocumentTypeBadge } from '../DocumentTypePicker';
import { DOHA_MAX_BYTES } from '../../lib/autoPackager';

function fileIconFor(fileType: string) {
  if (fileType.startsWith('image/')) return ImageIcon;
  if (fileType === 'application/pdf' || fileType.includes('wordprocessing')) return FileText;
  return FileIcon;
}

/**
 * Case Files rendered as draggable rows, for the Document Checklist tab's
 * side-by-side split view (issue #4 §4.4). Each row carries the same drag
 * payload as the Case Files rail, so dropping onto a checklist item links it.
 */
export const CaseFilesDragList: React.FC<{
  documents: Document[];
  onOpenDocument?: (doc: Document) => void;
}> = ({ documents, onOpenDocument }) => {
  if (documents.length === 0) {
    return (
      <p className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint leading-relaxed text-center py-6 rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20">
        No files in this case yet.
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-[520px] overflow-y-auto custom-scrollbar pr-0.5">
      {documents.map(doc => {
        const Icon = fileIconFor(doc.fileType);
        const oversized = doc.fileSize > DOHA_MAX_BYTES;
        return (
          <div
            key={doc.id}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData(CASE_FILE_DRAG_MIME, doc.id);
              e.dataTransfer.effectAllowed = 'link';
            }}
            title="Drag onto a Document Checklist item to link it"
            className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing border border-ink/10 dark:border-plate-ink/15 hover:border-edamame/50 hover:bg-paper-2 dark:hover:bg-plate transition-colors"
          >
            <Icon size={12} className="text-ink-faint dark:text-plate-ink-faint flex-shrink-0" />
            <button
              type="button"
              onClick={() => onOpenDocument?.(doc)}
              className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft truncate group-hover:text-edamame text-left flex-1 min-w-0"
            >
              {doc.fileName}
            </button>
            {oversized && <AlertTriangle size={11} className="flex-shrink-0 text-amber-500" />}
            <DocumentTypeBadge code={doc.documentTypeCode} className="flex-shrink-0" />
          </div>
        );
      })}
    </div>
  );
};

export default CaseFilesDragList;
