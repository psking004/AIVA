import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FileTool {
  private readonly logger = new Logger(FileTool.name);
  private readonly workspaceRoot = path.resolve(process.cwd());

  private resolveSafePath(targetPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, targetPath || '');
    const relative = path.relative(this.workspaceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Security boundary violation: Path outside workspace root: ${targetPath}`);
    }
    return resolved;
  }

  async execute(userId: string, action: string, params: Record<string, unknown> = {}) {
    this.logger.log(`FileTool executing: ${action} for user ${userId}`);
    const filePath = String(params.filePath || params.path || '');

    switch (action) {
      case 'read': {
        const fullPath = this.resolveSafePath(filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        return { success: true, action, path: filePath, content };
      }
      case 'write': {
        const fullPath = this.resolveSafePath(filePath);
        const content = String(params.content || '');
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        return { success: true, action, path: filePath, bytesWritten: Buffer.byteLength(content) };
      }
      case 'list': {
        const fullPath = this.resolveSafePath(filePath || '.');
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        const items = entries.map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory(),
        }));
        return { success: true, action, path: filePath, items };
      }
      case 'exists': {
        try {
          const fullPath = this.resolveSafePath(filePath);
          await fs.access(fullPath);
          return { success: true, action, path: filePath, exists: true };
        } catch {
          return { success: true, action, path: filePath, exists: false };
        }
      }
      default:
        return { success: true, action, params };
    }
  }
}
