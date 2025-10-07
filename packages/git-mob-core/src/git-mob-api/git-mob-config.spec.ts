import { updateConfig } from '../config-manager.js';
import {
  localTemplate,
  fetchFromGitHub,
  getSetCoAuthors,
  addCoAuthor,
  removeGitMobSection,
} from './git-mob-config.js';
import { setConfig } from './exec-command.js';
import { createTempGitRepo, cleanupTempDir } from '../test-helpers/git-test-helpers.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('git-mob-config scope behavior', () => {
  let tempDir: string;
  let originalCwd: string;
  let customConfigFile: string;

  beforeEach(() => {
    tempDir = createTempGitRepo();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    customConfigFile = path.join(tempDir, '.git-mob-config');

    // Clean up any previous config
    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  afterEach(() => {
    // Clean up any global config written during tests
    try {
      execSync('git config --global --remove-section git-mob', { stdio: 'ignore' });
    } catch {
      // Section may not exist
    }
    try {
      execSync('git config --global --unset git-mob-config.github-fetch', { stdio: 'ignore' });
    } catch {
      // May not exist
    }

    process.chdir(originalCwd);
    cleanupTempDir(tempDir);
    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  describe('localTemplate', () => {
    it('reads from local scope only, not custom file', async () => {
      // Set in custom file - should NOT be seen by localTemplate
      process.env.GITMOB_CONFIG_FILE = customConfigFile;
      await setConfig('git-mob-config.use-local-template', 'true', 'mob');

      expect(await localTemplate()).toBe(false);

      // Set in local config - should be seen
      await setConfig('git-mob-config.use-local-template', 'true', 'local');
      expect(await localTemplate()).toBe(true);
    });

    it('returns false when not set in local config', async () => {
      expect(await localTemplate()).toBe(false);
    });

    it('reads from .git/config, not global config', async () => {
      // Set in global config (which is now redirected to temp file)
      execSync('git config --global git-mob-config.use-local-template true');

      // Should not be seen (not in local)
      expect(await localTemplate()).toBe(false);
    });
  });

  describe('fetchFromGitHub', () => {
    it('reads from mob scope (custom file when set)', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      await setConfig('git-mob-config.github-fetch', 'true', 'mob');
      expect(await fetchFromGitHub()).toBe(true);

      // Verify it's in the custom file
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('github-fetch');
    });

    it('falls back to global when custom file not set', async () => {
      // Set in global config (redirected to temp file)
      execSync('git config --global git-mob-config.github-fetch true');

      expect(await fetchFromGitHub()).toBe(true);
    });

    it('returns false when not set', async () => {
      // Clear any existing global github-fetch setting
      try {
        execSync('git config --global --unset git-mob-config.github-fetch', { stdio: 'ignore' });
      } catch {
        // May not exist
      }

      expect(await fetchFromGitHub()).toBe(false);
    });
  });

  describe('addCoAuthor and getSetCoAuthors', () => {
    it('writes to custom file when GITMOB_CONFIG_FILE is set', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      await addCoAuthor('Alice Dev <alice@example.com>');
      await addCoAuthor('Bob Smith <bob@example.com>');

      const coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Alice Dev <alice@example.com>');
      expect(coauthors).toContain('Bob Smith <bob@example.com>');

      // Verify it's in the custom file
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('Alice Dev');
      expect(contents).toContain('Bob Smith');
    });

    it('does NOT write to global config when custom file is set', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      await addCoAuthor('Custom Author <custom@example.com>');

      // Should NOT be in global config
      try {
        const globalCoAuthors = execSync(
          'git config --global --get-all git-mob.co-author',
          { encoding: 'utf8' }
        ).trim();
        expect(globalCoAuthors).not.toContain('Custom Author');
      } catch (error) {
        // Error is expected if not set in global - that's good
        expect(error).toBeDefined();
      }
    });

    it('writes to global config when custom file is NOT set', async () => {
      await addCoAuthor('Global Author <global@example.com>');

      // Should be in global config (redirected to temp file)
      const globalCoAuthors = execSync(
        'git config --global --get-all git-mob.co-author',
        { encoding: 'utf8' }
      ).trim();
      expect(globalCoAuthors).toContain('Global Author');
    });

    it('can add multiple co-authors to custom file', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      await addCoAuthor('Author 1 <a1@example.com>');
      await addCoAuthor('Author 2 <a2@example.com>');
      await addCoAuthor('Author 3 <a3@example.com>');

      const coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Author 1');
      expect(coauthors).toContain('Author 2');
      expect(coauthors).toContain('Author 3');
    });
  });

  describe('removeGitMobSection', () => {
    it('removes git-mob section from custom file', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Add co-authors
      await addCoAuthor('John Doe <john@example.com>');
      await addCoAuthor('Jane Smith <jane@example.com>');

      // Verify they exist
      let coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('John Doe');

      // Remove section
      await removeGitMobSection();

      // Verify they're gone
      coauthors = await getSetCoAuthors();
      expect(coauthors).toBeUndefined();
    });

    it('removes from global config when custom file not set', async () => {
      // Add to global
      await addCoAuthor('Global Author <global@example.com>');

      // Verify it exists
      let globalCoAuthors = execSync(
        'git config --global --get-all git-mob.co-author',
        { encoding: 'utf8' }
      ).trim();
      expect(globalCoAuthors).toContain('Global Author');

      // Remove
      await removeGitMobSection();

      // Verify it's gone
      try {
        execSync('git config --global --get-all git-mob.co-author', {
          encoding: 'utf8',
        });
        fail('Should have thrown error - section should not exist');
      } catch (error) {
        // Expected - section doesn't exist
        expect(error).toBeDefined();
      }
    });

    it('does not throw when section does not exist', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Should not throw
      await expect(removeGitMobSection()).resolves.not.toThrow();
    });
  });

  describe('integration: switching between custom file and global', () => {
    it('can switch contexts and maintain separate state', async () => {
      // Add to custom file
      process.env.GITMOB_CONFIG_FILE = customConfigFile;
      await addCoAuthor('Custom Author <custom@example.com>');

      let coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Custom Author');

      // Switch to global
      delete process.env.GITMOB_CONFIG_FILE;
      updateConfig('gitConfigFile', undefined);

      // Try to add to global with retry on lock error
      let retries = 3;
      while (retries > 0) {
        try {
          await addCoAuthor('Global Author <global@example.com>');
          break;
        } catch (error: any) {
          if (error.message?.includes('could not lock config file') && retries > 1) {
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 100));
            retries--;
          } else {
            throw error;
          }
        }
      }

      coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Global Author');
      expect(coauthors).not.toContain('Custom Author');

      // Switch back to custom
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Custom Author');
      expect(coauthors).not.toContain('Global Author');
    });
  });
});

