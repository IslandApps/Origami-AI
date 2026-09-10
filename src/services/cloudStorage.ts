import { db, storage } from '../config/firebase';
import { collection, doc, setDoc, getDocs, getDoc, deleteDoc, updateDoc, query, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import type { SlideData, MusicSettings } from '../components/SlideEditor';
import type { PersistedShortsProject } from './storage';

/**
 * Helper to upload a blob and return its download URL.
 */
async function uploadBlob(path: string, blob: Blob | undefined): Promise<string | null> {
  if (!blob) return null;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
}

/**
 * Slide fields that hold Object URLs or blobs.
 */
const SLIDE_ASSET_FIELDS = ['dataUrl', 'mediaUrl', 'audioUrl'] as const;

/**
 * Recursively deletes everything under a Storage path prefix. `listAll` on an
 * empty/missing prefix resolves to empty arrays rather than throwing, so this
 * is a safe no-op for a project that never uploaded any binary asset.
 */
async function deleteStoragePrefix(prefix: string): Promise<void> {
  const dirRef = ref(storage, prefix);
  const res = await listAll(dirRef);
  await Promise.all(res.items.map((item) => deleteObject(item).catch((e) => {
    if (e?.code !== 'storage/object-not-found') throw e;
  })));
  await Promise.all(res.prefixes.map((sub) => deleteStoragePrefix(sub.fullPath)));
}

export function guessPdfProjectTitle(slides: SlideData[]): string {
  const firstScript = slides[0]?.script?.trim();
  if (!firstScript) return 'Untitled Presentation';
  return firstScript.length > 40 ? firstScript.slice(0, 40) + '...' : firstScript;
}

export async function savePdfProjectToCloud(
  userId: string,
  projectId: string,
  slides: SlideData[],
  title: string = 'My Presentation',
  musicSettings?: MusicSettings | null,
): Promise<{ projectId: string; updatedAt: number }> {
  const projectRef = doc(db, 'users', userId, 'pdf_projects', projectId);

  const processedSlides = await Promise.all(slides.map(async (slide, idx) => {
    const newSlide = { ...slide };
    for (const field of SLIDE_ASSET_FIELDS) {
      const url = slide[field];
      if (url && url.startsWith('blob:')) {
        // Fetch blob from local object URL
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          const path = `users/${userId}/pdf_projects/${projectId}/slides/${idx}/${field}`;
          const downloadUrl = await uploadBlob(path, blob);
          if (downloadUrl) {
            newSlide[field] = downloadUrl;
          }
        } catch (e) {
          console.warn('Failed to upload slide asset', field, e);
        }
      }
    }
    return newSlide;
  }));

  let processedMusic: Omit<MusicSettings, 'blob'> | null = null;
  if (musicSettings && (musicSettings.blob || musicSettings.url)) {
    let uploadUrl: string | null = null;
    if (musicSettings.blob) {
      uploadUrl = await uploadBlob(`users/${userId}/pdf_projects/${projectId}/music`, musicSettings.blob);
    } else if (musicSettings.url?.startsWith('blob:')) {
      try {
        const blob = await (await fetch(musicSettings.url)).blob();
        uploadUrl = await uploadBlob(`users/${userId}/pdf_projects/${projectId}/music`, blob);
      } catch (e) {
        console.warn('Failed to upload project music', e);
      }
    }
    processedMusic = {
      volume: musicSettings.volume,
      loop: musicSettings.loop,
      title: musicSettings.title,
      url: uploadUrl ?? (musicSettings.url && !musicSettings.url.startsWith('blob:') ? musicSettings.url : undefined),
    };
  }

  const updatedAt = Date.now();
  await setDoc(projectRef, {
    projectId,
    title,
    slides: processedSlides,
    musicSettings: processedMusic,
    updatedAt,
  });
  return { projectId, updatedAt };
}

export async function loadPdfProjectFromCloud(userId: string, projectId: string): Promise<{ slides: SlideData[]; title: string; musicSettings: MusicSettings | null } | null> {
  const projectRef = doc(db, 'users', userId, 'pdf_projects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    slides: data.slides as SlideData[],
    title: (data.title as string) || 'Untitled Presentation',
    musicSettings: (data.musicSettings as MusicSettings) ?? null,
  };
}

export async function listPdfProjectsFromCloud(userId: string) {
  const colRef = collection(db, 'users', userId, 'pdf_projects');
  const q = query(colRef, limit(100));
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data());
}

export async function deletePdfProjectFromCloud(userId: string, projectId: string): Promise<void> {
  await deleteStoragePrefix(`users/${userId}/pdf_projects/${projectId}`);
  await deleteDoc(doc(db, 'users', userId, 'pdf_projects', projectId));
}

export async function renamePdfProjectInCloud(userId: string, projectId: string, title: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'pdf_projects', projectId), { title, updatedAt: Date.now() });
}

export async function saveShortsProjectToCloud(userId: string, projectId: string, project: PersistedShortsProject): Promise<{ projectId: string; updatedAt: number }> {
  const projectRef = doc(db, 'users', userId, 'shorts_projects', projectId);

  const processedProject = { ...project, scenes: [...project.scenes] };

  // Upload music
  if (project.musicBlob) {
    const path = `users/${userId}/shorts_projects/${projectId}/music`;
    const url = await uploadBlob(path, project.musicBlob);
    if (url) processedProject.musicBlob = url as any; // Storing URL string instead of Blob in cloud
  }

  // Upload scene assets
  for (let i = 0; i < processedProject.scenes.length; i++) {
    const scene = { ...processedProject.scenes[i] };
    if (scene.imageBlob) {
      scene.imageBlob = await uploadBlob(`users/${userId}/shorts_projects/${projectId}/scenes/${scene.id}/image`, scene.imageBlob) as any;
    }
    if (scene.videoBlob) {
      scene.videoBlob = await uploadBlob(`users/${userId}/shorts_projects/${projectId}/scenes/${scene.id}/video`, scene.videoBlob) as any;
    }
    if (scene.audioBlob) {
      scene.audioBlob = await uploadBlob(`users/${userId}/shorts_projects/${projectId}/scenes/${scene.id}/audio`, scene.audioBlob) as any;
    }
    processedProject.scenes[i] = scene;
  }

  const updatedAt = Date.now();
  await setDoc(projectRef, {
    ...processedProject,
    projectId,
    updatedAt,
  });
  return { projectId, updatedAt };
}

export async function listShortsProjectsFromCloud(userId: string) {
  const colRef = collection(db, 'users', userId, 'shorts_projects');
  const q = query(colRef, limit(100));
  const snap = await getDocs(q);
  return snap.docs.map(doc => doc.data());
}

export async function loadShortsProjectFromCloud(userId: string, projectId: string): Promise<PersistedShortsProject | null> {
  const projectRef = doc(db, 'users', userId, 'shorts_projects', projectId);
  const snap = await getDoc(projectRef);
  if (!snap.exists()) return null;
  
  const data = snap.data();
  
  // Helper to fetch blob from URL
  const fetchBlob = async (url?: string) => {
    if (!url || typeof url !== 'string') return undefined;
    try {
      const res = await fetch(url);
      return await res.blob();
    } catch {
      return undefined;
    }
  };

  if (data.musicBlob) data.musicBlob = await fetchBlob(data.musicBlob as any);
  
  for (let i = 0; i < data.scenes.length; i++) {
    const scene = data.scenes[i];
    if (scene.imageBlob) scene.imageBlob = await fetchBlob(scene.imageBlob as any);
    if (scene.videoBlob) scene.videoBlob = await fetchBlob(scene.videoBlob as any);
    if (scene.audioBlob) scene.audioBlob = await fetchBlob(scene.audioBlob as any);
  }
  
  return data as PersistedShortsProject;
}

export async function deleteShortsProjectFromCloud(userId: string, projectId: string): Promise<void> {
  await deleteStoragePrefix(`users/${userId}/shorts_projects/${projectId}`);
  await deleteDoc(doc(db, 'users', userId, 'shorts_projects', projectId));
}

export async function renameShortsProjectInCloud(userId: string, projectId: string, title: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'shorts_projects', projectId), { title, updatedAt: Date.now() });
}
