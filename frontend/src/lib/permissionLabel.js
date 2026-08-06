const PERMISSION_LABELS = {
  granted: { text: 'Allowed', className: 'bg-green-50 dark:bg-green-950/20 text-green-600' },
  denied: { text: 'Blocked', className: 'bg-red-50 dark:bg-red-950/20 text-red-600' },
  prompt: { text: 'Not asked', className: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' },
  unsupported: { text: 'Not supported', className: 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]' },
};

export const permissionLabel = (state) => PERMISSION_LABELS[state] || PERMISSION_LABELS.unsupported;
