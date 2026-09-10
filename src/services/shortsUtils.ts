import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { composeVisualPrompt } from './shortsScriptService';
import { createTitleCardScene, type ShortsProject, type ShortsScene } from './shortsProject';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const markWebLLMAsCached = () => {
  try {
    const current = JSON.parse(
      localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}',
    );
    current.webllm = true;
    localStorage.setItem('resource_cache_status', JSON.stringify(current));
  } catch {
    localStorage.setItem('resource_cache_status', '{"tts":false,"ffmpeg":false,"webllm":true}');
  }
};

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'short';

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';

/** Scene 00 — a real scene (own narration, image/video, TTS) flagged so the
 *  renderer overlays `title` on top of it instead of drawing its captions. */
export const buildTitleCardScene = (title: string, project: ShortsProject): ShortsScene =>
  createTitleCardScene(title, composeVisualPrompt(title || project.topic, project));
