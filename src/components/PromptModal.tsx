
import React, { useEffect, useRef, useState } from 'react';
import { X, Pencil } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  title?: string;
  message?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title,
  message,
  defaultValue = '',
  placeholder,
  confirmText = 'Save',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      requestAnimationFrame(() => {
        setIsRendered(true);
        requestAnimationFrame(() => {
          setIsVisible(true);
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      });
    } else {
      requestAnimationFrame(() => setIsVisible(false));
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultValue]);

  if (!isRendered) return null;

  const trimmed = value.trim();

  const submit = () => {
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onCancel}
      />

      <div className={`relative w-full max-w-md my-4 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
        <div className="px-6 py-4 flex items-center gap-3 rounded-t-2xl border-b bg-blue-500/10 border-blue-500/20">
          <Pencil className="w-6 h-6 text-blue-400" />
          <h3 className="text-lg font-bold text-white tracking-tight">{title || 'Name this project'}</h3>
          <button
            onClick={onCancel}
            className="ml-auto p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-w-11 min-h-11 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {message && <div className="text-white/80 leading-relaxed text-sm mb-3">{message}</div>}
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onCancel();
            }}
            className="w-full rounded-lg bg-black/30 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30"
          />
        </div>

        <div className="px-6 py-4 bg-white/5 rounded-b-2xl border-t border-white/5 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={submit}
            disabled={!trimmed}
            className="w-full sm:w-auto px-6 py-2 rounded-lg text-sm font-bold text-black transition-all shadow-lg bg-branding-primary hover:bg-cyan-400 shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-branding-primary"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
