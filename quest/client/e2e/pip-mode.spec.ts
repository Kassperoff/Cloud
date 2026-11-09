// Pip's mode follows the b-1 step states on a real play (rehoming row 160,
// 254 D22+): on the built app in a fresh Practice copy, Pip is Idle on the
// waiting card, Thinking from check.started to the result, and Idle again once it says
// Not yet, could not run (broken) or passed (done). The director's mode is
// read from `data-pip-mode` on Pip's element. It reuses rehomed.spec.ts's
// helpers from their modules (play.ts, practice-copy.ts).
import { renameSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { bar, heading, saveAt } from "./play.ts";
import { practiceCopy } from "./practice-copy.ts";

test.use({ viewport: { width: 1280, height: 900 } });
test.setTimeout(120_000);

/** b-1's note with its wrong claim corrected (b1-slice.spec.ts). */
const CORRECTED =
  "- linkcheck exits with code 1 when it finds broken links, so it can fail a CI job.\n";

const pip = (page: Page) => page.locator("[data-pip=beside]");
const card = (page: Page) => page.locator("[data-pip-target=lines] li").last();

/**
 * Records every mode Pip's element holds from the page's opening on, each
 * change once, in `window.__modes`. The mode follows the event feed
 * (check.started until the result, spec Reaction map), which lands after the
 * snapshot's Checking words, so it is read over the whole play rather than
 * while the bubble says Checking. A batch of mutations can hold more than one
 * change of the mode: each record's old value is the mode the one before it
 * set, so a short Thinking is never lost between two reads.
 *
 * It also reads the event stream's frames before the page does: it counts
 * the check.started frames in `window.__started` and holds whether a run is
 * out, as Pip's director does, in `window.__checking`. Pip thinks only for a
 * run that starts with check.started, and the step's timed poll is not such
 * a run.
 */
function recordModes(page: Page) {
  return page.addInitScript(() => {
    const seen: string[] = [];
    const record = window as unknown as {
      __modes: string[];
      __started: number;
      __checking: boolean;
    };
    record.__modes = seen;
    record.__started = 0;
    record.__checking = false;
    const results = [
      "check.passed",
      "check.notYet",
      "check.broken",
      "check.ended",
    ];
    const Source = window.EventSource;
    window.EventSource = class extends Source {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.addEventListener("event", (event) => {
          const data: unknown = JSON.parse(
            (event as MessageEvent<string>).data,
          );
          const type = (data as { type?: unknown }).type;
          if (type === "check.started") {
            record.__started += 1;
            record.__checking = true;
          } else if (results.includes(type as string))
            record.__checking = false;
        });
      }
    };
    const note = (mode: string | null | undefined) => {
      if (mode && seen.at(-1) !== mode) seen.push(mode);
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (
          record.attributeName === "data-pip-mode" &&
          (record.target as Element).matches("[data-pip=beside]")
        )
          note(record.oldValue);
      }
      note(
        document
          .querySelector("[data-pip=beside]")
          ?.getAttribute("data-pip-mode"),
      );
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-pip", "data-pip-mode"],
      attributeOldValue: true,
    });
  });
}

/**
 * The record so far: Pip's modes, the check.started frames counted, and
 * whether a run is out by the stream.
 */
const recorded = (page: Page) =>
  page.evaluate(() => {
    const record = window as unknown as {
      __modes: string[];
      __started: number;
      __checking: boolean;
    };
    return {
      modes: [...record.__modes],
      started: record.__started,
      checking: record.__checking,
    };
  });

/**
 * Idle, Thinking while the run is out, then the line's state and Idle.
 * `asked`: the learner asked for the run (Check again), so a check.started
 * must come. Otherwise the result is a change's, and the run that brings it
 * may be the file watcher's, which Pip thinks through (254 D25), or the
 * step's timed poll, which happened to read the change first and which Pip
 * never thinks for (ticket 352).
 */
async function checkTo(
  page: Page,
  state: string,
  run: () => Promise<void>,
  asked: boolean,
) {
  // A run the file watcher started on an earlier change (the folder renamed
  // away or back) may still be out: let it finish, so the record is read
  // from Pip at rest. The record runs from the page's opening, so a run the
  // watcher starts only after this rest is read in it too (335). Either run
  // may be the one Pip thinks through: the watcher's run on a change is a
  // Check run too (254 D25), so either shows the mode follows the run.
  // At rest means no run out by the stream as well as Idle on Pip: a
  // check.started can land before Pip's element turns to Thinking.
  let rest = { at: -1, started: 0 };
  await expect
    .poll(
      async () => {
        const now = await recorded(page);
        rest = {
          at:
            now.modes.at(-1) === "idle" && !now.checking
              ? now.modes.length - 1
              : -1,
          started: now.started,
        };
        return rest.at;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(0);
  await run();
  await expect(card(page)).toHaveAttribute("data-state", state, {
    timeout: 30_000,
  });
  // Idle again after Thinking, read from the record: the watcher may start
  // one more run for the same change once this one has ended, so Pip's mode
  // now could be that run's Thinking. The record from `rest` on starts at
  // Idle, so only a Thinking and the Idle after it are left to find, and
  // only when a run started: with none, Pip never thought (the poll's pass).
  await expect
    .poll(
      async () => {
        const now = await recorded(page);
        const seen = now.modes.slice(rest.at);
        const thought = seen.indexOf("thinking");
        if (now.started === rest.started)
          return asked ? "no check.started" : thought === -1;
        return thought !== -1 && seen.indexOf("idle", thought) !== -1;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

const checkAgain = (page: Page) => () =>
  bar(page).getByRole("button", { name: "Check again" }).click();

test("Pip's mode follows b-1's step states on a real play: rest, checking, Not yet, broken and done (row 160)", async ({
  page,
}) => {
  const copy = practiceCopy();
  try {
    copy.write(".practice/learn.json", saveAt("b-1", "Y3", 0));
    await copy.start();
    await recordModes(page);
    await page.goto(copy.url);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(heading(page)).toHaveText("Correct one claim");

    // The card at rest: until the learner runs the Check, its line is
    // waiting, not Not yet (344). Once the step's opening look has its
    // answer (Pip thinks while it runs), Pip holds Idle.
    await expect(card(page)).toHaveAttribute("data-state", "waiting", {
      timeout: 30_000,
    });
    await expect(pip(page)).toHaveAttribute("data-pip-mode", "idle", {
      timeout: 30_000,
    });

    await checkTo(page, "not-yet", checkAgain(page), true);

    // The folder the Check runs in is gone: it cannot run.
    const project = join(copy.dir, "project");
    renameSync(project, `${project}.away`);
    await checkTo(page, "broken", checkAgain(page), true);
    renameSync(`${project}.away`, project);

    // The correction alone passes it: the run the file watcher starts on
    // the change is a Check run, so Pip thinks for it too (254 D25), unless
    // the timed poll read the change first. No Check again: the run may pass
    // first, and the button becomes Next step.
    await checkTo(
      page,
      "ok",
      () => {
        copy.write("project/practice/b-1/onboarding.md", CORRECTED);
        return Promise.resolve();
      },
      false,
    );
    await expect(
      bar(page).getByRole("button", { name: "Next step" }),
    ).toBeVisible();
  } finally {
    await copy.dispose();
  }
});
