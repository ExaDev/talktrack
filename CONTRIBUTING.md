# Contributing

Bug reports and pull requests are welcome.

## Setup

You need Node 22, pnpm, and `ffmpeg` plus `ffprobe` with the `libvpx-vp9` encoder on `PATH`.

```sh
pnpm install
pnpm exec playwright install chromium
```

## Before you push

`pnpm prepush` runs lint, typecheck (including `attw`), unit tests and the end-to-end suite, which is the same set CI runs. The pre-push hook runs it for you.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) and are checked by commitlint. The type decides the release: `feat` is a minor, `fix` and the other types are patches, and a breaking change is a major. Put the reason for the change in the message body; there is no changelog to edit, because releases generate it from the commits.

Open a draft pull request as soon as a branch has something coherent in it, and mark it ready once CI is green.

## Reporting a bug

Say what you ran, what you expected and what happened. A recording that came out wrong is easiest to debug with the Playwright version, your ffmpeg version (`ffmpeg -version`) and, if you can share it, the raw video from the run.
