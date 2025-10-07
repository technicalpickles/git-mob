import { updateConfig } from '../config-manager.js';
import {
  getLocalCommitTemplate,
  getGlobalCommitTemplate,
  getGitUserName,
  getGitUserEmail,
  setGitUserName,
  setGitUserEmail,
} from './git-config.js';
import { setConfig } from './exec-command.js';
import { createTempGitRepo, cleanupTempDir } from '../test-helpers/git-test-helpers.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('git-config scope behavior', () => {
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
      execSync('git config --global --unset commit.template', { stdio: 'ignore' });
    } catch {
      // May not exist
    }
    try {
      execSync('git config --global --unset user.name', { stdio: 'ignore' });
    } catch {
      // May not exist
    }
    try {
      execSync('git config --global --unset user.email', { stdio: 'ignore' });
    } catch {
      // May not exist
    }

    process.chdir(originalCwd);
    cleanupTempDir(tempDir);
    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  describe('getLocalCommitTemplate', () => {
    it('reads from local scope only (.git/config)', async () => {
      // Set in local config
      await setConfig('commit.template', '.git/.gitmessage', 'local');

      const template = await getLocalCommitTemplate();
      expect(template).toBe('.git/.gitmessage');

      // Verify it's in .git/config
      const gitConfig = fs.readFileSync(
        path.join(tempDir, '.git/config'),
        'utf8'
      );
      expect(gitConfig).toContain('.gitmessage');
    });

    it('does not read from global config', async () => {
      // Set in global config (redirected to temp file)
      execSync('git config --global commit.template ~/.global-template');

      // Should not be seen (using local scope)
      const template = await getLocalCommitTemplate();
      expect(template).toBeUndefined();
    });

    it('does not read from custom file', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Set in custom file
      await setConfig('commit.template', '~/.custom-template', 'mob');

      // Should not be seen by getLocalCommitTemplate
      const template = await getLocalCommitTemplate();
      expect(template).toBeUndefined();
    });
  });

  describe('getGlobalCommitTemplate', () => {
    it('reads from mob scope (custom file when set)', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      await setConfig('commit.template', '~/.mob-template', 'mob');

      const template = await getGlobalCommitTemplate();
      expect(template).toBe('~/.mob-template');

      // Verify it's in custom file
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('.mob-template');
    });

    it('falls back to global config when custom file not set', async () => {
      // Set in global config (redirected to temp file)
      execSync('git config --global commit.template ~/.global-template');

      const template = await getGlobalCommitTemplate();
      expect(template).toContain('.global-template');
    });

    it('falls back to resolveGitMessagePath when not set', async () => {
      // Clear any existing global commit.template
      try {
        execSync('git config --global --unset commit.template', { stdio: 'ignore' });
      } catch {
        // May not exist
      }

      const template = await getGlobalCommitTemplate();

      // Should return default path (home dir + .gitmessage)
      expect(template).toBeDefined();
      expect(template).toContain('.gitmessage');
    });
  });

  describe('getGitUserName and getGitUserEmail', () => {
    it('uses auto scope and respects git precedence (local > global)', async () => {
      // Clear local config first
      try {
        execSync('git config --local --unset user.name');
        execSync('git config --local --unset user.email');
      } catch {
        // May not exist
      }

      // Set in global
      execSync('git config --global user.name "Global User"');
      execSync('git config --global user.email "global@example.com"');

      expect(await getGitUserName()).toBe('Global User');
      expect(await getGitUserEmail()).toBe('global@example.com');

      // Set in local (should override global)
      execSync('git config --local user.name "Local User"');
      execSync('git config --local user.email "local@example.com"');

      expect(await getGitUserName()).toBe('Local User');
      expect(await getGitUserEmail()).toBe('local@example.com');
    });

    it('does not read from custom file (uses auto scope)', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;

      // Set in custom file
      await setConfig('user.name', 'Custom User', 'mob');
      await setConfig('user.email', 'custom@example.com', 'mob');

      // Verify custom file has the values
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('Custom User');

      // Now check what getGitUserName/Email returns
      // It should use auto scope and read from local (set in beforeEach)
      expect(await getGitUserName()).toBe('Test User');
      expect(await getGitUserEmail()).toBe('test@example.com');
    });

    it('reads from git config set during repo init', async () => {
      // These were set in beforeEach
      expect(await getGitUserName()).toBe('Test User');
      expect(await getGitUserEmail()).toBe('test@example.com');
    });
  });

  describe('setGitUserName and setGitUserEmail', () => {
    it('uses auto scope - writes to local in a git repo', async () => {
      await setGitUserName('Local User');
      await setGitUserEmail('local@example.com');

      // Should be in local config (we're in a git repo, auto scope uses local)
      const localName = execSync('git config --local user.name', {
        encoding: 'utf8',
      }).trim();
      const localEmail = execSync('git config --local user.email', {
        encoding: 'utf8',
      }).trim();

      expect(localName).toBe('Local User');
      expect(localEmail).toBe('local@example.com');
    });

    it('override updates local config allowing git precedence', async () => {
      // Set initial user in local
      execSync('git config --local user.name "Initial User"');
      execSync('git config --local user.email "initial@example.com"');

      // Override should update local config
      await setGitUserName('Override User');
      await setGitUserEmail('override@example.com');

      // Local config should be updated
      const localName = execSync('git config --local user.name', {
        encoding: 'utf8',
      }).trim();
      const localEmail = execSync('git config --local user.email', {
        encoding: 'utf8',
      }).trim();

      expect(localName).toBe('Override User');
      expect(localEmail).toBe('override@example.com');
    });
  });

});

