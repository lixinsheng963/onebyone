import { Injectable } from '@nestjs/common';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import COS from 'cos-nodejs-sdk-v5';
import type { Media } from '../types';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class StorageService {
  private readonly localRoot = resolve(__dirname, '../../uploads');
  private readonly cos: COS | null;
  private readonly bucket = process.env.COS_BUCKET || '';
  private readonly region = process.env.COS_REGION || 'ap-guangzhou';

  constructor() {
    const secretId = process.env.COS_SECRET_ID || '';
    const secretKey = process.env.COS_SECRET_KEY || '';
    this.cos = secretId && secretKey && this.bucket
      ? new COS({ SecretId: secretId, SecretKey: secretKey })
      : null;
  }

  async upload(buffer: Buffer, mime: string, ownerId: string): Promise<Media> {
    if (!ALLOWED.has(mime)) throw new Error('UNSUPPORTED_IMAGE_TYPE');
    if (buffer.length > MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');

    let meta;
    let processed: Buffer;
    try {
      const probe = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate();
      meta = await probe.metadata();
      if (!meta.width || !meta.height) throw new Error('INVALID_IMAGE');
      processed = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new Error('INVALID_IMAGE');
    }
    const output = await sharp(processed).metadata();
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.jpg`;
    const media: Media = {
      id: `media_${randomUUID()}`,
      url: '',
      width: output.width || meta.width,
      height: output.height || meta.height,
      objectKey: key,
      ownerId,
      storage: this.cos ? 'cos' : 'local'
    };

    if (this.cos) {
      await new Promise<void>((resolvePromise, reject) => {
        this.cos!.putObject(
          { Bucket: this.bucket, Region: this.region, Key: key, Body: processed, ContentType: 'image/jpeg' },
          (error) => (error ? reject(error) : resolvePromise())
        );
      });
      const cdnBase = (process.env.COS_CDN_BASE || '').replace(/\/$/, '');
      media.url = cdnBase ? `${cdnBase}/${key}` : await this.signedUrl(key);
    } else {
      const filePath = resolve(this.localRoot, key);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, processed);
      media.url = `${this.publicBase()}/uploads/${key}`;
    }
    media.thumbUrl = media.url;
    return media;
  }

  async deleteMedia(media: Media[]): Promise<void> {
    for (const item of media) {
      const key = item.objectKey;
      if (!key) continue;
      if (this.cos && item.storage === 'cos') {
        await new Promise<void>((resolvePromise) => {
          this.cos!.deleteObject(
            { Bucket: this.bucket, Region: this.region, Key: key },
            () => resolvePromise()
          );
        });
      } else {
        try {
          unlinkSync(resolve(this.localRoot, key));
        } catch {
          // Already removed; deletion is idempotent.
        }
      }
    }
  }

  private publicBase(): string {
    return (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).replace(/\/$/, '');
  }

  private async signedUrl(key: string): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      this.cos!.getObjectUrl(
        { Bucket: this.bucket, Region: this.region, Key: key, Sign: true, Expires: 7 * 24 * 3600 },
        (error, data) => (error ? reject(error) : resolvePromise(data.Url))
      );
    });
  }
}
