// Continue, Skip and I've done it act only on the beat they were pressed on
// (ticket 264), as Check again does since 292. In the d264-i1 dry-run a
// second tab on the same app pressed through i-1's Y3 and Y4 while the
// driver's tab showed Y3: Y4's two self beats were never on its screen.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  beatOf,
  course,
  driver,
  finishedBefore,
  keyOf,
  pending,
  playUntil,
  respond,
  save,
  stepOf,
  where,
} from "./drive.mjs";

// i-1, played as a Learner who needs no help, on to Y3's first beat: the
// Check of both reviewed skills, before the commit.
function atY3() {
  const d = driver({ course, saved: save({ lessons: finishedBefore("i-1") }) });
  d.open("i-1");
  playUntil(d, (s) => s.lesson === "i-1" && s.beat && stepOf(s).id === "Y3");
  assert.deepEqual(where(d.state), {
    lesson: "i-1",
    phase: "playing",
    step: "Y3",
    beat: 0,
    status: "opening",
  });
  return d;
}
const place = (d) => [stepOf(d.state).id, d.state.pos.beat];

test("a Continue pressed on an earlier beat leaves the beat on the card where it is", () => {
  const d = atY3();
  // The commit lands: the Check passes, and Continue opens the git-clean
  // beat, which the clean tree passes at once.
  respond(d, pending(d, "check"), { pass: true });
  const y3 = keyOf(d.state);
  d.cont();
  respond(d, pending(d, "git"));
  assert.deepEqual(place(d), ["Y3", 1]);
  assert.equal(d.state.beat.status, "done");
  // A tab that still shows Y3's first beat presses Continue again.
  d.refused("step.continue", { beat: y3 });
  assert.deepEqual(place(d), ["Y3", 1]);
  // Pressed on the beat on the card, it goes on.
  d.cont(keyOf(d.state));
  assert.deepEqual(place(d), ["Y4", 0]);
});

test("Y4's self beats each wait for I've done it pressed on them", () => {
  const d = atY3();
  respond(d, pending(d, "check"), { pass: true });
  d.cont();
  respond(d, pending(d, "git"));
  const y3last = keyOf(d.state);
  d.cont();
  assert.deepEqual(place(d), ["Y4", 0]);
  assert.equal(beatOf(d.state).verify.kind, "self");
  // Presses from the beat before move nothing: the /tdd beat stays.
  d.refused("step.continue", { beat: y3last });
  d.refused("step.markDone", { beat: y3last });
  assert.deepEqual(place(d), ["Y4", 0]);
  assert.equal(d.state.beat.status, "waiting");
  const tdd = keyOf(d.state);
  d.markDone(tdd);
  assert.deepEqual(place(d), ["Y4", 1]);
  // A second press of the same button, sent from the /tdd beat, does not
  // tick the review beat after it.
  d.refused("step.markDone", { beat: tdd });
  assert.deepEqual(place(d), ["Y4", 1]);
  assert.equal(d.state.beat.status, "waiting");
  d.markDone(keyOf(d.state));
  assert.deepEqual(place(d), ["Y4", 2]);
});

test("an action with no beat key moves nothing", () => {
  const d = atY3();
  respond(d, pending(d, "check"), { pass: true });
  d.refused("step.continue", {});
  assert.deepEqual(place(d), ["Y3", 0]);
});
