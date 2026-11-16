import { Injectable } from '@nestjs/common';

export interface ImageSafetyResult {
  status: 'safe' | 'blocked' | 'unchecked';
  label?: string;
  reason?: string;
  traceId?: string;
}

/**
 * Pluggable image content-safety adapter.
 *
 * Set IMAGE_SAFETY_URL to a synchronous moderation gateway (for example a
 * service backed by WeChat mediaCheckAsync or a cloud image-audit product).
 * The gateway must return { safe: boolean, label?, reason?, traceId? }.
 * IMAGE_SAFETY_TOKEN is sent as Authorization: Bearer when configured.
 *
 * When IMAGE_SAFETY_URL is unset, images remain "unchecked" and continue to
 * enter the existing manual P2 review queue; this is intentional for local dev.
 */
@Injectable()
export class ImageSafetyService {
  async check(input: { url: string; mediaId: string; ownerId: string }): Promise<ImageSafetyResult> {
    const endpoint = process.env.IMAGE_SAFETY_URL || '';
    if (!endpoint) return { status: 'unchecked' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.IMAGE_SAFETY_TIMEOUT_MS || 5000));
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (process.env.IMAGE_SAFETY_TOKEN) headers.authorization = `Bearer ${process.env.IMAGE_SAFETY_TOKEN}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ url: input.url, mediaId: input.mediaId, ownerId: input.ownerId })
      });
      if (!response.ok) throw new Error('IMAGE_SAFETY_UNAVAILABLE');
      const payload = (await response.json()) as any;
      if (typeof payload?.safe !== 'boolean') throw new Error('IMAGE_SAFETY_INVALID_RESPONSE');
      return payload.safe
        ? { status: 'safe', label: payload.label, traceId: payload.traceId }
        : { status: 'blocked', label: payload.label, reason: payload.reason, traceId: payload.traceId };
    } finally {
      clearTimeout(timeout);
    }
  }
}
