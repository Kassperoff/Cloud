// The lesson test (spec, The lesson test): every step file in course/steps/,
// read by the engine's parser, against this repo's pages. `npm run
// test:lessons` runs this file alone.
//
// The cases under fixtures/lessons/ each hold course/manifest.json, its step
// files and its pages, laid out as this repo lays them out; case.json gives
// the verdict (`expect`) and the problems it must report, in order, as
// regular expressions.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { lessons } from "../../../practice-template/checks/lessons/index.mjs";
import { PROBES, probeError } from "../src/probes.ts";
import { STAMP, checkLessons, pageTables } from "../src/lessons.ts";

/** Escape every RegExp special character, backslash included. */
const escapeRegExp = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

const root = fileURLToPath(new URL("../../../", import.meta.url));
const probes = { PROBES, probeError };

// A course laid out under `dir` as this repo lays it out: the manifest, the
// step files it lists and every page it lists, Lessons' and Level indexes'.
// A file that doesn't exist is left out, for the test to report.
function courseAt(dir, { crlf = false } = {}) {
  const read = (path) => readFileSync(`${dir}${path}`, "utf8");
  const manifest = JSON.parse(read("course/manifest.json"));
  const present = (paths, as = (text) => text) =>
    Object.fromEntries(
      paths
        .filter((path) => existsSync(`${dir}${path}`))
        .map((path) => [path, as(read(path))]),
    );
  return {
    manifest,
    stepFiles: present(
      manifest.lessons.map((lesson) => lesson.steps),
      crlf ? (text) => text.replace(/\r?\n/g, "\r\n") : undefined,
    ),
    pages: present([
      ...manifest.lessons.map((lesson) => lesson.page),
      ...manifest.levels.map((level) => level.index),
    ]),
  };
}

const repo = courseAt(root);
const check = (course) => checkLessons({ ...course, checks: lessons, probes });
const stepFile = (id) => `course/steps/${id}.md`;
const pageOf = (id) =>
  repo.manifest.lessons.find((lesson) => lesson.id === id).page;
const flat = (text) => text.replace(/\s+/g, " ").trim();
// The app lines of each step file that name a key or a control only the old
// Terminal app had; quoted values are the page's words and stay as they are.
const STRUCTURAL = new Set([
  "where",
  "terminals",
  "run",
  "code",
  "tier",
  "skill",
  "from",
  "verify",
  "tick",
  "watching",
  "optional",
]);
const KEY_WORDS =
  /\b(press(es|ed|ing)?|keystroke|key ?press|shortcut|scrollback|scroll up|backspace|space ?bar|this window|this pane|the pane)\b|\b(in|use) (a|the|this|your) terminal\b|\bthe terminal (running|you start)\b|\b(arrow|enter|return|tab|esc) keys?\b/i;
const KEY_NAMES = /\b(Ctrl|Cmd|Shift|Alt|Option)\+|\bEsc(ape)?\b/;
const appWords = (stepFiles) =>
  Object.entries(stepFiles).flatMap(([file, text]) => {
    const found = [];
    let fenced = false;
    let front = false;
    text.split(/\r?\n/).forEach((line, index) => {
      if (index === 0 && line === "---") return void (front = true);
      if (front) return void (front = line !== "---");
      if (line.startsWith("```")) return void (fenced = !fenced);
      if (fenced) return;
      const heading = line.match(/^###? (.+)$/);
      const entry = line.match(/^- (?:narrow "[^"]*"|([a-z-]+)): (.+)$/);
      const value = heading
        ? heading[1]
        : entry && !STRUCTURAL.has(entry[1]) && !/^".*"$/.test(entry[2])
          ? entry[2]
          : null;
      if (value && (KEY_WORDS.test(value) || KEY_NAMES.test(value)))
        found.push(`${file}:${index + 1}: ${value}`);
    });
    return found;
  });
// The problems a change to this repo's course adds, so that each change below
// is judged on its own even while the repo itself fails.
const added = (course) => {
  const before = new Set(check(repo).problems);
  return check(course).problems.filter((problem) => !before.has(problem));
};

describe("the lesson test on this repo", () => {
  test("every step file matches its page, and every Level index is in place", () => {
    const result = check(repo);
    expect(result.problems).toEqual([]);
    expect(Object.keys(repo.stepFiles)).toHaveLength(23);
    expect(repo.manifest.levels.map((level) => level.index)).toEqual([
      "docs/beginner/README.md",
      "docs/intermediate/README.md",
      "docs/advanced/README.md",
    ]);
    expect(result.lessons).toBe(23);
    expect(result.quotes).toBeGreaterThan(0);
    expect(result.blocks).toBeGreaterThan(0);
    expect(result.from).toBeGreaterThan(0);
  });

  test("changing one quoted word in a page fails it", () => {
    const page = pageOf("b-1");
    const text = repo.pages[page];
    // A quote of b-1's step file that the page holds once, word for word on
    // one line, so changing its last word there takes it off the page.
    const quote = [
      ...repo.stepFiles[stepFile("b-1")].matchAll(/^- [a-z-]+: "(.+)"$/gm),
    ]
      .map((match) => match[1])
      .find(
        (q) =>
          /\w{4,}\W*$/.test(q) &&
          text.split(q).length === 2 &&
          flat(text).split(flat(q)).length === 2,
      );
    expect(quote).toBeDefined();
    const changed = quote.replace(/\w+(?=\W*$)/, "Changedword");
    const problems = added({
      ...repo,
      pages: { ...repo.pages, [page]: text.replace(quote, changed) },
    });
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems)
      expect(problem).toMatch(
        new RegExp(
          `^course/steps/b-1\\.md:\\d+: quotes ".*" \\(.*\\), which is not in ${escapeRegExp(page)}\\.$`,
        ),
      );
    expect(problems.join("\n")).toContain(`quotes "${quote}"`);
  });

  test("a table's rows match a page table cell by cell, its header the page's header", () => {
    const file = stepFile("b-5");
    const page = pageOf("b-5");
    const header = '- table: "Where" | "What goes in it" | "Who gets it"';
    const row =
      '- table: "`~/.claude/CLAUDE.md`" | "Your habits for every project" | "Only you"';
    const lineOf = (line) => repo.stepFiles[file].split("\n").indexOf(line) + 1;
    const heading =
      "W2 | Worked example step 2 of 6 | Cut it to what Claude can't infer";
    expect(lineOf(header)).toBeGreaterThan(0);
    expect(lineOf(row)).toBeGreaterThan(0);
    expect(check(repo).rows).toBeGreaterThanOrEqual(5);
    const withRow = (from, to) => ({
      ...repo,
      stepFiles: {
        ...repo.stepFiles,
        [file]: repo.stepFiles[file].replace(from, to),
      },
    });
    // Whitespace inside a cell is flattened, as for a quote.
    expect(
      added(withRow(row, row.replace("Your habits", "Your  habits"))),
    ).toEqual([]);
    // Cells from two rows, each on the page, are no row of it.
    expect(
      added(withRow(row, row.replace('"Only you"', '"The team: commit it"'))),
    ).toEqual([
      `${file}:${lineOf(row)}: shows the table row "\`~/.claude/CLAUDE.md\` | Your habits for every project | The team: commit it" (${heading}), which is not a row of a table with that header in ${page}.`,
    ]);
    expect(added(withRow(header, header.replace('"Where"', '"File"')))).toEqual(
      [
        `${file}:${lineOf(header)}: shows the table header "File | What goes in it | Who gets it" (${heading}), which is not a table's header in ${page}.`,
        // Its rows are then under a header no page table has.
        ...[1, 2, 3, 4].map((k) =>
          expect.stringMatching(
            new RegExp(
              `^${escapeRegExp(file)}:${lineOf(header) + k}: shows the table row .*, which is not a row of a table with that header`,
            ),
          ),
        ),
      ],
    );
    // Changing one cell on the page takes the row off it.
    const pages = {
      ...repo.pages,
      [page]: repo.pages[page].replace(
        "| Your habits for every project |",
        "| Your habits for each project |",
      ),
    };
    expect(added({ ...repo, pages })).toEqual([
      expect.stringMatching(
        new RegExp(
          `^${escapeRegExp(file)}:${lineOf(row)}: shows the table row "\`~/\\.claude/CLAUDE\\.md\` \\| Your habits for every project \\| Only you"`,
        ),
      ),
    ]);
  });

  test("re-stamping a page without its step file fails it", () => {
    const page = pageOf("i-3");
    const stamp = repo.pages[page].match(STAMP)[0];
    const restamped = stamp.replace(/\d{4}-\d{2}-\d{2}$/, "2099-01-01");
    const pages = {
      ...repo.pages,
      [page]: repo.pages[page].replace(stamp, restamped),
    };
    expect(added({ ...repo, pages })).toEqual([
      `course/steps/i-3.md:3: is stamped "${stamp}", but ${page} is stamped "${restamped}". Re-verify the step file and copy the page's Stamp.`,
    ]);
    const stepFiles = {
      ...repo.stepFiles,
      [stepFile("i-3")]: repo.stepFiles[stepFile("i-3")].replace(
        stamp,
        restamped,
      ),
    };
    expect(added({ ...repo, pages, stepFiles })).toEqual([]);
  });

  test("a page or step file the manifest lists must exist", () => {
    const pages = { ...repo.pages };
    delete pages["docs/advanced/README.md"];
    const stepFiles = { ...repo.stepFiles };
    delete stepFiles[stepFile("a-7")];
    expect(added({ ...repo, pages, stepFiles })).toEqual([
      "course/manifest.json:1: lists docs/advanced/README.md, which doesn't exist",
      "course/manifest.json:1: lists course/steps/a-7.md, which doesn't exist",
    ]);
  });

  test("a missing Lesson page is reported once, not again for each warm-up from it", () => {
    const pages = { ...repo.pages };
    delete pages[pageOf("i-6")];
    expect(added({ ...repo, pages })).toEqual([
      `course/manifest.json:1: lists ${pageOf("i-6")}, which doesn't exist`,
    ]);
  });

  test("a quoted back reason must be in the page", () => {
    const file = stepFile("i-1");
    const line = "- back: Y2 Review the workflow here.";
    const at = repo.stepFiles[file].split("\n").indexOf(line) + 1;
    expect(at).toBeGreaterThan(0);
    const stepFiles = {
      ...repo.stepFiles,
      [file]: repo.stepFiles[file].replace(
        line,
        '- back: Y2 "A sentence no page holds at all."',
      ),
    };
    expect(added({ ...repo, stepFiles })).toEqual([
      expect.stringMatching(
        new RegExp(
          `^course/steps/i-1\\.md:${at}: quotes "A sentence no page holds at all\\." \\(.*\\), which is not in ${escapeRegExp(pageOf("i-1"))}\\.$`,
        ),
      ),
    ]);
  });

  test("a step file with no stamp or no lesson, or a page with no Stamp, fails", () => {
    const file = stepFile("b-1");
    const page = pageOf("b-1");
    const stamp = repo.pages[page].match(STAMP)[0];
    const without = (key) => ({
      ...repo.stepFiles,
      [file]: repo.stepFiles[file].replace(
        new RegExp(`^${key}:.*\\n`, "m"),
        "",
      ),
    });
    expect(added({ ...repo, stepFiles: without("stamp") })).toEqual([
      `${file}:1: has no stamp, but ${page} is stamped "${stamp}". Re-verify the step file and copy the page's Stamp.`,
    ]);
    expect(added({ ...repo, stepFiles: without("lesson") })).toEqual([
      `${file}:1: has no lesson, but course/manifest.json lists this file for b-1`,
    ]);
    const pages = {
      ...repo.pages,
      [page]: repo.pages[page].replace(stamp, ""),
    };
    const problem = `${page}:1: has no Stamp, so ${file} has none to match.`;
    expect(added({ ...repo, pages })).toEqual([problem]);
    expect(added({ ...repo, pages, stepFiles: without("stamp") })).toEqual([
      problem,
    ]);
  });

  test("no unquoted app line in a step file names a key or a terminal-only control", () => {
    expect(appWords(repo.stepFiles)).toEqual([]);
  });

  test("a planted Press p fails, naming its line", () => {
    const file = stepFile("i-5");
    const line = "- say: Save valid JSON: close the block after this entry.";
    const at = repo.stepFiles[file].split("\n").indexOf(line) + 1;
    expect(at).toBeGreaterThan(0);
    const planted = (say) => ({
      [file]: repo.stepFiles[file].replace(line, `- say: ${say}`),
    });
    expect(appWords(planted("Press p for the lesson page."))).toEqual([
      `course/steps/i-5.md:${at}: Press p for the lesson page.`,
    ]);
    expect(appWords(planted('"Press p for the lesson page."'))).toEqual([]);
  });
});

describe("a page's tables", () => {
  test("are read as GitHub reads them: outer pipes, escaped pipes, outside fences", () => {
    const page = [
      "Some text | with a pipe.",
      "",
      "| Where | Who |",
      "|---|:--:|",
      "| `a \\| b` | Only you |",
      "| Auto memory |  The team  |",
      "After the table.",
      "",
      "```",
      "| In | a block |",
      "|---|---|",
      "| not | a table |",
      "```",
      "",
      "Key | Value",
      "--- | ---",
      "one | two",
      "",
      "| Three | cells | here |",
      "|---|---|",
      "| no | table | here |",
    ].join("\n");
    expect(pageTables(page)).toEqual([
      {
        header: ["Where", "Who"],
        rows: [
          ["`a | b`", "Only you"],
          ["Auto memory", "The team"],
        ],
      },
      { header: ["Key", "Value"], rows: [["one", "two"]] },
    ]);
  });
});

const casesDir = fileURLToPath(new URL("fixtures/lessons/", import.meta.url));
const cases = readdirSync(casesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = `${casesDir}${entry.name}/`;
    const spec = JSON.parse(readFileSync(`${dir}case.json`, "utf8"));
    return { name: entry.name, dir, spec };
  });

describe("the lesson test's cases", () => {
  test.each(cases.map((c) => [c.name, c]))("%s", (_, { dir, spec }) => {
    const result = checkLessons({
      ...courseAt(dir, { crlf: spec.crlf === true }),
      probes,
    });
    expect(result.problems.length > 0 ? "fail" : "pass").toBe(spec.expect);
    expect(result.problems).toHaveLength(spec.problems.length);
    spec.problems.forEach((pattern, k) =>
      expect(result.problems[k]).toMatch(new RegExp(pattern)),
    );
    if (spec.compared) expect(result).toMatchObject(spec.compared);
  });

  test("every case states its verdict and its problems", () => {
    for (const { name, spec } of cases) {
      expect(["pass", "fail"], name).toContain(spec.expect);
      expect(Array.isArray(spec.problems), name).toBe(true);
      if (spec.expect === "pass") expect(spec.problems, name).toEqual([]);
    }
  });
});
