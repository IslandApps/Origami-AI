import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { User } from 'firebase/auth';
import {
  saveShortsProjectToCloud,
  loadShortsProjectFromCloud,
} from '../services/cloudStorage';
import {
  fromPersistedProject,
  revokeProjectUrls,
  toPersistedProject,
  type ShortsProject,
} from '../services/shortsProject';
import type { useModal } from '../context/ModalContext';

type ModalApi = Pick<ReturnType<typeof useModal>, 'showAlert' | 'showConfirm' | 'showPrompt'>;

/**
 * Cloud Library persistence for the current shorts draft: "Save to Library" plus
 * the /shorts?libraryProjectId=<id>[&libraryAction=download] load flow navigated
 * to from the Library page.
 */
export function useShortsCloudSync(params: {
  user: User | null;
  projectRef: React.RefObject<ShortsProject>;
  setProject: React.Dispatch<React.SetStateAction<ShortsProject>>;
  setStage: (stage: 'compose' | 'storyboard') => void;
  /** Set on a Library "Download" load; consumed by useShortsRender. */
  pendingLibraryDownloadRef: React.RefObject<boolean>;
  modal: ModalApi,
}) {
  const { user, projectRef, setProject, setStage, pendingLibraryDownloadRef, modal } = params;
  const { showAlert, showConfirm, showPrompt } = modal;
  const [searchParams, setSearchParams] = useSearchParams();

  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [linkedCloudProjectId, setLinkedCloudProjectId] = useState<string | null>(null);

  const handleSaveToLibrary = useCallback(async () => {
    if (!user) {
      showAlert('Please sign in to save to your Library.', { type: 'error' });
      return;
    }
    if (projectRef.current.scenes.length === 0) {
      showAlert('Nothing to save yet — generate a short first.', { type: 'warning' });
      return;
    }
    const current = projectRef.current;
    const defaultTitle = current.title || current.topic || 'Untitled Short';
    const title = await showPrompt('Name this short so you can find it later in your Library.', {
      title: linkedCloudProjectId ? 'Update Library entry' : 'Save to Library',
      defaultValue: defaultTitle,
      confirmText: 'Save',
    });
    if (title === null) return;
    setIsSavingToCloud(true);
    try {
      const projectId = linkedCloudProjectId ?? Date.now().toString();
      const toSave = { ...projectRef.current, title };
      setProject(toSave);
      const pData = toPersistedProject(toSave);
      const result = await saveShortsProjectToCloud(user.uid, projectId, pData);
      setLinkedCloudProjectId(result.projectId);
      showAlert('Saved to Library!', { type: 'success' });
    } catch (e: any) {
      console.error(e);
      showAlert('Failed to save to Library: ' + e.message, { type: 'error' });
    } finally {
      setIsSavingToCloud(false);
    }
  }, [user, projectRef, linkedCloudProjectId, setProject, showAlert, showPrompt]);

  // Handles /shorts?libraryProjectId=<id>[&libraryAction=download] navigated to from the Library page.
  useEffect(() => {
    const libraryProjectId = searchParams.get('libraryProjectId');
    if (!libraryProjectId) return;
    if (!user) {
      setSearchParams({}, { replace: true });
      return;
    }
    const action = searchParams.get('libraryAction');

    (async () => {
      if (projectRef.current.scenes.length > 0) {
        const proceed = await showConfirm(
          'Opening this short from your Library will replace your current unsaved draft. Continue?',
          { type: 'warning', title: 'Replace current draft?' },
        );
        if (!proceed) {
          setSearchParams({}, { replace: true });
          return;
        }
      }
      try {
        const loadedData = await loadShortsProjectFromCloud(user.uid, libraryProjectId);
        if (!loadedData) {
          showAlert('Project not found — it may have been deleted.', { type: 'error' });
          return;
        }
        revokeProjectUrls(projectRef.current);
        setProject(fromPersistedProject(loadedData));
        setStage(loadedData.scenes.length > 0 ? 'storyboard' : 'compose');
        setLinkedCloudProjectId(libraryProjectId);
        if (action === 'download') pendingLibraryDownloadRef.current = true;
      } catch (e: any) {
        console.error(e);
        showAlert('Failed to load project: ' + e.message, { type: 'error' });
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  return {
    isSavingToCloud,
    linkedCloudProjectId,
    setLinkedCloudProjectId,
    handleSaveToLibrary,
  };
}
