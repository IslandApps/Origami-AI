import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { SlideData } from '../../types/slides';

export const ScriptEditorModal = ({
  isOpen,
  onClose,
  script,
  onUpdate,
  highlightText
}: {
  isOpen: boolean;
  onClose: () => void;
  script: string;
  onUpdate: (data: Partial<SlideData>) => void;
  highlightText?: string;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const syncScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const renderBackdrop = () => {
    if (!highlightText) {
      return script;
    }

    // Use regex-based highlighting for simpler, more reliable results
    const regex = new RegExp(`(${highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = script.split(regex);

    return parts.map((part, index) => {
      // When using split() with a capturing group, matches are at odd indices
      if (index % 2 === 1 && part) {
        return (
          <mark key={`${index}-${part}`} className="bg-yellow-500/60 text-transparent rounded-sm p-0 m-0 border-none inline">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full h-full sm:h-[85vh] sm:w-200 bg-[#121212] sm:rounded-2xl border-white/10 sm:border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/5">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Maximize2 className="w-5 h-5 text-branding-primary" />
              Focus Mode
            </h3>
            <p className="text-xs text-white/40">Edit your script with a distraction-free view</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Minimize2 className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center justify-between">
          <span className="text-xs font-bold text-white/30 uppercase tracking-widest">Script Editor</span>
          <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">Auto-save enabled</span>
        </div>

        {/* Editor Area */}
        <div className="relative flex-1 bg-[#1a1a1a]">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop */}
            <div
              ref={backdropRef}
              className="absolute inset-0 w-full h-full m-0 px-6 py-6 text-[16px]! sm:text-[18px]! font-sans! tracking-normal! leading-relaxed! whitespace-pre-wrap overflow-y-auto wrap-break-word text-transparent pointer-events-none border border-transparent outline-none"
              style={{ paddingRight: '1.5rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              aria-hidden="true"
              dir="ltr"
            >
              {renderBackdrop()}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={script}
              onChange={(e) => onUpdate({ script: e.target.value })}
              onScroll={syncScroll}
              className="absolute inset-0 w-full h-full m-0 px-6 py-6 bg-transparent text-white text-[16px]! sm:text-[18px]! font-sans! tracking-normal! leading-relaxed! whitespace-pre-wrap resize-none outline-none border border-transparent focus:ring-0 selection:bg-branding-primary/30 overflow-y-auto wrap-break-word cursor-auto"
              style={{ paddingRight: '1.5rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              placeholder="Enter your script here..."
              spellCheck={false}
              dir="ltr"
            />
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-white/5 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-white/30">
            <span className="w-1.5 h-1.5 rounded-full bg-branding-primary animate-pulse" />
            Changes are saved automatically.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
