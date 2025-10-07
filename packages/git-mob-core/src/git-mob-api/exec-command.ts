import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig as cmGetConfig } from '../config-manager.js';

type ExecCommandOptions = {
  encoding: string;
  cwd?: string;
};

export type ConfigScope = 'auto' | 'local' | 'global' | 'mob';

/**
 * Resolve a semantic scope value to a git config flag.
 * - 'auto': No flag (git decides based on context)
 * - 'local': --local flag (.git/config)
 * - 'global': --global flag (~/.gitconfig)
 * - 'mob': Custom file if set via GITMOB_CONFIG_FILE env var or updateConfig, otherwise --global
 */
function resolveScopeFlag(scope: ConfigScope): string {
  switch (scope) {
    case 'auto':
      return '';
    case 'local':
      return '--local';
    case 'global':
      return '--global';
    case 'mob': {
      const customFile = cmGetConfig('gitConfigFile');
      return customFile ? `--file "${customFile}"` : '--global';
    }
  }
}

// Runs the given command in a shell.
export async function execCommand(command: string): Promise<string> {
  const cmdConfig: ExecCommandOptions = { encoding: 'utf8' };
  const processCwd = cmGetConfig('processCwd');
  if (processCwd) cmdConfig.cwd = processCwd;
  const execAsync = promisify(exec);
  const { stderr, stdout } = await execAsync(command, cmdConfig);

  if (stderr) {
    throw new Error(`Git mob core execCommand: "${command}" ${stderr.trim()}`);
  }

  return stdout.trim();
}

export async function getConfig(key: string, scope: ConfigScope = 'auto') {
  const scopeFlag = resolveScopeFlag(scope);

  try {
    return await execCommand(`git config ${scopeFlag} --get ${key}`);
  } catch {
    return undefined;
  }
}

export async function getAllConfig(key: string, scope: ConfigScope = 'auto') {
  const scopeFlag = resolveScopeFlag(scope);

  try {
    return await execCommand(`git config ${scopeFlag} --get-all ${key}`);
  } catch {
    return undefined;
  }
}

export async function setConfig(
  key: string,
  value: string,
  scope: ConfigScope = 'mob'
) {
  const scopeFlag = resolveScopeFlag(scope);

  try {
    await execCommand(`git config ${scopeFlag} ${key} "${value}"`);
  } catch {
    const message = `Option ${key} has multiple values. Cannot overwrite multiple values for option ${key} with a single value.`;
    throw new Error(`Git mob core setConfig: ${message}`);
  }
}

export async function addConfig(
  key: string,
  value: string,
  scope: ConfigScope = 'mob'
) {
  const scopeFlag = resolveScopeFlag(scope);
  await execCommand(`git config --add ${scopeFlag} ${key} "${value}"`);
}

export async function removeConfigSection(
  section: string,
  scope: ConfigScope = 'mob'
) {
  try {
    const scopeFlag = resolveScopeFlag(scope);
    await execCommand(`git config ${scopeFlag} --remove-section ${section}`);
  } catch {
    // Section doesn't exist, that's fine
  }
}

export async function getRepoAuthors(authorFilter?: string) {
  let repoAuthorQuery = 'git shortlog -seni HEAD';
  if (authorFilter) {
    repoAuthorQuery += ` --author="${authorFilter}"`;
  }

  return execCommand(repoAuthorQuery);
}
