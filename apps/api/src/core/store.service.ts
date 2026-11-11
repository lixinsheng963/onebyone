import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPool, type Pool } from 'mysql2/promise';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CampusStore } from './store';

@Injectable()
export class StoreService extends CampusStore implements OnModuleDestroy {
  private pool: Pool | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private readonly filePath = resolve(__dirname, '../../data/store.json');

  async init(): Promise<void> {
    const mode = process.env.DATA_MODE || 'file';
    if (mode === 'memory') return;
    if (mode === 'file') {
      this.loadFile();
      this.setChangeHook(() => this.schedulePersist());
      this.recheckPublishedSafety();
      this.markDirty();
      return;
    }

    try {
      this.pool = createPool({
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'campus',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'campus',
        waitForConnections: true,
        connectionLimit: 5,
        charset: 'utf8mb4'
      });
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
          id TINYINT NOT NULL,
          snapshot JSON NOT NULL,
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      const [rows] = await this.pool.query('SELECT snapshot FROM app_state WHERE id = 1');
      const row = Array.isArray(rows) && rows.length ? (rows[0] as { snapshot: unknown }) : null;
      if (row?.snapshot) {
        const snapshot = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
        this.importSnapshot(snapshot as any);
      }
      this.setChangeHook(() => this.schedulePersist());
      this.recheckPublishedSafety();
      this.markDirty();
      console.log('MySQL snapshot persistence enabled');
    } catch (error) {
      console.warn('MySQL persistence unavailable, falling back to local file:', (error as Error).message);
      if (this.pool) {
        await this.pool.end().catch(() => undefined);
        this.pool = null;
      }
      this.loadFile();
      this.setChangeHook(() => this.schedulePersist());
      this.recheckPublishedSafety();
      this.markDirty();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    await this.flush();
    if (this.pool) await this.pool.end().catch(() => undefined);
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.flush().catch((error) => console.warn('Store snapshot write failed:', error.message));
    }, 120);
  }

  private loadFile(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const snapshot = JSON.parse(readFileSync(this.filePath, 'utf8'));
      this.importSnapshot(snapshot);
      console.log(`Local snapshot loaded: ${this.filePath}`);
    } catch (error) {
      console.warn('Local snapshot read failed:', (error as Error).message);
    }
  }

  private async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.exportSnapshot());
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO app_state (id, snapshot) VALUES (1, ?) ON DUPLICATE KEY UPDATE snapshot = VALUES(snapshot)',
        [snapshot]
      );
      return;
    }
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, snapshot, 'utf8');
    renameSync(tmp, this.filePath);
  }
}
