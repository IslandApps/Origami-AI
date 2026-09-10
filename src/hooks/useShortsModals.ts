import { useState } from 'react';

/** The 7 modal-open booleans used across the Shorts page, bundled into one hook. */
export function useShortsModals() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = useState(false);
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [isVoiceAuditionOpen, setIsVoiceAuditionOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [isPollinationsInfoOpen, setIsPollinationsInfoOpen] = useState(false);

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isWebGPUModalOpen,
    setIsWebGPUModalOpen,
    isWebLLMLoadingOpen,
    setIsWebLLMLoadingOpen,
    isMusicPickerOpen,
    setIsMusicPickerOpen,
    isVoiceAuditionOpen,
    setIsVoiceAuditionOpen,
    isResourceModalOpen,
    setIsResourceModalOpen,
    isPollinationsInfoOpen,
    setIsPollinationsInfoOpen,
  };
}
