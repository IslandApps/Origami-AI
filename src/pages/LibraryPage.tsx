import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Film, FolderOpen, Download, Pencil, Trash2, Loader2, RefreshCw, LibraryBig } from 'lucide-react';
import { Footer } from '../components/Footer';
import backgroundImage from '../assets/images/background.jpg';
import { PageHeader } from '../components/PageHeader';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import {
  listPdfProjectsFromCloud,
  deletePdfProjectFromCloud,
  renamePdfProjectInCloud,
  listShortsProjectsFromCloud,
  deleteShortsProjectFromCloud,
  renameShortsProjectInCloud,
} from '../services/cloudStorage';

type LibraryEntry =
  | { kind: 'pdf'; projectId: string; title: string; updatedAt: number; count: number; thumbnailUrl: string | null }
  | { kind: 'shorts'; projectId: string; title: string; updatedAt: number; count: number; thumbnailUrl: string | null };

export const LibraryPage: React.FC = () => {
  usePageMeta({
    title: 'Library — Origami AI',
    description: 'Your saved PDF-to-video and Shorts projects — open, download, or delete them.',
    path: '/library',
  });

  const { user, loading: authLoading } = useAuth();
  const { showConfirm, showAlert, showPrompt } = useModal();
  const navigate = useNavigate();

  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    setEntries(null);
    setError(null);

    (async () => {
      try {
        const [pdfDocs, shortsDocs] = await Promise.all([
          listPdfProjectsFromCloud(user.uid),
          listShortsProjectsFromCloud(user.uid),
        ]);
        if (cancelled) return;

        const pdfEntries: LibraryEntry[] = pdfDocs.map((d: any) => ({
          kind: 'pdf' as const,
          projectId: d.projectId,
          title: d.title || 'Untitled Presentation',
          updatedAt: d.updatedAt || 0,
          count: d.slides?.length || 0,
          thumbnailUrl: d.slides?.[0]?.dataUrl || d.slides?.[0]?.mediaUrl || null,
        }));
        const shortsEntries: LibraryEntry[] = shortsDocs.map((d: any) => ({
          kind: 'shorts' as const,
          projectId: d.projectId,
          title: d.title || d.topic || 'Untitled Short',
          updatedAt: d.updatedAt || 0,
          count: d.scenes?.length || 0,
          thumbnailUrl: typeof d.scenes?.[0]?.imageBlob === 'string' ? d.scenes[0].imageBlob : null,
        }));

        setEntries([...pdfEntries, ...shortsEntries].sort((a, b) => b.updatedAt - a.updatedAt));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load your Library.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, reloadKey]);

  const handleOpen = useCallback((entry: LibraryEntry) => {
    navigate(entry.kind === 'pdf' ? `/?libraryProjectId=${entry.projectId}` : `/shorts?libraryProjectId=${entry.projectId}`);
  }, [navigate]);

  const handleDownload = useCallback((entry: LibraryEntry) => {
    void showAlert('Opening the project to render your video — this can take a moment for longer projects.', { type: 'info' });
    navigate(entry.kind === 'pdf' ? `/?libraryProjectId=${entry.projectId}&libraryAction=download` : `/shorts?libraryProjectId=${entry.projectId}&libraryAction=download`);
  }, [navigate, showAlert]);

  const handleRename = useCallback(async (entry: LibraryEntry) => {
    if (!user) return;
    const newTitle = await showPrompt('Rename this project', {
      title: 'Rename',
      defaultValue: entry.title,
      confirmText: 'Rename',
    });
    if (newTitle === null) return;
    setBusyProjectId(entry.projectId);
    try {
      if (entry.kind === 'pdf') {
        await renamePdfProjectInCloud(user.uid, entry.projectId, newTitle);
      } else {
        await renameShortsProjectInCloud(user.uid, entry.projectId, newTitle);
      }
      setEntries((prev) => prev?.map((e) => (e.projectId === entry.projectId && e.kind === entry.kind ? { ...e, title: newTitle } : e)) ?? prev);
    } catch (e: any) {
      showAlert('Failed to rename project: ' + (e?.message || 'Unknown error'), { type: 'error' });
    } finally {
      setBusyProjectId(null);
    }
  }, [user, showPrompt, showAlert]);

  const handleDelete = useCallback(async (entry: LibraryEntry) => {
    if (!user) return;
    const confirmed = await showConfirm(`Delete "${entry.title}"? This cannot be undone.`, {
      type: 'error',
      title: 'Delete project',
      confirmText: 'Delete',
    });
    if (!confirmed) return;
    setBusyProjectId(entry.projectId);
    try {
      if (entry.kind === 'pdf') {
        await deletePdfProjectFromCloud(user.uid, entry.projectId);
      } else {
        await deleteShortsProjectFromCloud(user.uid, entry.projectId);
      }
      setEntries((prev) => prev?.filter((e) => !(e.projectId === entry.projectId && e.kind === entry.kind)) ?? prev);
    } catch (e: any) {
      showAlert('Failed to delete project: ' + (e?.message || 'Unknown error'), { type: 'error' });
    } finally {
      setBusyProjectId(null);
    }
  }, [user, showConfirm, showAlert]);

  return (
    <div className="isolate min-h-screen bg-[#121215] text-white pt-8 pb-2 flex flex-col px-4 sm:px-8">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 w-full h-lvh object-cover opacity-40 blur-[2px] brightness-75 scale-105"
      />

      <PageHeader title="Library" showBack showHelp={false} showSettings={false} />

      <main className="mx-auto max-w-5xl w-full mb-8 animate-slide-up flex-grow">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-cyan-500/20 rounded-2xl border border-cyan-500/30">
            <LibraryBig className="w-8 h-8 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Library</h1>
            <p className="text-white/60">Your saved presentations and shorts, ready to open, download, or delete.</p>
          </div>
        </div>

        {authLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
          </div>
        ) : !user ? (
          <div className="glass rounded-3xl border border-white/10 p-8 sm:p-12 text-center">
            <p className="text-white/70">Sign in to save projects to your Library and access them here from any device.</p>
          </div>
        ) : error ? (
          <div className="glass rounded-3xl border border-red-500/20 p-8 text-center">
            <p className="text-red-300 mb-4">{error}</p>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : entries === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-black/20 aspect-[4/3] animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="glass rounded-3xl border border-white/10 p-8 sm:p-12 text-center">
            <p className="text-white/70">Your Library is empty — save a project from the Studio or Shorts composer to see it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {entries.map((entry) => {
              const isBusy = busyProjectId === entry.projectId;
              return (
                <div key={`${entry.kind}-${entry.projectId}`} className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden flex flex-col group">
                  <div className="aspect-video bg-black/40 flex items-center justify-center relative">
                    {entry.thumbnailUrl ? (
                      <img src={entry.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : entry.kind === 'pdf' ? (
                      <FileText className="w-10 h-10 text-white/20" />
                    ) : (
                      <Film className="w-10 h-10 text-white/20" />
                    )}
                    <span className={`absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded-full ${entry.kind === 'pdf' ? 'bg-cyan-500/80 text-black' : 'bg-pink-500/80 text-black'}`}>
                      {entry.kind === 'pdf' ? 'PDF → Video' : 'Shorts'}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col flex-grow">
                    <h3 className="font-semibold text-white truncate" title={entry.title}>{entry.title}</h3>
                    <p className="text-xs text-white/40 mt-1">
                      {new Date(entry.updatedAt).toLocaleString()} • {entry.count} {entry.kind === 'pdf' ? 'slides' : 'scenes'}
                    </p>

                    <div className="flex items-center gap-1 mt-4 pt-3 border-t border-white/10">
                      <button
                        onClick={() => handleOpen(entry)}
                        disabled={isBusy}
                        title="Open / continue working"
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                      >
                        <FolderOpen className="w-4 h-4" /> Open
                      </button>
                      <button
                        onClick={() => handleDownload(entry)}
                        disabled={isBusy}
                        title="Download rendered video"
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                      >
                        <Download className="w-4 h-4" /> Download
                      </button>
                      <button
                        onClick={() => handleRename(entry)}
                        disabled={isBusy}
                        title="Rename"
                        className="flex items-center justify-center px-2 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                      >
                        {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDelete(entry)}
                        disabled={isBusy}
                        title="Delete"
                        className="flex items-center justify-center px-2 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
