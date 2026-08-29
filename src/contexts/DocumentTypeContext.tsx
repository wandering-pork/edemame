import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DocumentType } from '../types';
import { useRepositories } from './RepositoryContext';
import {
  ensureSystemDocumentTypes,
  sortDocumentTypes,
  validateDocumentTypeCode,
  validateDocumentTypeDescription,
} from '../lib/documentTypes';

interface DocumentTypeContextValue {
  /** The account's full Document Type list, in canonical category order. */
  documentTypes: DocumentType[];
  /** Fast lookup by code, for badges and auto-link. */
  byCode: Map<string, DocumentType>;
  loading: boolean;
  /** Adds a firm-defined type. Throws with a user-facing message on invalid/duplicate input. */
  addDocumentType: (input: { code: string; description: string; category: string }) => Promise<DocumentType>;
  /**
   * Edits a type. `autoLink` is editable on every row; `code`/`description`/
   * `category` are rejected on system-default rows (§3.3's lock).
   */
  updateDocumentType: (id: string, patch: Partial<Omit<DocumentType, 'id' | 'isSystemDefault'>>) => Promise<void>;
  /** Deletes a firm-defined type. System defaults are non-destructible. */
  deleteDocumentType: (id: string) => Promise<void>;
}

const DocumentTypeContext = createContext<DocumentTypeContextValue | null>(null);

/**
 * Loads (and seeds) the account's Document Type reference list once, so the
 * upload picker, the checklist badges, the generator and the Case Manager
 * Configurations panel all read the same rows without each re-fetching.
 */
export function DocumentTypeProvider({ children }: { children: React.ReactNode }) {
  const repos = useRepositories();
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ensureSystemDocumentTypes(repos.documentTypes)
      .then(types => {
        if (!cancelled) setDocumentTypes(sortDocumentTypes(types));
      })
      .catch(err => {
        // A failure here leaves every picker empty rather than crashing the
        // page — the Configurations panel surfaces the empty state.
        console.error('Failed to load Document Types:', err);
        if (!cancelled) setDocumentTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [repos.documentTypes]);

  const addDocumentType = useCallback(
    async (input: { code: string; description: string; category: string }) => {
      const code = input.code.trim().toUpperCase();
      const codeError = validateDocumentTypeCode(code, documentTypes);
      if (codeError) throw new Error(codeError);
      const descError = validateDocumentTypeDescription(input.description);
      if (descError) throw new Error(descError);
      const category = input.category.trim() || 'Other';

      const created: DocumentType = {
        id: uuidv4(),
        code,
        description: input.description.trim(),
        category,
        isSystemDefault: false,
        autoLink: false,
      };
      await repos.documentTypes.create(created);
      setDocumentTypes(prev => sortDocumentTypes([...prev, created]));
      return created;
    },
    [documentTypes, repos.documentTypes],
  );

  const updateDocumentType = useCallback(
    async (id: string, patch: Partial<Omit<DocumentType, 'id' | 'isSystemDefault'>>) => {
      const current = documentTypes.find(t => t.id === id);
      if (!current) throw new Error('That Document Type no longer exists.');

      const editsIdentity =
        (patch.code !== undefined && patch.code.trim().toUpperCase() !== current.code) ||
        (patch.description !== undefined && patch.description.trim() !== current.description) ||
        (patch.category !== undefined && patch.category.trim() !== current.category);
      if (current.isSystemDefault && editsIdentity) {
        throw new Error('System default Document Types cannot be renamed or recoded.');
      }

      const next: DocumentType = { ...current };
      if (patch.code !== undefined) {
        const code = patch.code.trim().toUpperCase();
        const codeError = validateDocumentTypeCode(code, documentTypes, id);
        if (codeError) throw new Error(codeError);
        next.code = code;
      }
      if (patch.description !== undefined) {
        const descError = validateDocumentTypeDescription(patch.description);
        if (descError) throw new Error(descError);
        next.description = patch.description.trim();
      }
      if (patch.category !== undefined) next.category = patch.category.trim() || 'Other';
      if (patch.autoLink !== undefined) next.autoLink = patch.autoLink;

      await repos.documentTypes.update(next);
      setDocumentTypes(prev => sortDocumentTypes(prev.map(t => (t.id === id ? next : t))));
    },
    [documentTypes, repos.documentTypes],
  );

  const deleteDocumentType = useCallback(
    async (id: string) => {
      const current = documentTypes.find(t => t.id === id);
      if (!current) return;
      if (current.isSystemDefault) throw new Error('System default Document Types cannot be deleted.');
      await repos.documentTypes.delete(id);
      setDocumentTypes(prev => prev.filter(t => t.id !== id));
    },
    [documentTypes, repos.documentTypes],
  );

  const value = useMemo<DocumentTypeContextValue>(
    () => ({
      documentTypes,
      byCode: new Map(documentTypes.map(t => [t.code, t])),
      loading,
      addDocumentType,
      updateDocumentType,
      deleteDocumentType,
    }),
    [documentTypes, loading, addDocumentType, updateDocumentType, deleteDocumentType],
  );

  return <DocumentTypeContext.Provider value={value}>{children}</DocumentTypeContext.Provider>;
}

export function useDocumentTypes(): DocumentTypeContextValue {
  const ctx = useContext(DocumentTypeContext);
  if (!ctx) throw new Error('useDocumentTypes must be used within DocumentTypeProvider');
  return ctx;
}
