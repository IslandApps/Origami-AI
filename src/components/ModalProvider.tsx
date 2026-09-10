
import React, { useState, useCallback, type ReactNode } from 'react';
import { Modal, type ModalType } from './Modal';
import { PromptModal } from './PromptModal';
import { ModalContext } from '../context/ModalContext';
import type { PromptOptions } from '../context/ModalContext';

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: ModalType;
    message: ReactNode;
    title?: string;
    confirmText?: string;
    cancelText?: string;
    resolve?: (value: unknown) => void;
    isConfirmation?: boolean;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showAlert = useCallback((message: ReactNode, options?: { title?: string; confirmText?: string; type?: ModalType }) => {
    return new Promise<void>((resolve) => {
      setModalState({
        isOpen: true,
        message,
        type: options?.type || 'info',
        title: options?.title,
        confirmText: options?.confirmText || 'OK',
        isConfirmation: false,
        resolve: () => {
          setModalState(prev => ({ ...prev, isOpen: false }));
          resolve();
        }
      });
    });
  }, []);

  const showConfirm = useCallback((message: ReactNode, options?: { title?: string; confirmText?: string; cancelText?: string; type?: ModalType }) => {
    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        message,
        type: options?.type || 'confirm',
        title: options?.title,
        confirmText: options?.confirmText || 'Confirm',
        cancelText: options?.cancelText || 'Cancel',
        isConfirmation: true,
        resolve: (confirmed: unknown) => {
          setModalState(prev => ({ ...prev, isOpen: false }));
          resolve(confirmed as boolean);
        }
      });
    });
  }, []);

  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    message: ReactNode;
    title?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
    resolve?: (value: string | null) => void;
  }>({
    isOpen: false,
    message: '',
  });

  const showPrompt = useCallback((message: ReactNode, options?: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({
        isOpen: true,
        message,
        title: options?.title,
        defaultValue: options?.defaultValue,
        placeholder: options?.placeholder,
        confirmText: options?.confirmText || 'Save',
        cancelText: options?.cancelText || 'Cancel',
        resolve: (value: string | null) => {
          setPromptState(prev => ({ ...prev, isOpen: false }));
          resolve(value);
        }
      });
    });
  }, []);

  const handlePromptConfirm = (value: string) => {
    promptState.resolve?.(value);
  };

  const handlePromptCancel = () => {
    promptState.resolve?.(null);
  };

  const handleConfirm = () => {
    if (modalState.resolve) {
      if (modalState.isConfirmation) {
         modalState.resolve(true);
      } else {
         modalState.resolve(undefined);
      }
    }
  };

  const handleCancel = () => {
    if (modalState.resolve) {
      if (modalState.isConfirmation) {
        modalState.resolve(false);
      } else {
        // Should not really happen for alerts as they don't have cancel, but just in case
        modalState.resolve(undefined);
      }
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      <Modal
        isOpen={modalState.isOpen}
        type={modalState.type}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
      <PromptModal
        isOpen={promptState.isOpen}
        title={promptState.title}
        message={promptState.message}
        defaultValue={promptState.defaultValue}
        placeholder={promptState.placeholder}
        confirmText={promptState.confirmText}
        cancelText={promptState.cancelText}
        onConfirm={handlePromptConfirm}
        onCancel={handlePromptCancel}
      />
    </ModalContext.Provider>
  );
};
