import { useState } from 'react';
import { reportAPI } from '../../services/api';
import toast from 'react-hot-toast';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'nudity', label: 'Nudity or sexual content' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'violence', label: 'Violence' },
  { value: 'false_info', label: 'False information' },
  { value: 'other', label: 'Other' },
];

export default function ReportModal({ targetType, targetId, label, onClose, evidenceContent }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await reportAPI.createReport({
        targetType, targetId, reason,
        note: reason === 'other' ? note : undefined,
        ...(evidenceContent ? { evidenceContent } : {})
      });
      toast.success('Report submitted. Thank you.');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute bottom-0 left-0 right-0 lg:relative lg:w-[400px] bg-[var(--bg-primary)] rounded-t-3xl lg:rounded-2xl overflow-hidden shadow-2xl animate-slide-up">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-sm">{label}</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">Why are you reporting this?</p>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)}
              className={`w-full text-left px-5 py-3.5 text-sm border-b border-[var(--border)] transition-colors
                ${reason === r.value ? 'bg-[var(--bg-tertiary)] font-semibold' : 'hover:bg-[var(--bg-tertiary)]'}`}>
              {r.label}
            </button>
          ))}
          {reason === 'other' && (
            <div className="px-5 py-3">
              <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3}
                placeholder="Tell us more (optional)"
                className="w-full bg-[var(--bg-tertiary)] rounded-xl p-3 text-sm resize-none outline-none placeholder:text-[var(--text-muted)]" />
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4">
          <button onClick={onClose} className="flex-1 btn-outline py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
          <button onClick={handleSubmit} disabled={!reason || submitting}
            className="flex-1 btn-brand py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
