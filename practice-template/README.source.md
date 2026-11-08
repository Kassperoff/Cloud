<!-- The source of the practice copy's README. Assembly writes it to the copy as README.md and replaces each "quest-release:" link prefix with this repository's address at the release tag. Edit this file, not the generated README. -->

# Claude Code practice

Your practice copy for [Claude Code Quest](https://github.com/wesammustafa/Claude-Code-Quest). The lessons live in the guide; this copy holds the app that walks you through them, the project you practise on, and a check for every core lesson and capstone.

An independent educational project. Not affiliated with or endorsed by Anthropic.

## Start

You need Node.js 22 or later and git. There is nothing to install with npm.

1. In one terminal, at the root of your copy, start Claude Code Quest:

   ```bash
   npm run learn
   ```

   It prints its address and opens your browser there. If the browser does not open, open the printed address yourself. In a Codespace, it prints the forwarded address instead: keep that port private, since the app is for you alone.
2. In a second terminal, go into `project/`. You start Claude Code there, not at the root of your copy, and lesson 1 installs it if you don't have it yet:

   ```bash
   cd project
   ```

Claude Code Quest runs each check with the PATH of the terminal that started it. If you install Claude Code or another tool, or change your PATH, while it runs, close that terminal and run `npm run learn` again from a new terminal window at the root of your copy.

## What each folder is

- `project/`: the small project you practise on, a Markdown link checker with its tests. This is where you work, and where Claude Code runs.
- `learn/`: Claude Code Quest, built for this release. It is generated: never edit it.
- `checks/`: the check for each core lesson and capstone.
- `capstone/`: the briefs and bug reports the capstones start from.
- `.practice/`: Claude Code Quest's saved progress.

Everything outside `project/` is course machinery.

## Check your work

Claude Code Quest runs each check for you. To run one yourself, from `project/`:

```bash
npm run check -- b-1
```

Each item prints `PASS` or `FAIL`, with a hint for what to fix.

## Track your progress

Every push runs the **Progress** workflow, which lists each check's result in the run's summary. It never fails: an exercise you have not finished shows as "not yet". For a checklist to tick off, open an issue from the **Track my progress** template.

## Reference solutions

Each core lesson and capstone has a reference solution at the release this copy came from. Read it after an honest attempt:

- Beginner: [b-1](quest-release:solutions/b-1/), [b-2](quest-release:solutions/b-2/), [b-3](quest-release:solutions/b-3/), [b-4](quest-release:solutions/b-4/), [b-5](quest-release:solutions/b-5/), [capstone](quest-release:solutions/b-capstone/)
- Intermediate: [i-1](quest-release:solutions/i-1/), [i-2](quest-release:solutions/i-2/), [i-3](quest-release:solutions/i-3/), [i-4](quest-release:solutions/i-4/), [i-5](quest-release:solutions/i-5/), [i-6](quest-release:solutions/i-6/), [i-7](quest-release:solutions/i-7/), [i-8](quest-release:solutions/i-8/), [capstone](quest-release:solutions/i-capstone/)
- Advanced: [a-1](quest-release:solutions/a-1/), [a-2](quest-release:solutions/a-2/), [a-3](quest-release:solutions/a-3/), [a-4](quest-release:solutions/a-4/), [a-5](quest-release:solutions/a-5/), [a-6](quest-release:solutions/a-6/), [a-7](quest-release:solutions/a-7/), [capstone](quest-release:solutions/a-capstone/)

## Already have an older copy?

Follow [Already have a practice copy?](https://github.com/wesammustafa/Claude-Code-Quest#already-have-a-practice-copy) in the guide's README to bring it up to this release.

## License

`project/`, `checks/` and `capstone/` are under the MIT License: see [project/LICENSE](project/LICENSE). The app in `learn/` is under the [guide repository's license](quest-release:LICENSE) at this release, and `learn/THIRD-PARTY-NOTICES.txt` holds the license notice of every package it bundles.
