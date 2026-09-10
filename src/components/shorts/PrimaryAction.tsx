import React from 'react';
import { Loader2, Square } from 'lucide-react';
import { cn } from '../../services/shortsUtils';

/**
 * The page has exactly one next action at any moment — write the script,
 * generate the media, or export. All three share this button so the step you
 * are on is always in the same place, in the same shape.
 *
 * While a generation is running (`busy`), a secondary Cancel action appears
 * beneath the busy button so the user can stop it mid-flight without losing
 * the assets already produced.
 */
export const PrimaryAction: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  busy: boolean;
  onCancel?: () => void;
  className?: string;
}> = ({ onClick, icon, label, disabled, busy, onCancel, className }) => (
  <div>
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-sm font-bold transition-all',
        busy
          ? 'animate-pulse-glow cursor-wait border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
          : disabled
            ? 'cursor-not-allowed border border-white/10 bg-white/[0.06] text-white/40'
            : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-[0_10px_40px_-12px_rgba(34,211,238,0.9)] hover:brightness-110 active:brightness-95',
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : icon}
      <span className="truncate">{label}</span>
    </button>
    {busy && onCancel && (
      <button
        type="button"
        onClick={onCancel}
        className="focus-ring mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 py-2.5 text-sm font-bold text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-200"
      >
        <Square className="h-4 w-4 fill-current" />
        Cancel generation
      </button>
    )}
  </div>
);
