import type { CaptionChunk } from './shortsCaptions';
import type { ShortsCaptionStyle, ShortsCaptionSize, ShortsCaptionPosition } from './ShortsVideoRenderer';
import { easingFunctions } from '../utils/easingFunctions';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Caption/title-card canvas drawing for the Shorts render pipeline. Pure
 * ctx + params — no renderer state — so the ShortsVideoRenderer encode loop can
 * stay focused on frame sampling and encoding.
 */

export function drawScrim(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, height * 0.45, width, height * 0.55);
}

/** Split a chunk into rendered lines that fit the safe width. */
export function layoutCaptionLines(
  ctx: CanvasRenderingContext2D,
  words: CaptionChunk['words'],
  maxWidth: number,
): Array<CaptionChunk['words']> {
  const lines: Array<CaptionChunk['words']> = [];
  let current: CaptionChunk['words'] = [];

  for (const word of words) {
    const candidate = [...current, word].map((w) => w.text).join(' ');
    if (current.length > 0 && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  chunk: CaptionChunk,
  localTime: number,
  width: number,
  height: number,
  style: ShortsCaptionStyle,
  accent: string,
  size: ShortsCaptionSize = 'medium',
  position: ShortsCaptionPosition = 'bottom',
) {
  const isClean = style === 'clean-lower';
  const isCinema = style === 'classic-cinema';
  const isBoldPop = style === 'bold-pop';
  const isHighlighter = style === 'highlighter';
  const isNeon = style === 'neon-glow';
  const isUpper = isBoldPop || isHighlighter || isNeon;
  const isPop = isBoldPop || isHighlighter || isNeon;

  const sizeMultiplier = size === 'small' ? 0.7 : size === 'large' ? 1.45 : 1.0;
  const baseFactor = isClean ? 0.048 : isCinema ? 0.052 : isHighlighter ? 0.074 : (isBoldPop || isNeon) ? 0.076 : 0.072;
  const fontSize = Math.round(width * baseFactor * sizeMultiplier);
  const weight = (isClean || isCinema) ? 600 : (isBoldPop || isHighlighter || isNeon) ? 900 : 800;
  ctx.font = `${weight} ${fontSize}px Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = width * (isClean || isCinema ? 0.80 : 0.84);
  // For uppercase styles, format words in uppercase for measurement and rendering
  const wordsForLayout = isUpper
    ? chunk.words.map((w) => ({ ...w, text: w.text.toUpperCase() }))
    : chunk.words;
  const lines = layoutCaptionLines(ctx, wordsForLayout, maxWidth);
  const lineHeight = fontSize * (isClean || isCinema ? 1.25 : 1.18);

  // Pop-in over the first 140ms of the chunk.
  const age = localTime - chunk.start;
  const popT = clamp(age / 0.14, 0, 1);
  const scale = isPop ? 0.86 + easeOutBack(popT) * 0.14 : 1;
  const fadeIn = easingFunctions.easeOutCubic(clamp(age / 0.1, 0, 1));

  let baselineY: number;
  if (position === 'top') {
    baselineY = (isClean || isCinema) ? height * 0.16 : height * 0.22;
  } else if (position === 'middle') {
    baselineY = height * 0.50;
  } else {
    // bottom
    baselineY = isClean ? height * 0.84 : isCinema ? height * 0.85 : height * 0.72;
  }

  const blockHeight = lines.length * lineHeight;
  const startY = baselineY - blockHeight / 2 + lineHeight / 2;

  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.translate(width / 2, baselineY);
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -baselineY);

  // If clean-lower or classic-cinema, draw a frosted/dark background container behind the captions
  if (isClean || isCinema) {
    let maxLineWidth = 0;
    lines.forEach((line) => {
      const lineText = line.map((w) => w.text).join(' ');
      const lw = ctx.measureText(lineText).width;
      if (lw > maxLineWidth) maxLineWidth = lw;
    });

    const padX = fontSize * (isCinema ? 0.75 : 0.9);
    const padY = fontSize * (isCinema ? 0.35 : 0.45);
    const pillW = maxLineWidth + padX * 2;
    const pillH = blockHeight + padY * 2;
    const pillX = width / 2 - pillW / 2;
    const pillY = baselineY - pillH / 2;
    const radius = isCinema ? Math.min(8, pillH / 2) : Math.min(16, pillH / 2);

    ctx.save();
    ctx.fillStyle = isCinema ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(pillX, pillY, pillW, pillH, radius);
    } else {
      ctx.rect(pillX, pillY, pillW, pillH);
    }
    ctx.fill();
    ctx.strokeStyle = isCinema ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  lines.forEach((line, lineIndex) => {
    const y = startY + lineIndex * lineHeight;
    const lineText = line.map((w) => w.text).join(' ');
    const lineWidth = ctx.measureText(lineText).width;
    let x = width / 2 - lineWidth / 2;

    ctx.textAlign = 'left';

    line.forEach((word, wordIndex) => {
      const spacer = wordIndex === line.length - 1 ? '' : ' ';
      const wordWidth = ctx.measureText(word.text + spacer).width;
      const pureWordWidth = ctx.measureText(word.text).width;
      const isActive = localTime >= word.start && localTime < word.end;
      const isSpoken = localTime >= word.start;

      if (isClean) {
        ctx.lineWidth = Math.max(3, fontSize * 0.08);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowColor = 'transparent';
        ctx.strokeText(word.text, x, y);

        ctx.fillStyle = isActive ? (accent || '#67E8F9') : '#FFFFFF';
        ctx.fillText(word.text, x, y);
      } else if (isCinema) {
        ctx.lineWidth = Math.max(3, fontSize * 0.08);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowColor = 'transparent';
        ctx.strokeText(word.text, x, y);

        ctx.fillStyle = isActive ? '#FDE047' : '#F8FAFC';
        ctx.fillText(word.text, x, y);
      } else if (isHighlighter) {
        if (isActive) {
          // Draw highlighter box behind the active word
          const padH = fontSize * 0.18;
          const padV = fontSize * 0.12;
          const boxX = x - padH;
          const boxY = y - fontSize * 0.55 - padV;
          const boxW = pureWordWidth + padH * 2;
          const boxH = fontSize * 1.1 + padV * 2;
          const boxRadius = Math.min(8, boxH / 4);

          ctx.save();
          ctx.fillStyle = '#FACC15'; // Bright Yellow
          ctx.shadowColor = 'rgba(250, 204, 21, 0.5)';
          ctx.shadowBlur = fontSize * 0.25;
          ctx.shadowOffsetY = fontSize * 0.03;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(boxX, boxY, boxW, boxH, boxRadius);
          } else {
            ctx.rect(boxX, boxY, boxW, boxH);
          }
          ctx.fill();
          ctx.restore();

          ctx.fillStyle = '#000000'; // Pure Black Text on Yellow
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.fillText(word.text, x, y);
        } else {
          ctx.lineWidth = Math.max(6, fontSize * 0.14);
          ctx.strokeStyle = '#000000';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = fontSize * 0.2;
          ctx.shadowOffsetY = fontSize * 0.04;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(word.text, x, y);
        }
      } else if (isNeon) {
        if (isActive) {
          ctx.lineWidth = Math.max(8, fontSize * 0.18);
          ctx.strokeStyle = '#000000';
          ctx.shadowColor = 'rgba(244, 63, 94, 0.95)'; // Electric Rose / Pink
          ctx.shadowBlur = fontSize * 0.45;
          ctx.shadowOffsetY = 0;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#FB7185';
          ctx.fillText(word.text, x, y);
        } else {
          ctx.lineWidth = Math.max(5, fontSize * 0.12);
          ctx.strokeStyle = 'rgba(147, 51, 234, 0.85)'; // Neon Violet
          ctx.shadowColor = 'rgba(147, 51, 234, 0.5)';
          ctx.shadowBlur = fontSize * 0.25;
          ctx.shadowOffsetY = 0;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(word.text, x, y);
        }
      } else if (isBoldPop) {
        // Bold Pop: punchy yellow active word with heavy black stroke
        if (isActive) {
          ctx.lineWidth = Math.max(8, fontSize * 0.18);
          ctx.strokeStyle = '#000000';
          ctx.shadowColor = 'rgba(250, 204, 21, 0.65)';
          ctx.shadowBlur = fontSize * 0.32;
          ctx.shadowOffsetY = fontSize * 0.04;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#FACC15'; // Vibrant Yellow
          ctx.fillText(word.text, x, y);
        } else {
          ctx.lineWidth = Math.max(6, fontSize * 0.14);
          ctx.strokeStyle = '#000000';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = fontSize * 0.22;
          ctx.shadowOffsetY = fontSize * 0.05;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(word.text, x, y);
        }
      } else {
        // Karaoke: glowing cyan for spoken words, solid crisp white for unspoken
        if (isSpoken) {
          ctx.lineWidth = Math.max(7, fontSize * 0.16);
          ctx.strokeStyle = '#000000';
          ctx.shadowColor = 'rgba(34, 211, 238, 0.85)';
          ctx.shadowBlur = fontSize * 0.35;
          ctx.shadowOffsetY = fontSize * 0.04;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#22D3EE'; // Electric Cyan
          ctx.fillText(word.text, x, y);
        } else {
          ctx.lineWidth = Math.max(6, fontSize * 0.14);
          ctx.strokeStyle = '#000000';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = fontSize * 0.22;
          ctx.shadowOffsetY = fontSize * 0.05;
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(word.text, x, y);
        }
      }

      x += wordWidth;
    });
  });

  ctx.restore();
}

/** Overlay the project title on top of scene 00's own background art (drawn just
 *  before this by drawSceneImage), replacing that scene's usual caption pass. */
export function drawTitleCard(
  ctx: CanvasRenderingContext2D,
  title: string,
  t: number,
  duration: number,
  width: number,
  height: number,
  accent: string,
) {
  // Fade in, hold, then fade out over the final 0.4s of the scene.
  const fadeOut = t > duration - 0.4 ? 1 - (t - (duration - 0.4)) / 0.4 : 1;
  const alpha = clamp(easingFunctions.easeOutCubic(clamp(t / 0.3, 0, 1)) * fadeOut, 0, 1);
  if (alpha <= 0 || !title.trim()) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Darken the scene art so the title stays legible over any background, then
  // a faint accent-tinted wash to ground the card in the project's color.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = alpha * 0.14;
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const fontSize = Math.round(width * 0.085);
  ctx.font = `800 ${fontSize}px Unbounded, Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Wrap the title into at most three lines.
  const maxWidth = width * 0.82;
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const shown = lines.slice(0, 3);

  const lineHeight = fontSize * 1.2;
  const startY = height / 2 - ((shown.length - 1) * lineHeight) / 2;

  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(8, fontSize * 0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = '#ffffff';
  shown.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });

  // Accent rule under the title.
  const ruleWidth = width * 0.16;
  ctx.fillStyle = accent;
  ctx.fillRect(
    width / 2 - ruleWidth / 2,
    startY + shown.length * lineHeight - lineHeight * 0.1,
    ruleWidth,
    Math.max(4, width * 0.006),
  );

  ctx.restore();
}
