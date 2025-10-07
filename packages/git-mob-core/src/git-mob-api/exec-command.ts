import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getConfig as cmGetConfig } from '../config-manager.js';

type ExecCommandOptions = {
  encoding: string;
  cwd?: string;
};

export type ConfigScope = 'auto' | 'local' | 'global' | 'mob';

interface ParsedKey {
  key: string;
  scope?: ConfigScope;
}

/**
 * Parse legacy format where scope flags were embedded in the key string.
 * Example: "--global some.key" -> { key: "some.key", scope: "global" }
 */
function parseLegacyKey(key: string): ParsedKey {
  const globalMatch = key.match(/^--global\s+(.+)$/);
  if (globalMatch) {
    return { key: globalMatch[1], scope: 'global' };
  }

  const localMatch = key.match(/^--local\s+(.+)$/);
  if (localMatch) {
    return { key: localMatch[1], scope: 'local' };
  }

  return { key };
}

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
  const { key: parsedKey, scope: legacyScope } = parseLegacyKey(key);
  const effectiveScope = legacyScope || scope;
  const scopeFlag = resolveScopeFlag(effectiveScope);

  try {
    return await execCommand(`git config ${scopeFlag} --get ${parsedKey}`);
  } catch {
    return undefined;
  }
}

export async function getAllConfig(key: string, scope: ConfigScope = 'auto') {
  const { key: parsedKey, scope: legacyScope } = parseLegacyKey(key);
  const effectiveScope = legacyScope || scope;
  const scopeFlag = resolveScopeFlag(effectiveScope);

  try {
    return await execCommand(`git config ${scopeFlag} --get-all ${parsedKey}`);
  } catch {
    return undefined;
  }
}

export async function setConfig(
  key: string,
  value: string,
  scope: ConfigScope = 'mob'
) {
  const { key: parsedKey, scope: legacyScope } = parseLegacyKey(key);
  const effectiveScope = legacyScope || scope;
  const scopeFlag = resolveScopeFlag(effectiveScope);

  try {
    await execCommand(`git config ${scopeFlag} ${parsedKey} "${value}"`);
  } catch {
    const message = `Option ${parsedKey} has multiple values. Cannot overwrite multiple values for option ${parsedKey} with a single value.`;
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
