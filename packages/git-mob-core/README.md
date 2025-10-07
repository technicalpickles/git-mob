# Git Mob core

> Beta

The core API for managing Git Mob co-authors.

Shared between Git Mob CLI and Git Mob VS code.

```
npm i git-mob-core
```

## API

### Environment variables

- `process.env.GITMOB_MESSAGE_PATH` set the primary path to Git message template
- `process.env.GITMOB_COAUTHORS_PATH` set the primary path to coauthors file
- `process.env.GITMOB_CONFIG_FILE` set the path to a custom git config file for storing git-mob configuration

#### Custom Config File

By default, git-mob stores its configuration (co-authors, settings, commit template) in your global git config (`~/.gitconfig`). You can use a custom config file instead by setting the `GITMOB_CONFIG_FILE` environment variable:

```bash
export GITMOB_CONFIG_FILE=~/.config/git-mob/config
```

This keeps all git-mob configuration separate from your global git config. When set, the following operations use the custom file:

- Storing selected co-authors (`git-mob.co-author`)
- Git-mob settings (`git-mob-config.*`)
- Commit template path (`commit.template`)
- Primary author overrides via `setPrimaryAuthor()` (`user.name`, `user.email`)

**Programmatic Configuration:**

You can also set the custom config file programmatically using the config manager:

```typescript
import { updateConfig } from 'git-mob-core';

updateConfig('gitConfigFile', '/path/to/custom-config');
```

Programmatic configuration takes precedence over the environment variable.

**Benefits:**

- **Separation of concerns**: Keep git-mob config separate from your personal git config
- **Per-project configurations**: Use different configs for different projects
- **Testing**: Test without affecting your global config
- **Clean global config**: Keep `~/.gitconfig` minimal

The custom file uses standard git config format and is automatically created by git when first used.

```TS
// Write actions
saveNewCoAuthors(authors: Author[]): <Promise<Author[]>>
createCoAuthorsFile(authors: Author[]): <Promise<boolean>>
updateGitTemplate(selectedAuthors?: Author[]): void
solo(): <Promise<void>>
setCoAuthors(keys: string[]): <Promise<Author[]>>
messageFormatter(txt: string, authors: Author[]): string
setPrimaryAuthor(author: Author): void

// Read actions
getAllAuthors(): <Promise<Author[]>>
getPrimaryAuthor(): <Promise<Author | undefined>>
getSelectedCoAuthors(allAuthors): <Promise<Author[]>>
repoAuthorList(authorFilter?: string): Promise<Author[] | undefined>
pathToCoAuthors(): <Promise<string>>

// GitHub
fetchGitHubAuthors(userNames: string[], userAgent: string): <Promise<Author[]>>
searchGitHubAuthors(query: string, userAgent: string): <Promise<Author[]>>

gitRevParse = {
  insideWorkTree(): <Promise<string>>,
  topLevelDirectory(): <Promise<boolean>>,
};
```

### Config

```TS
// Config manager for library
// supported props:
//   "processCwd" = set the directory to exec commands
//   "gitConfigFile" = set path to custom git config file
getConfig(prop: string): string | undefined
updateConfig(prop: string, value: string): void

// Read GitMob properties from Git config file
gitMobConfig = {
  localTemplate(): <Promise<boolean>>,
  fetchFromGitHub(): <Promise<boolean>>,
};

// Read Git properties from Git config
gitConfig = {
  getLocalCommitTemplate(): <Promise<string>>,
  getGlobalCommitTemplate(): <Promise<string>>,
};
```

### Author class

Do not change the structure of the class.

```TS
class Author;

// Properties
Author.key: string
Author.name: string
Author.email: string
Author.trailer: AuthorTrailers // defaults to AuthorTrailers.CoAuthorBy

//Methods
Author.format(): string
Author.toString(): string
```
