import { updateConfig, getConfig as cmGetConfig } from '../config-manager.js';
import {
  getConfig,
  getAllConfig,
  setConfig,
  addConfig,
  removeConfigSection,
  type ConfigScope,
} from './exec-command.js';
import { createTempGitRepo, cleanupTempDir } from '../test-helpers/git-test-helpers.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('exec-command with ConfigScope support', () => {
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
    process.chdir(originalCwd);
    cleanupTempDir(tempDir);
    updateConfig('processCwd', undefined);
    updateConfig('gitConfigFile', undefined);
    delete process.env.GITMOB_CONFIG_FILE;
  });

  describe('getConfig and setConfig with scopes', () => {
    it('should use auto scope by default (no flag)', async () => {
      await setConfig('test.key', 'auto-value', 'auto');
      const result = await getConfig('test.key', 'auto');
      expect(result).toBe('auto-value');
    });

    it('should use local scope when specified', async () => {
      await setConfig('test.local', 'local-value', 'local');
      const result = await getConfig('test.local', 'local');
      expect(result).toBe('local-value');
      
      // Verify it's in .git/config
      const gitConfig = fs.readFileSync(path.join(tempDir, '.git/config'), 'utf8');
      expect(gitConfig).toContain('local-value');
    });

    it('should use mob scope with custom file when GITMOB_CONFIG_FILE is set', async () => {
      process.env.GITMOB_CONFIG_FILE = customConfigFile;
      
      await setConfig('git-mob.test', 'custom-value', 'mob');
      const result = await getConfig('git-mob.test', 'mob');
      
      expect(result).toBe('custom-value');
      expect(fs.existsSync(customConfigFile)).toBe(true);
      
      const fileContents = fs.readFileSync(customConfigFile, 'utf8');
      expect(fileContents).toContain('custom-value');
    });

    it('should use mob scope with custom file when set via updateConfig', async () => {
      updateConfig('gitConfigFile', customConfigFile);
      
      await setConfig('git-mob.test', 'programmatic-value', 'mob');
      const result = await getConfig('git-mob.test', 'mob');
      
      expect(result).toBe('programmatic-value');
      expect(fs.existsSync(customConfigFile)).toBe(true);
    });

    it('should prefer programmatic config over env var', async () => {
      const envFile = path.join(tempDir, 'env-config');
      const progFile = path.join(tempDir, 'prog-config');
      
      process.env.GITMOB_CONFIG_FILE = envFile;
      updateConfig('gitConfigFile', progFile);
      
      await setConfig('git-mob.test', 'prog-value', 'mob');
      
      // Should be in programmatic file
      expect(fs.existsSync(progFile)).toBe(true);
      expect(fs.existsSync(envFile)).toBe(false);
      
      const progContents = fs.readFileSync(progFile, 'utf8');
      expect(progContents).toContain('prog-value');
    });

    it('should fall back to --global for mob scope when no custom file is set', async () => {
      await setConfig('git-mob.global-test', 'global-value', 'mob');
      
      // Should be retrievable from global
      const result = execSync('git config --global git-mob.global-test', {
        encoding: 'utf8',
      }).trim();
      expect(result).toBe('global-value');
      
      // Clean up global config
      execSync('git config --global --unset git-mob.global-test');
    });
  });

  describe('legacy key format (backward compatibility)', () => {
    it('should parse "--global some.key" format', async () => {
      await setConfig('--global legacy.test', 'legacy-value');
      
      // Should be in global config
      const result = execSync('git config --global legacy.test', {
        encoding: 'utf8',
      }).trim();
      expect(result).toBe('legacy-value');
      
      // Clean up
      execSync('git config --global --unset legacy.test');
    });

    it('should parse "--local some.key" format', async () => {
      await setConfig('--local legacy.local', 'local-legacy');
      const result = await getConfig('--local legacy.local');
      expect(result).toBe('local-legacy');
    });

    it('should prefer legacy scope over parameter scope', async () => {
      // Even though we pass 'local' scope, the "--global" in the key should win
      await setConfig('--global legacy.scope-test', 'global-wins', 'local');
      
      const result = execSync('git config --global legacy.scope-test', {
        encoding: 'utf8',
      }).trim();
      expect(result).toBe('global-wins');
      
      // Should NOT be in local config
      const localResult = await getConfig('legacy.scope-test', 'local');
      expect(localResult).toBeUndefined();
      
      // Clean up
      execSync('git config --global --unset legacy.scope-test');
    });
  });

  describe('getAllConfig', () => {
    it('should retrieve all values for a multi-value config', async () => {
      await addConfig('multi.value', 'first', 'local');
      await addConfig('multi.value', 'second', 'local');
      await addConfig('multi.value', 'third', 'local');
      
      const result = await getAllConfig('multi.value', 'local');
      expect(result).toContain('first');
      expect(result).toContain('second');
      expect(result).toContain('third');
    });

    it('should work with mob scope and custom file', async () => {
      updateConfig('gitConfigFile', customConfigFile);
      
      await addConfig('git-mob.co-author', 'Alice <alice@example.com>', 'mob');
      await addConfig('git-mob.co-author', 'Bob <bob@example.com>', 'mob');
      
      const result = await getAllConfig('git-mob.co-author', 'mob');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });
  });

  describe('addConfig', () => {
    it('should add multiple values to the same key', async () => {
      await addConfig('test.multi', 'value1', 'local');
      await addConfig('test.multi', 'value2', 'local');
      
      const result = await getAllConfig('test.multi', 'local');
      expect(result).toContain('value1');
      expect(result).toContain('value2');
    });

    it('should use mob scope by default', async () => {
      updateConfig('gitConfigFile', customConfigFile);
      
      await addConfig('git-mob.test', 'test-value');
      
      expect(fs.existsSync(customConfigFile)).toBe(true);
      const contents = fs.readFileSync(customConfigFile, 'utf8');
      expect(contents).toContain('test-value');
    });
  });

  describe('removeConfigSection', () => {
    it('should remove an entire config section', async () => {
      await setConfig('test-section.key1', 'value1', 'local');
      await setConfig('test-section.key2', 'value2', 'local');
      
      await removeConfigSection('test-section', 'local');
      
      const result1 = await getConfig('test-section.key1', 'local');
      const result2 = await getConfig('test-section.key2', 'local');
      
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
    });

    it('should not throw when section does not exist', async () => {
      // Should not throw
      await expect(
        removeConfigSection('non-existent-section', 'local')
      ).resolves.not.toThrow();
    });

    it('should use mob scope by default', async () => {
      updateConfig('gitConfigFile', customConfigFile);
      
      await setConfig('git-mob.test', 'value', 'mob');
      expect(fs.existsSync(customConfigFile)).toBe(true);
      
      await removeConfigSection('git-mob');
      
      const result = await getConfig('git-mob.test', 'mob');
      expect(result).toBeUndefined();
    });
  });

  describe('config file path with spaces', () => {
    it('should handle file paths with spaces', async () => {
      const dirWithSpaces = path.join(tempDir, 'path with spaces');
      fs.mkdirSync(dirWithSpaces, { recursive: true });
      const configWithSpaces = path.join(dirWithSpaces, 'config file.txt');
      
      updateConfig('gitConfigFile', configWithSpaces);
      
      await setConfig('test.spaces', 'works', 'mob');
      const result = await getConfig('test.spaces', 'mob');
      
      expect(result).toBe('works');
      expect(fs.existsSync(configWithSpaces)).toBe(true);
    });
  });
});

