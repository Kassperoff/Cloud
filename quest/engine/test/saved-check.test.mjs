// A passed check beat in the save (ticket 314): reopening the app keeps it
// passed, with the run that passed it, instead of asking for Check again; a
// slow item a run left out shows as pending, not as missing.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  checkItems,
  checkResult,
  liveCourse as course,
  driver,
  finishedBefore,
  pending,
  sanitize,
  save,
  snapshot as toSave,
} from "./drive.mjs";
import { project } from "../src/project.ts";

const beatView = (d) => project(d.state).lesson.beat;
const at = (id, place, extra = {}) =>
  driver({
    course,
    saved: save({
      lessons: {
        ...finishedBefore(id, course),
        [id]: { warm: [], ...place, ...extra },
      },
    }),
  });
const checksAsked = (d) => d.effects.filter((e) => e.type === "check").length;
const lessonOf = (id) => course.find((l) => l.id === id);
// The first check beat of lesson `id` whose items include a slow one, or
// none: its place, with every step before it done.
function checkBeat(id, slow) {
  const l = lessonOf(id);
  const steps = l.content.steps;
  for (const [k, step] of steps.entries())
    for (const [beat, b] of step.beats.entries()) {
      if (b.verify.kind !== "check") continue;
      const items = b.verify.all ? l.items.map((_, i) => i) : b.verify.items;
      if (items.some((i) => (l.slow ?? []).includes(i)) !== slow) continue;
      return {
        place: {
          step: step.id,
          beat,
          done: steps.slice(0, k).map((x) => x.id),
        },
        items,
      };
    }
  throw new Error(`${id}: no check beat with slow ${String(slow)}`);
}
const PLAIN = checkBeat("b-1", false);
// A beat of b-1 that checks nothing.
const NOT_CHECK = (() => {
  for (const step of lessonOf("b-1").content.steps)
    for (const [beat, b] of step.beats.entries())
      if (b.verify.kind !== "check") return { step: step.id, beat };
  throw new Error("b-1: every beat checks");
})();
const SLOW = checkBeat("b-1", true);

test("a check beat that passed is saved with its run, and a reopen keeps it passed without running the Check again", () => {
  const d = at("b-1", PLAIN.place);
  d.open("b-1");
  const passing = checkItems(d.state, true);
  d.send(checkResult(pending(d, "check"), passing));
  assert.equal(beatView(d).status, "already");
  const saved = toSave(d.state);
  assert.deepEqual(saved.lessons["b-1"].passedCheck, {
    step: PLAIN.place.step,
    beat: PLAIN.place.beat,
    items: passing,
  });
  // Reopened from the save: passed, its lines met, and no Check asked for.
  const again = driver({ course, saved });
  again.open("b-1");
  assert.equal(beatView(again).status, "done");
  assert.deepEqual(
    beatView(again).verification,
    PLAIN.items.map((i) => ({ text: lessonOf("b-1").items[i], pass: true })),
  );
  assert.equal(checksAsked(again), 0);
});

test("moving on drops the saved pass; a pass saved for another place, or for a beat that is not a check, is dropped on load", () => {
  const d = at("b-1", PLAIN.place);
  d.open("b-1");
  d.send(checkResult(pending(d, "check"), checkItems(d.state, true)));
  assert.ok(d.state.progress["b-1"].passedCheck);
  d.cont();
  assert.notDeepEqual(
    [d.state.progress["b-1"].step, d.state.progress["b-1"].beat],
    [PLAIN.place.step, PLAIN.place.beat],
  );
  assert.equal(d.state.progress["b-1"].passedCheck, undefined);
  assert.equal(toSave(d.state).lessons["b-1"].passedCheck, undefined);
  const items = [{ index: 1, text: "x", pass: true, hint: "" }];
  // Saved at Y3 but placed at Y4: another place.
  const moved = at(
    "b-1",
    { step: "Y4", beat: 0 },
    { passedCheck: { step: "Y3", beat: 0, items } },
  );
  assert.equal(moved.state.progress["b-1"].passedCheck, undefined);
  // A beat that checks nothing.
  const notCheck = at("b-1", NOT_CHECK, {
    passedCheck: { ...NOT_CHECK, items },
  });
  assert.equal(notCheck.state.progress["b-1"].passedCheck, undefined);
});

test("a slow item the run left out is pending, waiting for Check again, not missing", () => {
  const d = at("b-1", SLOW.place);
  d.open("b-1");
  const slowAt = SLOW.items.find((i) => lessonOf("b-1").slow.includes(i));
  const items = checkItems(d.state, true).map((it) =>
    it.index === slowAt ? { ...it, pass: false, slow: true } : it,
  );
  // b-1's slow beat checks only slow items, so its arrival run runs them: a
  // poll that leaves one out and lands first is no answer (ticket 344).
  const eff = pending(d, "check");
  d.send(checkResult(eff, items));
  assert.equal(beatView(d).status, "checking");
  // The arrival run's FAIL waits for Check again: pending, not Not yet.
  d.send(
    checkResult(
      eff,
      checkItems(d.state, true).map((it) =>
        it.index === slowAt ? { ...it, pass: false, hint: "not yet" } : it,
      ),
    ),
  );
  const view = beatView(d);
  assert.equal(view.status, "waiting");
  const slow = lessonOf("b-1").items[slowAt];
  assert.deepEqual(
    view.verification.find((line) => line.text === slow),
    { text: slow, pass: false, pending: true },
  );
  assert.ok(
    view.verification
      .filter((line) => line.text !== slow)
      .every((line) => line.pass && !("pending" in line)),
  );
});

test("the save keeps a well-formed pass, capped, and drops a malformed one", () => {
  const items = [
    {
      index: 1,
      text: "t".repeat(400),
      pass: true,
      hint: "",
      slow: true,
      extra: 1,
    },
  ];
  const kept = sanitize({
    lessons: {
      "b-1": {
        step: "Y3",
        beat: 0,
        passedCheck: { step: "Y3", beat: 0, items },
      },
    },
  }).lessons["b-1"].passedCheck;
  assert.deepEqual(kept, {
    step: "Y3",
    beat: 0,
    items: [
      { index: 1, text: "t".repeat(300), pass: true, hint: "", slow: true },
    ],
  });
  for (const bad of [
    "yes",
    { step: "Y3", beat: -1, items },
    { step: "../x", beat: 0, items },
    { step: "Y3", beat: 0, items: "all" },
    { step: "Y3", beat: 0, items: [{ index: "1", text: "x", pass: true }] },
  ])
    assert.equal(
      sanitize({
        lessons: { "b-1": { step: "Y3", beat: 0, passedCheck: bad } },
      }).lessons["b-1"].passedCheck,
      undefined,
      JSON.stringify(bad),
    );
});

// b-3's last Your turn step checks every item, slow ones too, and so does
// its Check step right after it (263). The place of a step, with every step
// before it done.
const placeOf = (id, stepId) => {
  const steps = lessonOf(id).content.steps;
  const k = steps.findIndex((x) => x.id === stepId);
  return { step: stepId, beat: 0, done: steps.slice(0, k).map((x) => x.id) };
};
// Every item the beat on the card checks, passing, each slow one a
// placeholder when `placeholders` says so, as a poll's run leaves it out.
const run = (d, { placeholders }) => {
  const slow = lessonOf(d.state.lesson).slow;
  return checkItems(d.state, true).map((it) =>
    placeholders && slow.includes(it.index)
      ? { ...it, pass: false, slow: true }
      : it,
  );
};
// b-3 on its last Your turn step, passed by Check again, then moved on.
const pastY5 = () => {
  const d = at("b-3", placeOf("b-3", "Y5"));
  d.open("b-3");
  const first = pending(d, "check");
  assert.equal("slow" in first, false, "a mixed beat leaves slow items to r");
  d.send(checkResult(first, run(d, { placeholders: true })));
  d.run();
  const asked = pending(d, "check");
  assert.equal(asked.slow, true);
  d.send(checkResult(asked, run(d, { placeholders: false })));
  assert.equal(beatView(d).status, "done");
  d.cont();
  assert.equal(d.state.progress["b-3"].step, "C");
  return d;
};

test("a check step right after one whose Check again passed its slow lines runs them on arrival, so they show passing, not Runs on Check again (263)", () => {
  const d = pastY5();
  const arrival = pending(d, "check");
  assert.equal(arrival.items, null, "the Check step checks every item");
  assert.equal(arrival.slow, true, "its arrival runs the slow items too");
  assert.equal("asked" in arrival, false, "the arrival run is not an r-run");
  // A poll that leaves them out and lands first is no first answer.
  d.send(checkResult(arrival, run(d, { placeholders: true })));
  assert.equal(beatView(d).status, "checking");
  d.send(checkResult(arrival, run(d, { placeholders: false })));
  const view = beatView(d);
  assert.equal(view.status, "already");
  assert.equal(view.slowWait, false);
  assert.equal(view.verification.length, lessonOf("b-3").items.length);
  assert.ok(
    view.verification.every((line) => line.pass && !("pending" in line)),
    JSON.stringify(view.verification),
  );
});

test("a slow line that fails on such an arrival waits for the learner, its row for Check again (263)", () => {
  const d = pastY5();
  const slowAt = lessonOf("b-3").slow[0];
  d.send(
    checkResult(
      pending(d, "check"),
      run(d, { placeholders: false }).map((it) =>
        it.index === slowAt ? { ...it, pass: false, hint: "not yet" } : it,
      ),
    ),
  );
  const view = beatView(d);
  assert.equal(view.status, "waiting", "an arrival FAIL is no Not yet (344)");
  const text = lessonOf("b-3").items[slowAt];
  assert.deepEqual(
    view.verification.find((line) => line.text === text),
    { text, pass: false, pending: true },
  );
});

test("a check step opened without such a pass before it leaves its slow items to Check again (263)", () => {
  const d = at("b-3", placeOf("b-3", "C"));
  d.open("b-3");
  assert.equal("slow" in pending(d, "check"), false);
});
