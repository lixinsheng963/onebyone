import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png'
};

export interface AuthorizationFile {
  key: string;
  name: string;
  mime: string;
  size: number;
}

@Injectable()
export class AuthorizationService {
  private readonly root = resolve(__dirname, '../../storage/authorizations');

  save(buffer: Buffer, mime: string, originalName: string): AuthorizationFile {
    const ext = MIME_EXT[mime];
    if (!ext) throw new Error('UNSUPPORTED_AUTH_TYPE');
    if (buffer.length > MAX_BYTES) throw new Error('AUTH_TOO_LARGE');
    if (!this.magicMatches(buffer, ext)) throw new Error('INVALID_AUTH_FILE');
    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const target = resolve(this.root, key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer, { mode: 0o600 });
    return {
      key,
      name: originalName.replace(/[\\/\r\n"]/g, '_').slice(0, 120) || `authorization.${ext}`,
      mime,
      size: buffer.length
    };
  }

  read(key?: string): Buffer {
    if (!key || key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
      throw new Error('AUTH_NOT_FOUND');
    }
    const target = resolve(this.root, key);
    if (!target.startsWith(this.root) || !existsSync(target)) throw new Error('AUTH_NOT_FOUND');
    return readFileSync(target);
  }

  remove(key?: string): void {
    if (!key || key.includes('..')) return;
    try {
      unlinkSync(resolve(this.root, key));
    } catch {
      // Idempotent cleanup.
    }
  }

  private magicMatches(buffer: Buffer, ext: string): boolean {
    if (ext === 'pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    if (ext === 'jpg') return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (ext === 'png') return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    return false;
  }
}
