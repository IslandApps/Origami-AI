import React from 'react';
import { ArrowRight } from 'lucide-react';
import { ShortsComposer } from './ShortsComposer';
import type { GlobalSettings } from '../../services/storage';
import type { ShortsProject } from '../../services/shortsProject';

interface ShortsComposeStageProps {
  project: ShortsProject;
  isBusy: boolean;
  setStage: (stage: 'compose' | 'storyboard') => void;
  patchProject: (patch: Partial<ShortsProject>) => void;
  onGenerate: () => void | Promise<void>;
  onPickMusic: () => void;
  onUploadMusic: (file: File) => void;
  onUploadImages: (files: File[]) => void;
  onOpenSettings: () => void;
  onOpenVoiceAudition: () => void;
  useOpenAI: boolean;
  globalSettings: GlobalSettings;
  saveSettings: (next: GlobalSettings) => void | Promise<void>;
  openAIConfigured: boolean;
  webLlmModelLabel: string;
  imageModelOptions: Array<{ id: string; name: string }>;
  videoModelOptions: Array<{ id: string; name: string }>;
}

export const ShortsComposeStage: React.FC<ShortsComposeStageProps> = ({
  project,
  isBusy,
  setStage,
  patchProject,
  onGenerate,
  onPickMusic,
  onUploadMusic,
  onUploadImages,
  onOpenSettings,
  onOpenVoiceAudition,
  useOpenAI,
  globalSettings,
  saveSettings,
  openAIConfigured,
  webLlmModelLabel,
  imageModelOptions,
  videoModelOptions,
}) => {
  return (
    <div className="space-y-5">
      {/* Mirror of the Edit header's "← Build" crumb: once scenes
          exist, Build is not a one-way door — Edit stays one tap
          away with every scene and asset intact. No confirmation
          needed, unlike the reverse trip, because nothing is at
          risk of being replaced. */}
      {project.scenes.length > 0 && (
        <div className="flex items-baseline gap-3">
          <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
            Build
          </h2>
          <span aria-hidden className="h-px w-6 shrink-0 bg-white/20" />
          <button
            type="button"
            onClick={() => setStage('storyboard')}
            disabled={isBusy}
            className="focus-ring flex shrink-0 items-center gap-1.5 rounded text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition-colors hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Edit
            <ArrowRight className="h-3 w-3" />
          </button>
          <span className="text-[11px] text-white/35">
            {project.scenes.length} scene{project.scenes.length > 1 ? 's' : ''} in progress
          </span>
        </div>
      )}

      <ShortsComposer
        project={project}
        onChange={patchProject}
        onGenerate={onGenerate}
        onPickMusic={onPickMusic}
        onClearMusic={() => patchProject({ music: null })}
        onUploadMusic={onUploadMusic}
        onUploadImages={onUploadImages}
        onOpenSettings={onOpenSettings}
        onOpenVoiceAudition={onOpenVoiceAudition}
        isBusy={isBusy}
        useOpenAI={useOpenAI}
        onToggleOpenAI={(value) => void saveSettings({ ...globalSettings, shortsUseOpenAI: value })}
        openAIConfigured={openAIConfigured}
        webLlmModelLabel={webLlmModelLabel}
        imageModels={imageModelOptions}
        videoModels={videoModelOptions}
      />
    </div>
  );
};
