import {
  getConfig,
  getAllConfig,
  addConfig,
  removeConfigSection,
} from './exec-command.js';

export async function localTemplate() {
  const localTemplate = await getConfig(
    'git-mob-config.use-local-template',
    'local'
  );
  return localTemplate === 'true';
}

export async function fetchFromGitHub() {
  const githubFetch = await getConfig('git-mob-config.github-fetch', 'mob');
  return githubFetch === 'true';
}

export async function getSetCoAuthors() {
  return getAllConfig('git-mob.co-author', 'mob');
}

export async function addCoAuthor(coAuthor: string) {
  return addConfig('git-mob.co-author', coAuthor, 'mob');
}

export async function removeGitMobSection() {
  return removeConfigSection('git-mob', 'mob');
}
