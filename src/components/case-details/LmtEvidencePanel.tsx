import React from 'react';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Edit2,
  FileText,
  Megaphone,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';
import type { Document, LmtAdRecord } from '../../types';
import {
  adDurationDays,
  LMT_MIN_AD_DAYS,
  LMT_MIN_ADS,
  LMT_WINDOW_MONTHS,
  type LmtWindowStatus,
  type NominationLodgedSignal,
} from '../../lib/lmt';

function prettyDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Banner — the persistent warning surfaced above the case, in the same spirit
// as the "over 5MB, will be rejected by DoHA" warning on Case Files rows.
// ---------------------------------------------------------------------------

interface LmtExpiryBannerProps {
  status: LmtWindowStatus;
  nomination: NominationLodgedSignal;
  /** Opens the LMT Evidence tab. */
  onOpenLmtTab: () => void;
  /** Opens the "add advertisement" flow directly — the re-advertising CTA. */
  onAddAdRecord: () => void;
  /** Records the nomination as lodged, which stands the alert down. */
  onMarkNominationLodged: () => void;
}

/**
 * Shown only when the window is approaching or lapsed AND the nomination is not
 * recorded as lodged — the two conditions that make this actionable. A lodged
 * nomination makes the window moot, so the banner disappears entirely rather
 * than turning into a "resolved" state the user has to dismiss.
 */
export const LmtExpiryBanner: React.FC<LmtExpiryBannerProps> = ({
  status,
  nomination,
  onOpenLmtTab,
  onAddAdRecord,
  onMarkNominationLodged,
}) => {
  const lapsed = status.state === 'lapsed';
  const days = status.daysRemaining ?? 0;

  return (
    <div
      className={`mt-3 rounded-xl border px-4 py-3 ${
        lapsed
          ? 'border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20'
          : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle
          size={16}
          className={`mt-0.5 flex-shrink-0 ${lapsed ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`text-[13px] font-bold ${
              lapsed ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
            }`}
          >
            {lapsed
              ? 'Labour Market Testing evidence has expired — re-advertising required'
              : `Labour Market Testing window closes in ${days} day${days === 1 ? '' : 's'}`}
          </p>
          <p
            className={`text-[12px] mt-0.5 leading-relaxed ${
              lapsed ? 'text-red-700/90 dark:text-red-300/90' : 'text-amber-800/90 dark:text-amber-300/90'
            }`}
          >
            The last advertisement closed on <strong>{prettyDate(status.latestAdEndDate)}</strong>, so the
            nomination had to be lodged by <strong>{prettyDate(status.expiryDate)}</strong> (
            {LMT_WINDOW_MONTHS} months later).{' '}
            {lapsed
              ? 'That window has passed and the nomination is not recorded as lodged, so this evidence can no longer support it — the position needs to be advertised again before nominating.'
              : 'The nomination is not recorded as lodged yet.'}
          </p>
          <p className="text-[11px] mt-1 text-gray-500 dark:text-slate-400">{nomination.reason}</p>

          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {lapsed ? (
              <button
                type="button"
                onClick={onAddAdRecord}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11.5px] font-bold transition-colors"
              >
                <RotateCw size={12} /> Start a new advertising round
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLmtTab}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11.5px] font-bold transition-colors"
              >
                <Megaphone size={12} /> Open LMT Evidence
              </button>
            )}
            <button
              type="button"
              onClick={onMarkNominationLodged}
              className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold transition-colors ${
                lapsed
                  ? 'text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30'
                  : 'text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'
              }`}
            >
              Nomination already lodged
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Panel — the LMT Evidence tab
// ---------------------------------------------------------------------------

interface LmtEvidencePanelProps {
  records: LmtAdRecord[];
  documents: Document[];
  status: LmtWindowStatus;
  nomination: NominationLodgedSignal;
  onAdd: () => void;
  onEdit: (record: LmtAdRecord) => void;
  onDelete: (record: LmtAdRecord) => void;
  onOpenDocument: (doc: Document) => void;
  onMarkNominationLodged: () => void;
}

const STATE_META: Record<LmtWindowStatus['state'], { label: string; cls: string }> = {
  'no-records': { label: 'No ads recorded', cls: 'bg-slate-500/[0.13] text-slate-600 dark:text-slate-300' },
  ok: { label: 'In window', cls: 'bg-emerald-500/[0.13] text-emerald-700 dark:text-emerald-400' },
  approaching: { label: 'Closing soon', cls: 'bg-amber-500/[0.13] text-amber-700 dark:text-amber-400' },
  lapsed: { label: 'Expired', cls: 'bg-red-500/[0.13] text-red-700 dark:text-red-400' },
};

export const LmtEvidencePanel: React.FC<LmtEvidencePanelProps> = ({
  records,
  documents,
  status,
  nomination,
  onAdd,
  onEdit,
  onDelete,
  onOpenDocument,
  onMarkNominationLodged,
}) => {
  const chip = STATE_META[status.state];
  const notEnoughAds = records.length > 0 && records.length < LMT_MIN_ADS;

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">
          LMT Evidence{' '}
          <span className="text-gray-400 dark:text-slate-500 font-semibold">
            · {records.length} advertisement{records.length === 1 ? '' : 's'}
          </span>
        </span>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-edamame hover:bg-edamame-600 text-white transition-colors"
        >
          <Plus size={12} /> Add advertisement
        </button>
      </div>

      {/* Window summary */}
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm p-[18px]">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} className="text-gray-400 dark:text-slate-500" />
          <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">Nomination lodgement window</span>
          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${chip.cls}`}>{chip.label}</span>
        </div>

        {status.state === 'no-records' ? (
          <p className="mt-2 text-[12px] text-gray-500 dark:text-slate-400 leading-relaxed">
            Record each job advertisement run for this nomination — DoHA expects at least {LMT_MIN_ADS} ads,
            each run for {LMT_MIN_AD_DAYS} days or more. Once the first ad is recorded, the{' '}
            {LMT_WINDOW_MONTHS}-month lodgement deadline is tracked here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">
                Campaign closed
              </div>
              <div className="text-[13px] font-bold text-gray-900 dark:text-white mt-0.5">
                {prettyDate(status.latestAdEndDate)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">
                Lodge nomination by
              </div>
              <div className="text-[13px] font-bold text-gray-900 dark:text-white mt-0.5">
                {prettyDate(status.expiryDate)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">
                {status.state === 'lapsed' ? 'Expired' : 'Time remaining'}
              </div>
              <div
                className={`text-[13px] font-bold mt-0.5 ${
                  status.state === 'lapsed'
                    ? 'text-red-600 dark:text-red-400'
                    : status.state === 'approaching'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-900 dark:text-white'
                }`}
              >
                {status.daysRemaining === undefined
                  ? '—'
                  : status.daysRemaining < 0
                    ? `${Math.abs(status.daysRemaining)} days ago`
                    : `${status.daysRemaining} days`}
              </div>
            </div>
          </div>
        )}

        {/* Nomination signal */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 flex items-start gap-2">
          {nomination.lodged ? (
            <CheckCircle2 size={14} className="mt-0.5 text-emerald-500 flex-shrink-0" />
          ) : (
            <AlertTriangle size={14} className="mt-0.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-gray-800 dark:text-slate-200">
              Nomination {nomination.lodged ? 'lodged' : 'not yet lodged'}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{nomination.reason}</div>
            {!nomination.lodged && (
              <button
                type="button"
                onClick={onMarkNominationLodged}
                className="mt-1 text-[11px] font-bold text-edamame hover:underline"
              >
                Mark nomination as lodged
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Advisories */}
      {(notEnoughAds || status.shortAds.length > 0) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-1">
          {notEnoughAds && (
            <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              Only {records.length} advertisement recorded — DoHA expects at least {LMT_MIN_ADS}.
            </p>
          )}
          {status.shortAds.length > 0 && (
            <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              {status.shortAds.length} advertisement{status.shortAds.length === 1 ? '' : 's'} ran for fewer
              than {LMT_MIN_AD_DAYS} days.
            </p>
          )}
        </div>
      )}

      {/* Records */}
      {records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-800 p-10 text-center">
          <Megaphone size={26} className="mx-auto mb-2 text-gray-200 dark:text-slate-700" />
          <p className="text-sm text-gray-400 dark:text-slate-500">
            No advertisements recorded yet. Add one from a screenshot or PDF of the job ad.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          {records.map(record => {
            const days = adDurationDays(record);
            const short = days !== null && days < LMT_MIN_AD_DAYS;
            const doc = record.documentId ? documents.find(d => d.id === record.documentId) : undefined;
            return (
              <div
                key={record.id}
                className="group flex items-center gap-3 px-[18px] py-3 border-b border-gray-100 dark:border-slate-800 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white tracking-tight">
                      {record.platform}
                    </span>
                    {record.extractedByAi && (
                      <span className="text-[9.5px] font-bold px-1.5 py-px rounded bg-edamame/10 text-edamame-700 dark:text-edamame-400 uppercase tracking-[0.08em]">
                        AI read
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-gray-500 dark:text-slate-400 mt-0.5">
                    {prettyDate(record.startDate)} → {prettyDate(record.endDate)}
                    {days !== null && (
                      <span className={short ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}>
                        {' '}· {days} day{days === 1 ? '' : 's'}
                        {short ? ` (under ${LMT_MIN_AD_DAYS})` : ''}
                      </span>
                    )}
                  </div>
                  {record.notes && (
                    <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">{record.notes}</div>
                  )}
                  {record.documentId && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                      <FileText size={11} className="text-gray-400 dark:text-slate-600 flex-shrink-0" />
                      {doc ? (
                        <button
                          onClick={() => onOpenDocument(doc)}
                          className="truncate max-w-[260px] text-gray-500 dark:text-slate-400 hover:text-edamame hover:underline text-left"
                        >
                          {doc.fileName}
                        </button>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          Linked evidence file is no longer in Case Files
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(record)}
                    title="Edit advertisement"
                    className="p-1.5 rounded-md text-gray-400 hover:text-edamame hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(record)}
                    title="Delete advertisement"
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LmtEvidencePanel;
