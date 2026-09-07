
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** A named control the step exposes, as opposed to a stage in the sequence. */
interface StepOption {
  term: string;
  detail: React.ReactNode;
}

interface Step {
  title: string;
  /** Position on the fold axis: cold is the deck you brought, ember is the file the render produced. */
  tone: string;
  lead: React.ReactNode;
  options?: StepOption[];
}

const STEPS: Step[] = [
  {
    title: 'Upload your PDF',
    tone: 'var(--fold-cold)',
    lead: 'Every page becomes one slide, and the text on that page becomes the first draft of its narration.',
  },
  {
    title: 'Write the script, then voice it',
    tone: 'color-mix(in srgb, var(--fold-cold) 45%, var(--fold-mid))',
    lead: (
      <>
        PDF text comes out fragmented. <strong className="font-bold text-white/75">AI Fix Script</strong> rewrites it
        into sentences a narrator can read. Edit any slide inline or open <strong className="font-bold text-white/75">Focus
        Mode</strong> to work through them one at a time, then generate the narration.
      </>
    ),
    options: [
      { term: 'Voice', detail: 'Give each slide its own narrator, or keep one throughout.' },
      { term: 'Transition', detail: 'How the slide arrives: fade, slide, zoom, or none.' },
      { term: 'Delay', detail: 'How long to hold the slide after its narration ends.' },
    ],
  },
  {
    title: 'Add background music',
    tone: 'var(--fold-mid)',
    lead: 'Pick a track from the built-in library or upload your own, then set its volume so it sits under the narration. Save a favourite in Settings and every new project starts with it.',
  },
  {
    title: 'Set your defaults',
    tone: 'var(--fold-warm)',
    lead: (
      <>
        Open <strong className="font-bold text-white/75">Settings</strong> in the top right. New slides inherit whatever
        you set here.
      </>
    ),
    options: [
      { term: 'General', detail: 'Starting transition, delay, and music track for every new slide.' },
      { term: 'TTS Model', detail: 'q8 for the best voice quality, q4 for a smaller, faster download.' },
      { term: 'WebLLM', detail: 'Run AI Fix Script on a local model instead of a cloud key.' },
      { term: 'AI Prompt', detail: 'Change the system prompt AI Fix Script writes against.' },
      { term: 'API', detail: 'Add your own provider key if you would rather not run the model locally.' },
    ],
  },
  {
    title: 'Preview, then render',
    tone: 'var(--ember)',
    lead: 'The Preview tab plays the whole composition end to end. When it looks right, export it.',
    options: [
      {
        term: 'With narration',
        detail: 'Render Video (With TTS) muxes every voiceover and the music bed into one MP4.',
      },
      {
        term: 'Silent',
        detail: 'Render Silent Video gives you the visuals alone, ready for a voiceover you record yourself.',
      },
    ],
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [read, setRead] = useState(0);

  // How far down the guide the reader is, which is also how far along the
  // pipeline they are — the crease uses the same number for both.
  const measure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const scrollable = el.scrollHeight - el.clientHeight;
      // A viewport tall enough to show the whole guide has nothing left to read.
      setRead(scrollable <= 1 ? 1 : Math.min(1, Math.max(0, el.scrollTop / scrollable)));
    });
  }, []);

  // App.tsx passes a fresh arrow for onClose on every render, and this effect
  // locks the page and moves focus. Reading it through a ref keeps that setup
  // tied to isOpen alone, instead of tearing down and stealing focus back to
  // the dialog every time the host re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const opener = document.activeElement as HTMLElement | null;
    // Restore whatever was there rather than clearing outright: this guide can
    // open over another dialog that has already locked the page.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    measure();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null || el === root);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', measure);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [isOpen, measure]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-6">
      {/* Backdrop — only visible at sm+, where the dialog is a centered card */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Below sm this fills the viewport outright: no gap, no corners, nothing
          to drag. At sm+ it's a centered card. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-modal-title"
        aria-describedby="tutorial-modal-description"
        tabIndex={-1}
        className="tutorial-dialog tutorial-enter relative flex h-full w-full flex-col overflow-hidden border-white/10 shadow-2xl outline-none sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-white/10 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="tutorial-modal-title"
                className="font-display text-lg font-extrabold leading-tight tracking-tight text-white sm:text-[1.375rem]"
              >
                From PDF to video
              </h2>
              <p id="tutorial-modal-description" className="mt-1.5 text-[13px] leading-snug text-white/45">
                Five steps from a slide deck to a finished MP4. Everything runs in your browser.
              </p>
            </div>
            <button
              onClick={onClose}
              className="focus-ring -mr-1 flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          onScroll={measure}
          tabIndex={0}
          className="tutorial-scroll custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-6"
        >
          <ol className="tutorial-rail" style={{ '--tutorial-read': read } as React.CSSProperties}>
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3.5 pb-7 last:pb-1 sm:gap-5">
                <span
                  className="tutorial-step-number flex h-7 w-10 shrink-0 items-start justify-center font-display text-[1.0625rem] font-extrabold leading-none"
                  style={{ color: step.tone }}
                >
                  <span className="sr-only">Step </span>
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold leading-snug text-white">{step.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{step.lead}</p>

                  {step.options && (
                    <dl className="mt-3.5 divide-y divide-white/10 border-y border-white/10">
                      {step.options.map((option) => (
                        <div key={option.term} className="py-2.5 sm:grid sm:grid-cols-[7.5rem_1fr] sm:gap-5">
                          <dt className="text-[10px] font-bold uppercase leading-4 tracking-[0.14em] text-white/70">
                            {option.term}
                          </dt>
                          <dd className="mt-1 text-[13px] leading-relaxed text-white/50 sm:mt-0">{option.detail}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-black/25 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:py-4">
          <p className="hidden text-[11px] text-white/30 sm:block">Press Esc to close</p>
          <button
            onClick={onClose}
            className="focus-ring w-full rounded-xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15 sm:w-auto sm:py-2"
          >
            Close guide
          </button>
        </footer>
      </div>
    </div>
  );
};
