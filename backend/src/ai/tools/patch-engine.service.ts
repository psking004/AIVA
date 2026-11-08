/**
 * AIVA Targeted Code Patch Engine
 *
 * Implements safe, atomic diff/chunk code patching:
 * - Inspects target file and validates workspace boundaries
 * - Searches for exact target blocks (with line-ending normalization)
 * - Detects and rejects ambiguous matches (blocks matching multiple locations)
 * - Automatic atomic backup creation (.bak)
 * - Post-patch readback verification
 * - Rollback mechanism upon verification failure or exception
 */

import { Injectable, Logger } from '@nestjs/common';
import { ProjectAwarenessService } from '../kernel/project-awareness.service';
import * as fs from 'fs';
import * as path from 'path';

export interface PatchOperation {
  filePath: string;
  searchBlock?: string | undefined;
  searchSnippet?: string | undefined;
  replacementBlock?: string | undefined;
  replaceSnippet?: string | undefined;
  allowMultiple?: boolean | undefined;
  keepBackup?: boolean | undefined;
}

export interface PatchResult {
  success: boolean;
  filePath: string;
  fullPath: string;
  backupPath?: string | undefined;
  matchesFound: number;
  linesModified: number;
  originalSize: number;
  newSize: number;
  verified: boolean;
  error?: string | undefined;
  rolledBack?: boolean | undefined;
}

@Injectable()
export class PatchEngineService {
  private readonly logger = new Logger(PatchEngineService.name);

  constructor(private readonly projectAwareness: ProjectAwarenessService) {
    this.logger.log('PatchEngineService initialized for targeted code modification');
  }

  /**
   * Apply a targeted patch to a file with automatic backup and rollback
   */
  public async applyPatch(
    op: PatchOperation,
    validator?: ((filePath: string) => Promise<{ valid: boolean; reason?: string | undefined }>) | undefined,
  ): Promise<PatchResult> {
    const workspaceRoot = path.resolve(this.projectAwareness.getWorkspaceRoot());
    const fullPath = path.isAbsolute(op.filePath)
      ? path.resolve(op.filePath)
      : path.resolve(workspaceRoot, op.filePath);

    // 1. Boundary check: Stay inside workspace or temp directory
    const tempRoot = path.resolve(require('os').tmpdir());
    const insideWorkspace = fullPath.toLowerCase().startsWith(workspaceRoot.toLowerCase());
    const insideTemp = fullPath.toLowerCase().startsWith(tempRoot.toLowerCase());

    if (!insideWorkspace && !insideTemp) {
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        matchesFound: 0,
        linesModified: 0,
        originalSize: 0,
        newSize: 0,
        verified: false,
        error: `Security violation: File "${fullPath}" is outside approved workspace roots.`,
      };
    }

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        matchesFound: 0,
        linesModified: 0,
        originalSize: 0,
        newSize: 0,
        verified: false,
        error: `Target file not found: ${fullPath}`,
      };
    }

    const originalContent = fs.readFileSync(fullPath, 'utf8');
    const originalSize = Buffer.byteLength(originalContent, 'utf8');

    const searchTarget = op.searchBlock ?? op.searchSnippet ?? '';
    const replaceTarget = op.replacementBlock ?? op.replaceSnippet ?? '';

    // 2. Normalize line endings for reliable matching
    const normOriginal = originalContent.replace(/\r\n/g, '\n');
    const normSearch = searchTarget.replace(/\r\n/g, '\n');
    const normReplace = replaceTarget.replace(/\r\n/g, '\n');

    // Count occurrences
    const occurrences = normOriginal.split(normSearch).length - 1;

    if (occurrences === 0) {
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        matchesFound: 0,
        linesModified: 0,
        originalSize,
        newSize: originalSize,
        verified: false,
        error: `Search block was not found in ${op.filePath}. Verify exact content before patching.`,
      };
    }

    if (occurrences > 1 && !op.allowMultiple) {
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        matchesFound: occurrences,
        linesModified: 0,
        originalSize,
        newSize: originalSize,
        verified: false,
        error: `Ambiguous match / ambiguous target: search block found ${occurrences} times in ${op.filePath}. Provide more surrounding context to disambiguate.`,
      };
    }

    // 3. Create Backup
    const backupPath = `${fullPath}.aiva_${Date.now()}.bak`;
    try {
      fs.writeFileSync(backupPath, originalContent, 'utf8');
    } catch (err: any) {
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        matchesFound: occurrences,
        linesModified: 0,
        originalSize,
        newSize: originalSize,
        verified: false,
        error: `Failed to create file backup: ${err.message}`,
      };
    }

    // 4. Perform Replacement
    let patchedContent = '';
    if (op.allowMultiple) {
      patchedContent = normOriginal.split(normSearch).join(normReplace);
    } else {
      const idx = normOriginal.indexOf(normSearch);
      patchedContent = normOriginal.slice(0, idx) + normReplace + normOriginal.slice(idx + normSearch.length);
    }

    // Restore original line ending style if file was CRLF
    if (originalContent.includes('\r\n')) {
      patchedContent = patchedContent.replace(/\n/g, '\r\n');
    }

    try {
      fs.writeFileSync(fullPath, patchedContent, 'utf8');
    } catch (writeErr: any) {
      this.rollbackBackup(fullPath, backupPath);
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        backupPath,
        matchesFound: occurrences,
        linesModified: 0,
        originalSize,
        newSize: originalSize,
        verified: false,
        error: `Failed to write patched file: ${writeErr.message}`,
        rolledBack: true,
      };
    }

    // 5. Read back to verify
    const readBack = fs.readFileSync(fullPath, 'utf8');
    if (readBack !== patchedContent) {
      this.rollbackBackup(fullPath, backupPath);
      return {
        success: false,
        filePath: op.filePath,
        fullPath,
        backupPath,
        matchesFound: occurrences,
        linesModified: 0,
        originalSize,
        newSize: originalSize,
        verified: false,
        error: 'Integrity check failed: readback content differed from written patch.',
        rolledBack: true,
      };
    }

    // 6. Optional compiler / project validation
    if (validator) {
      try {
        const valRes = await validator(fullPath);
        if (!valRes.valid) {
          this.logger.warn(`Patch validation failed for ${op.filePath}: ${valRes.reason}. Rolling back...`);
          this.rollbackBackup(fullPath, backupPath);
          return {
            success: false,
            filePath: op.filePath,
            fullPath,
            backupPath,
            matchesFound: occurrences,
            linesModified: 0,
            originalSize,
            newSize: originalSize,
            verified: false,
            error: `Project validation failed after patch: ${valRes.reason}`,
            rolledBack: true,
          };
        }
      } catch (valErr: any) {
        this.rollbackBackup(fullPath, backupPath);
        return {
          success: false,
          filePath: op.filePath,
          fullPath,
          backupPath,
          matchesFound: occurrences,
          linesModified: 0,
          originalSize,
          newSize: originalSize,
          verified: false,
          error: `Validator exception: ${valErr.message}`,
          rolledBack: true,
        };
      }
    }

    // If keepBackup is explicitly set to false, clean it up; otherwise preserve backup for audit
    if (op.keepBackup === false) {
      try {
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
      } catch (_) {}
    }

    const newSize = Buffer.byteLength(patchedContent, 'utf8');
    const linesModified = Math.abs(normReplace.split('\n').length - normSearch.split('\n').length) + normReplace.split('\n').length;

    this.logger.log(`Successfully patched ${op.filePath} (${linesModified} lines modified)`);

    return {
      success: true,
      filePath: op.filePath,
      fullPath,
      backupPath,
      matchesFound: occurrences,
      linesModified,
      originalSize,
      newSize,
      verified: true,
    };
  }

  private rollbackBackup(targetPath: string, backupPath: string): void {
    try {
      if (fs.existsSync(backupPath)) {
        const backupData = fs.readFileSync(backupPath, 'utf8');
        fs.writeFileSync(targetPath, backupData, 'utf8');
        fs.unlinkSync(backupPath);
        this.logger.log(`Rolled back ${targetPath} from ${backupPath}`);
      }
    } catch (err: any) {
      this.logger.error(`Critical error rolling back ${targetPath}: ${err.message}`);
    }
  }
}
