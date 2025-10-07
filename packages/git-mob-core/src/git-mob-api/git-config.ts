import { getConfig, setConfig } from './exec-command.js';
import { resolveGitMessagePath } from './resolve-git-message-path.js';

export async function getLocalCommitTemplate() {
  return getConfig('commit.template', 'local');
}

export async function getGlobalCommitTemplate() {
  return (await getConfig('commit.template', 'mob')) || resolveGitMessagePath();
}

export async function getGitUserName() {
  return getConfig('user.name', 'auto');
}

export async function getGitUserEmail() {
  return getConfig('user.email', 'auto');
}

export async function setGitUserName(name: string) {
  return setConfig('user.name', name, 'auto');
}

export async function setGitUserEmail(email: string) {
  return setConfig('user.email', email, 'auto');
}
