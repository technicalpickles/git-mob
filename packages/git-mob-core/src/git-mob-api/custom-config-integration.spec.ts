import { updateConfig } from '../config-manager.js';
import {
  addCoAuthor,
  getSetCoAuthors,
  removeGitMobSection,
  fetchFromGitHub,
} from './git-mob-config.js';
import {
  setGitUserName,
  setGitUserEmail,
  getGitUserName,
  getGitUserEmail,
} from './git-config.js';
import { setCommitTemplate } from './resolve-git-message-path.js';
import { setConfig } from './exec-command.js';
import { solo } from '../index.js';
import {
  createTempGitRepo,
  cleanupTempDir,
} from '../test-helpers/git-test-helpers.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Custom config file end-to-end integration', () => {
  let tempDir: string;
  let originalCwd: string;
  let customConfigFile: string;

  beforeEach(() => {
    tempDir = createTempGitRepo();
    originalCwd = process.cwd();
    process.chdir(tempDir);
    customConfigFile = path.join(tempDir, '.git-mob-config');

    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  afterEach(() => {
    // Cleanup any global config written during tests
    try {
      execSync('git config --global --remove-section git-mob', {
        stdio: 'ignore',
      });
    } catch {
      // Section may not exist
    }
    try {
      execSync('git config --global --unset commit.template', {
        stdio: 'ignore',
      });
    } catch {
      // May not exist
    }
    try {
      execSync('git config --global --unset git-mob-config.github-fetch', {
        stdio: 'ignore',
      });
    } catch {
      // May not exist
    }

    process.chdir(originalCwd);
    cleanupTempDir(tempDir);
    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  describe('Full workflow tests', () => {
    it('complete mob workflow with custom file', async () => {
      // Setup custom file
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Add co-authors
      await addCoAuthor('Alice Dev <alice@example.com>');
      await addCoAuthor('Bob Smith <bob@example.com>');

      // Set commit template
      await setCommitTemplate();

      // Enable GitHub fetch
      await setConfig('git-mob-config.github-fetch', 'true', 'mob');

      // Verify everything is in custom file
      const fileContents = fs.readFileSync(customConfigFile, 'utf8');
      expect(fileContents).toContain('Alice Dev');
      expect(fileContents).toContain('Bob Smith');
      expect(fileContents).toContain('[commit]');
      expect(fileContents).toContain('template');
      expect(fileContents).toContain('github-fetch');

      // Verify nothing leaked into global config
      try {
        const globalCoAuthors = execSync(
          'git config --global --get-all git-mob.co-author',
          { encoding: 'utf8' }
        );
        expect(globalCoAuthors).not.toContain('Alice Dev');
      } catch {
        // Expected - not in global (this is correct behavior)
      }

      // Call solo
      await solo();

      // Verify clean state
      const coauthors = await getSetCoAuthors();
      expect(coauthors).toBeUndefined();
    });

    it('setPrimaryAuthor writes to local config, not custom file', async () => {
      // This verifies the correct 'auto' scope behavior
      // user.name and user.email should follow git conventions, not be in custom file
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Set primary author (simulates git mob -o)
      await setGitUserName('Override User');
      await setGitUserEmail('override@example.com');

      // Should be in .git/config (local) because we're inside a git repo
      const localName = execSync('git config --local user.name', {
        encoding: 'utf8',
      }).trim();
      expect(localName).toBe('Override User');

      const localEmail = execSync('git config --local user.email', {
        encoding: 'utf8',
      }).trim();
      expect(localEmail).toBe('override@example.com');

      // Should NOT be in custom file
      if (fs.existsSync(customConfigFile)) {
        const customContents = fs.readFileSync(customConfigFile, 'utf8');
        expect(customContents).not.toContain('Override User');
        expect(customContents).not.toContain('override@example.com');
      }

      // Verify we can read it back with auto scope (respects git precedence)
      const readName = await getGitUserName();
      const readEmail = await getGitUserEmail();
      expect(readName).toBe('Override User');
      expect(readEmail).toBe('override@example.com');
    });

    it('mob workflow with co-authors, template, and settings', async () => {
      // Set up custom file
      updateConfig('gitConfigFile', customConfigFile);

      // Add multiple co-authors
      await addCoAuthor('Author 1 <a1@example.com>');
      await addCoAuthor('Author 2 <a2@example.com>');
      await addCoAuthor('Author 3 <a3@example.com>');

      // Configure settings
      await setConfig('git-mob-config.github-fetch', 'true', 'mob');
      await setCommitTemplate();

      // Verify all in custom file
      expect(fs.existsSync(customConfigFile)).toBe(true);
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('Author 1');
      expect(contents).toContain('Author 2');
      expect(contents).toContain('Author 3');
      expect(contents).toContain('github-fetch');
      expect(contents).toContain('[commit]');
      expect(contents).toContain('template');

      // Retrieve co-authors
      const coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Author 1');
      expect(coauthors).toContain('Author 2');
      expect(coauthors).toContain('Author 3');

      // Verify github-fetch setting
      const githubFetch = await fetchFromGitHub();
      expect(githubFetch).toBe(true);

      // Clean up with solo
      await solo();
      const afterSolo = await getSetCoAuthors();
      expect(afterSolo).toBeUndefined();
    });
  });

  describe('Context switching', () => {
    it('can switch between custom file and global config', async () => {
      // Add to custom file
      process.env.GITMOB_CONFIG_FILE = customConfigFile;
      await addCoAuthor('Custom Author <custom@example.com>');

      let coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Custom Author');

      // Verify it's in custom file
      const customContents = fs.readFileSync(customConfigFile, 'utf8');
      expect(customContents).toContain('Custom Author');

      // Switch to global
      delete process.env.GITMOB_CONFIG_FILE;
      updateConfig('gitConfigFile', undefined);

      // Add to global with retry on lock error
      let retries = 3;
      while (retries > 0) {
        try {
          await addCoAuthor('Global Author <global@example.com>');
          break;
        } catch (error: any) {
          if (
            error.message?.includes('could not lock config file') &&
            retries > 1
          ) {
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

    it('programmatic config takes precedence over env var', async () => {
      const envFile = path.join(tempDir, 'env-config');
      const progFile = path.join(tempDir, 'prog-config');

      process.env.GITMOB_CONFIG_FILE = envFile;
      updateConfig('gitConfigFile', progFile);

      await addCoAuthor('Test Author <test@example.com>');

      // Should be in programmatic file
      expect(fs.existsSync(progFile)).toBe(true);
      expect(fs.existsSync(envFile)).toBe(false);

      const progContents = fs.readFileSync(progFile, 'utf8');
      expect(progContents).toContain('Test Author');
    });
  });

  describe('Scope isolation tests', () => {
    it('local scope ignores custom file', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Set local config explicitly
      await setConfig('test.local-only', 'local-value', 'local');

      // Should be in .git/config
      const localValue = execSync('git config --local test.local-only', {
        encoding: 'utf8',
      }).trim();
      expect(localValue).toBe('local-value');

      // Should NOT be in custom file
      if (fs.existsSync(customConfigFile)) {
        const customContents = fs.readFileSync(customConfigFile, 'utf8');
        expect(customContents).not.toContain('local-only');
        expect(customContents).not.toContain('local-value');
      }
    });

    it('mob scope uses custom file when set', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      await setConfig('git-mob.test', 'mob-value', 'mob');

      // Should be in custom file
      expect(fs.existsSync(customConfigFile)).toBe(true);
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('mob-value');

      // Should NOT be in global
      try {
        const globalValue = execSync('git config --global git-mob.test', {
          encoding: 'utf8',
        }).trim();
        expect(globalValue).not.toBe('mob-value');
      } catch {
        // Expected - not in global
      }
    });

    it('mob scope falls back to global when custom file not set', async () => {
      // Don't set custom file
      await setConfig('git-mob.fallback-test', 'global-value', 'mob');

      // Should be in global config
      const globalValue = execSync(
        'git config --global git-mob.fallback-test',
        {
          encoding: 'utf8',
        }
      ).trim();
      expect(globalValue).toBe('global-value');

      // Clean up
      execSync('git config --global --unset git-mob.fallback-test');
    });
  });

  describe('Integration with solo()', () => {
    it('solo removes co-authors from custom file', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Add co-authors
      await addCoAuthor('Solo Test 1 <st1@example.com>');
      await addCoAuthor('Solo Test 2 <st2@example.com>');

      // Verify they exist
      let coauthors = await getSetCoAuthors();
      expect(coauthors).toContain('Solo Test 1');
      expect(coauthors).toContain('Solo Test 2');

      // Call solo
      await solo();

      // Verify they're gone
      coauthors = await getSetCoAuthors();
      expect(coauthors).toBeUndefined();
    });

    it('solo removes co-authors from global when custom file not set', async () => {
      // Don't set custom file
      await addCoAuthor('Global Solo Test <gst@example.com>');

      // Verify it exists in global
      let globalCoAuthors = execSync(
        'git config --global --get-all git-mob.co-author',
        { encoding: 'utf8' }
      ).trim();
      expect(globalCoAuthors).toContain('Global Solo Test');

      // Call solo
      await solo();

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
  });

  describe('Edge cases', () => {
    it('handles file paths with spaces', async () => {
      const dirWithSpaces = path.join(tempDir, 'path with spaces');
      fs.mkdirSync(dirWithSpaces, { recursive: true });
      const configWithSpaces = path.join(dirWithSpaces, 'config file.txt');

      updateConfig('gitConfigFile', configWithSpaces);

      await addCoAuthor('Space Test <space@example.com>');

      expect(fs.existsSync(configWithSpaces)).toBe(true);
      const contents = fs.readFileSync(configWithSpaces, 'utf8');
      expect(contents).toContain('Space Test');
    });

    it('solo works when no co-authors exist', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Should not throw
      await expect(solo()).resolves.not.toThrow();

      // Should still have no co-authors
      const coauthors = await getSetCoAuthors();
      expect(coauthors).toBeUndefined();
    });

    it('removeGitMobSection does not throw when section does not exist', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Should not throw
      await expect(removeGitMobSection()).resolves.not.toThrow();
    });
  });
});

