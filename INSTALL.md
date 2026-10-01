# Install Origin

This guide is for a nontechnical professional. Earlier onboarding teaches you to create your own
GitHub account. You do not need Git, GitHub CLI or Codex already installed to begin reading this
page. Read it in your browser **before cloning**; there is no CLI agent helping you yet.

The order is: GitHub account → local Git tools → personal copy and clone → Origin installer →
onboarding and startup → agent-assisted work. The installer installs Codex if it is missing. Only
after the dashboard and its interactive agent are working can that agent carry the technical load.

## Before you can clone

Git is the program that copies the project to your computer. Your GitHub account is the online
account; creating it does not install Git. The Origin installer cannot install the Git needed to
obtain its own clone, so complete this step first.

**Ubuntu Linux:** open **Terminal** from the applications menu. Copy each line below, paste it into
the terminal and press Enter. The first two lines install Git. If asked for a password, use your
computer's password; the terminal does not display it as you type. Review the package-install
confirmation before continuing.

```bash
sudo apt update
sudo apt install git
git --version
```

The last line should print a Git version number. If it says **command not found**, complete the
installation before cloning. Other Linux distributions use
[Git's installation instructions](https://git-scm.com/install/linux.html), not Ubuntu's commands.

Next, install GitHub CLI so you can sign in and clone a private project. Open the
[publisher's Linux installation page](https://github.com/cli/cli/blob/trunk/docs/install_linux.md).
For Ubuntu, find **Recommended (Official) → Debian → To install**, copy that complete command block
into Terminal and follow its confirmations. Then run `gh --version`; it should print a version
number. Use that official package route: the publisher warns that older Ubuntu community packages
can fail against changed GitHub APIs. Other distributions use their section on the same page.

**macOS:** open **Terminal** from Applications → Utilities. Follow
[Git's macOS installation instructions](https://git-scm.com/install/mac). Origin's installer also
uses [Homebrew](https://brew.sh); complete its installation instructions first. Then install GitHub
CLI with `brew install gh`. Verify `git --version` and `gh --version` print version numbers.

**Windows:** Origin runs inside Ubuntu through WSL2, not a native PowerShell terminal. Before
cloning, follow
[Microsoft's WSL installation instructions](https://learn.microsoft.com/en-us/windows/wsl/install):
open PowerShell as administrator, run `wsl --install`, restart if requested, then open **Ubuntu**
from Start and complete its first-run username/password setup. Use the Ubuntu commands above inside
that Ubuntu window. Keep the project in Ubuntu's Linux folders. The repository's Windows helper is
an alternative only if you already obtained the files; it cannot bootstrap a clone you do not have.

**Sign the tools into your own GitHub account:** this lets you copy a private personal project
without creating or handling a private access token. Check first:

```bash
gh auth status
```

If it reports your correct account is signed in, reuse it. Otherwise run:

```bash
gh auth login --hostname github.com --git-protocol https --web
```

Follow the terminal and browser instructions, including the one-time code displayed by this flow.
Approve Git authentication if prompted. Do not type your GitHub password into a Git clone prompt.
Run `gh auth status` again and check it reports your own account before cloning. If sign-in fails or
its browser code expires, rerun the login command; do not continue as if it succeeded. The installer
will reuse this login; website sign-in and command-line sign-in are separate.

You still do not need Codex installed. The installer handles that after cloning. On a fresh machine
it also supplies GitHub CLI if missing, tmux and Node/npm through supported package managers, but
private cloning requires the GitHub sign-in tool earlier as described above. The required complete
kit is Git, GitHub CLI, Node.js 22.22.2+, 24.15.0+, or 26+, npm, tmux, Codex CLI, and valid GitHub
and Codex sign-ins. Unsupported Node versions require the installer's stated recovery before
continuing.

## Why GitHub sign-in is required

Origin saves proposed changes in your own GitHub repository as pull requests: changes you can review
before accepting them. This release requires GitHub sign-in and permission to change that repository
for this workflow. Downloading the public source alone does not require sign-in; using its complete
review workflow does. Use your account, never the Origin author's account.

The installer checks whether GitHub CLI is already signed in and reuses a valid login. If not, it
starts `gh auth login`; follow the terminal prompts and GitHub's browser instructions. Do not share
your password or private authentication credentials. Having a GitHub account and signing GitHub CLI
into that account are separate steps.

GitHub may separately ask you to confirm your identity when changing repository protections in its
website. That is a settings confirmation, not another installer login. Explain the exact settings
action before requesting it; if GitHub Mobile asks for numbers, use the fresh numbers displayed by
that browser prompt. Rejected or expired requests are not completed setup.

## Create a repository you control

The recommended route for an independent harness is **Use this template → Create a new repository**
on [Origin](https://github.com/hadi-nayebi/origin). Choose your account or organization, public or
private visibility, and leave **Include all branches** off. A repository is your project folder on
GitHub: **Private** restricts access; **Public** lets anyone read its files. Wait for your new
repository page to appear.

Open a terminal in the folder where you keep projects. On Ubuntu you can open that folder in Files,
right-click its background and choose **Open in Terminal**. On GitHub, select **Code → HTTPS** in
your new repository and copy its address. Type `git clone ` (including the space), paste the copied
address and press Enter. The examples below use `YOUR-ACCOUNT` and `YOUR-PROJECT` as placeholders:
replace them with your own account and repository name, or use the address you copied. Do not copy
the placeholders unchanged. Clone the repository you created:

```bash
git clone https://github.com/YOUR-ACCOUNT/YOUR-PROJECT.git
cd YOUR-PROJECT
git remote get-url origin
```

`git clone` creates a local folder with your repository name. `cd` enters that folder; replace
`YOUR-PROJECT` with its actual name. The last command must report your repository. Template
generation starts a separate project with its own history; repository settings are not copied. Fork
instead if you intend to keep an upstream connection for contribution or synchronization. You can
directly clone Origin to inspect or edit it locally, but an unchanged clone points to a source
remote other users cannot push to, so it cannot complete the current PR-backed feedback lifecycle.

If the template control is unavailable or you prefer a manual copy, create a new empty repository
under your account or organization without a README, license, or `.gitignore`. Then clone the
source, replace the remote, and push `main`:

```bash
git clone https://github.com/hadi-nayebi/origin.git YOUR-PROJECT
cd YOUR-PROJECT
git remote set-url origin https://github.com/YOUR-ACCOUNT/YOUR-PROJECT.git
git push -u origin main
git remote get-url origin
```

A user who wants a fully local workflow without a writable GitHub repository needs a separate
local-only work-unit implementation. This release does not provide one; the full launcher checks
GitHub access rather than silently degrading the feedback lifecycle.

The repository may use any name. The local Git remote must remain named `origin`, and the
authenticated GitHub account must have write and merge permission there. `npm run doctor` checks
this before reporting the GitHub work-unit path healthy.

## macOS, Linux, and WSL2

```bash
./scripts/install.sh
```

The installer asks before installing system software. On supported package managers it installs
missing Git, GitHub CLI, tmux, Node/npm, and the official `@openai/codex` package, then installs
repository dependencies and runs the complete test/build/doctor contract. Before installing the
repository dependencies, it checks GitHub and Codex sign-in and offers their official login flows
only when needed; it never embeds credentials.

After the checks pass, the installer offers optional Telegram setup in the same terminal. Choose
**no** or press Enter to continue without Telegram. Choose **yes** only when you have a dedicated
bot created through **@BotFather** in Telegram. The token is entered without being shown, and setup
displays a one-time command to send to that bot in a private chat. Success is confirmed only after
that pairing finishes. Cancelled or failed pairing does not report installation complete; you can
retry with `npm run telegram -- setup`. Noninteractive runs skip this choice and print that command.
An existing configuration is preserved rather than overwritten. Text works without optional speech
downloads or voice enrollment.

If the installer reports an unsupported Node version, install a supported current Node.js LTS from
[nodejs.org](https://nodejs.org/) and rerun the script. Having Node installed does not by itself
mean its version meets this release's requirements.

## Windows

The full Origin harness does not run in native PowerShell because tmux is part of the Origin 1.0
transport contract. Install WSL2:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallWsl
```

After any required restart, open the WSL terminal, clone the repository you created through the
template or manual route inside the Linux filesystem, and run `./scripts/install.sh` there.

## Start the dashboard and reach your agent

Finish any sign-in and optional channel prompts in the installer first. A successful installation
prints **Origin setup is complete**. The installer checks for Codex and installs it when missing;
when it is already present, it reuses it. You personally complete the official Codex sign-in if
needed. Do not assume that an installed executable is already signed in.

In the same project terminal, run:

```bash
npm run doctor
npm run origin
```

The doctor treats every missing runtime component as blocking. The launcher never falls back to a
headless worker or a dashboard-only mode.

`npm run origin` starts or reuses the dashboard, opens the default browser, attaches the
repository-scoped terminal session, and runs `codex resume --last`. Codex starts fresh when that
repository has no saved interactive chat. Use `npm run origin:new` only when you intentionally want
a separate chat.

On first launch, use `/hooks` in Codex to inspect and trust the two channel Stop hooks and the
owner-authority PreToolUse hook. The latter permits branch work and PR creation but blocks supported
agent merge paths; only the dashboard or paired Telegram owner action may merge and resolve a work
unit. This is an intentional security boundary.

Once the browser dashboard and its interactive Codex terminal are both usable, the assistance
handoff is complete. Describe what you need in ordinary language. The agent can now explain and help
with the technical repository details below. Before asking it to implement your first page, complete
the repository protections; installation or startup alone does not prove they exist.

## Protect the repository's main branch

Copying or generating the repository transfers tracked files, not the source repository's settings.
In the new repository, create an active branch ruleset targeting the default branch. Leave the
bypass list empty, require changes through a pull request, require the three
`Node 22 / ubuntu-latest`, `Node 22 / macos-latest`, and `Node 22 / windows-latest` checks, require
the branch to be up to date, restrict deletion, and block force pushes. Keep required approvals at
zero for a single-owner repository unless a separate reviewer identity is available.

This remote rule complements the trusted local hook. The rule blocks direct or unverified changes to
`main`; the hook prevents supported Codex tool calls from exercising the owner's merge path.

The browser's four-step guide introduces the empty canvas, Feedback, Admin, and optional Telegram.
Finish or skip it after inspection; **Show the quick guide** on the canvas reopens it later.

## Recovery

- `npm run origin` reuses the healthy dashboard and repository-scoped tmux session and resumes the
  repository's newest saved Codex chat by default.
- `npm run origin:new` explicitly starts a separate Codex chat.
- `npm run wake` retries durable pending dashboard wake events.
- `.origin/dashboard.log` contains dashboard startup diagnostics.
- `.origin/wake-outbox.json` records wake attempts and outcomes.
- `.origin/feedback.jsonl` is the authoritative feedback journal.
- `.origin/contextual-feedback/data.json` is the dashboard channel's continuation state.
- `.origin/telegram-engagement/data.json` is the optional Telegram channel's continuation state.
- `.origin/agent-stop-state/data.json`, when present, is legacy input imported once into dashboard
  state; it is not the current global source of truth.
- `.origin/worktrees/` contains the private per-thread worktrees. GitHub PRs remain the reviewed
  publication boundary.

If feedback or agent state fails validation, pending wakes remain retryable rather than being
cancelled. Recover the authoritative file first, then run `npm run wake`.

Do not delete `.origin/` to repair a transport failure. The journal and state are user-owned local
history; inspect and back them up first.
