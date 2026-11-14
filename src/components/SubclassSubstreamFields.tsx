import React, { useId } from 'react';
import { NOT_CONFIRMED_SUBCLASS } from '../types';
import { useVisaConfig } from '../contexts/VisaConfigContext';
import {
  NOT_CONFIRMED_LABEL,
  isConfirmedSubclass,
  subclassOptions,
  substreamAfterSubclassChange,
  substreamsFor,
} from '../lib/visaTypes';

export interface SubclassSubstreamValue {
  /** '' = none chosen, `NOT_CONFIRMED_SUBCLASS`, or a subclass code. */
  subclass: string;
  substream: string;
}

interface Props {
  value: SubclassSubstreamValue;
  onChange: (next: SubclassSubstreamValue) => void;
  /** Offer the blank "— None —" option (default true). */
  allowBlank?: boolean;
  /** Offer "Not Confirmed" (default true). */
  allowNotConfirmed?: boolean;
  /** Lock the subclass (e.g. Visa Advisor, where it comes from the assessed pathway); substream stays editable. */
  subclassLocked?: boolean;
  labelClassName?: string;
  selectClassName?: string;
  /** Wraps both fields; defaults to a two-column grid. */
  className?: string;
  subclassLabel?: string;
}

/**
 * Visa Subclass + Substream pickers, fed by the firm's Visa Types list
 * (Configuration → Work Plans → Visa Types). Substream is disabled when the
 * subclass is blank, Not Confirmed, or has no substreams, and is cleared when
 * the subclass changes to one that doesn't offer it. A value already saved on
 * the record stays selectable even if its Visa Type was hidden since.
 */
export const SubclassSubstreamFields: React.FC<Props> = ({
  value,
  onChange,
  allowBlank = true,
  allowNotConfirmed = true,
  subclassLocked = false,
  labelClassName = 'block text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1.5',
  selectClassName = 'w-full px-3 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-[13px] text-ink dark:text-plate-ink outline-none focus:ring-2 focus:ring-edamame disabled:opacity-50',
  className = 'grid grid-cols-1 sm:grid-cols-2 gap-3',
  subclassLabel = 'Visa Subclass',
}) => {
  const { visaTypes } = useVisaConfig();
  const id = useId();
  const options = subclassOptions(visaTypes, value.subclass);
  const streams = substreamsFor(visaTypes, value.subclass, value.substream || undefined);
  const streamDisabled = streams.length === 0;

  const changeSubclass = (subclass: string) =>
    onChange({ subclass, substream: substreamAfterSubclassChange(visaTypes, subclass, value.substream || undefined) ?? '' });

  return (
    <div className={className}>
      <div>
        <label htmlFor={`${id}-subclass`} className={labelClassName}>{subclassLabel}</label>
        <select
          id={`${id}-subclass`}
          value={value.subclass}
          disabled={subclassLocked}
          onChange={e => changeSubclass(e.target.value)}
          className={selectClassName}
        >
          {allowBlank && <option value="">— None —</option>}
          {allowNotConfirmed && <option value={NOT_CONFIRMED_SUBCLASS}>{NOT_CONFIRMED_LABEL}</option>}
          {options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-substream`} className={labelClassName}>Substream</label>
        <select
          id={`${id}-substream`}
          value={value.substream}
          disabled={streamDisabled}
          onChange={e => onChange({ ...value, substream: e.target.value })}
          className={selectClassName}
        >
          <option value="">
            {streamDisabled
              ? isConfirmedSubclass(value.subclass) ? 'No substreams' : '—'
              : 'Select substream'}
          </option>
          {streams.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
};

export default SubclassSubstreamFields;
