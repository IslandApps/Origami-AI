
import { createContext, useContext, type ReactNode } from 'react';
import type { ModalType } from '../components/Modal';

export interface ModalOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  type?: ModalType;
}

export interface PromptOptions {
  title?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ThreeWayConfirmOptions {
  title?: string;
  type?: ModalType;
  confirmText?: string;
  secondaryText?: string;
  cancelText?: string;
}

interface ModalContextType {
  showAlert: (message: ReactNode, options?: ModalOptions) => Promise<void>;
  showConfirm: (message: ReactNode, options?: ModalOptions) => Promise<boolean>;
  showPrompt: (message: ReactNode, options?: PromptOptions) => Promise<string | null>;
  /** Confirm dialog with a middle "secondary" action alongside confirm/cancel, e.g.
   *  "Overwrite All" / "Only Missing" / "Cancel". Resolves 'confirm' | 'secondary' | null (cancel). */
  showThreeWayConfirm: (message: ReactNode, options?: ThreeWayConfirmOptions) => Promise<'confirm' | 'secondary' | null>;
}

export const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
