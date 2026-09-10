import React from 'react';
import { cn } from '../../services/shortsUtils';

/**
 * One asset track in the monitor. The bar stays neutral while a track is part
 * way there and only turns cyan on the last scene, so "all of them" reads at a
 * glance rather than having to be counted.
 */
export const ReadyTrack: React.FC<{
  label: string;
  icon: React.ReactNode;
  ready: number;
  total: number;
}> = ({ label, icon, ready, total }) => {
  const complete = total > 0 && ready === total;
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn('shrink-0', complete ? 'text-cyan-300' : 'text-white/30')}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-xs text-white/55">{label}</span>
        <span className={cn('font-mono text-xs tabular-nums', complete ? 'text-cyan-200' : 'text-white/70')}>
          {ready}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} ready`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ready}
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            complete ? 'bg-cyan-400' : 'bg-white/40',
          )}
          style={{ width: total ? `${(ready / total) * 100}%` : '0%' }}
        />
      </div>
    </div>
  );
};
