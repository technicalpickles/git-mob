import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Creates a temporary git repository for testing.
 * The repository is initialized with a basic user configuration.
 * 
 * @returns The path to the temporary directory
 */
export function createTempGitRepo(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-mob-test-'));
  execSync('git init', { cwd: tempDir });
  execSync('git config user.name "Test User"', { cwd: tempDir });
  execSync('git config user.email "test@example.com"', { cwd: tempDir });
  return tempDir;
}

/**
 * Recursively removes a temporary directory.
 * 
 * @param dir The directory path to remove
 */
export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Gets a git config value from a specific scope.
 * 
 * @param key The config key to retrieve
 * @param scope The scope to read from ('local', 'global', or 'file')
 * @param filePath The file path (required when scope is 'file')
 * @param cwd The working directory to run the command in
 * @returns The config value or undefined if not found
 */
export function getGitConfig(
  key: string,
  scope: 'local' | 'global' | 'file',
  filePath?: string,
  cwd?: string
): string | undefined {
  try {
    const scopeFlag = scope === 'file' ? `--file "${filePath}"` : `--${scope}`;
    const result = execSync(`git config ${scopeFlag} --get ${key}`, {
      cwd,
      encoding: 'utf8',
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

/**
 * Gets all values for a multi-value git config key from a specific scope.
 * 
 * @param key The config key to retrieve
 * @param scope The scope to read from ('local', 'global', or 'file')
 * @param filePath The file path (required when scope is 'file')
 * @param cwd The working directory to run the command in
 * @returns The config values or undefined if not found
 */
export function getAllGitConfig(
  key: string,
  scope: 'local' | 'global' | 'file',
  filePath?: string,
  cwd?: string
): string | undefined {
  try {
    const scopeFlag = scope === 'file' ? `--file "${filePath}"` : `--${scope}`;
    const result = execSync(`git config ${scopeFlag} --get-all ${key}`, {
      cwd,
      encoding: 'utf8',
    });
    return result.trim();
  } catch {
    return undefined;
  }
}

