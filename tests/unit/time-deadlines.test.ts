import test from "node:test";
import assert from "node:assert/strict";
import { addDays, datesBetween, formatPkt, formatRemaining, isoWeekday, karachiToIso, pktDate, pktDayRange, pktTime, toPktInputs } from "../../src/lib/time";
import { compliance, resolveWindow, ruleStatus, windowState, type DeadlineExtension, type DeadlineRule } from "../../src/lib/deadlines";

test("karachiToIso converts PKT wall clock to the right UTC instant", () => {
  assert.equal(karachiToIso("2030-01-01", "17:00"), "2030-01-01T12:00:00.000Z");
  assert.equal(karachiToIso("2030-01-01", "00:00"), "2029-12-31T19:00:00.000Z");
  assert.equal(karachiToIso("2030-07-01", "17:00"), "2030-07-01T12:00:00.000Z"); // no DST in Pakistan
  assert.throws(() => karachiToIso("2030-02-30", "10:00"));
  assert.throws(() => karachiToIso("2030-01-01", "24:00"));
  assert.throws(() => karachiToIso("01/01/2030", "10:00"));
});

test("pktDate / pktTime use Karachi, not UTC", () => {
  // 21:30 UTC on 31 Dec is already 02:30 on 1 Jan in Karachi
  assert.equal(pktDate("2029-12-31T21:30:00Z"), "2030-01-01");
  assert.equal(pktTime("2029-12-31T21:30:00Z"), "02:30");
  assert.equal(pktDate("2030-01-01T18:59:59Z"), "2030-01-01");
  assert.equal(pktDate("2030-01-01T19:00:00Z"), "2030-01-02");
  assert.deepEqual(toPktInputs("2030-01-01T12:00:00Z"), { date: "2030-01-01", time: "17:00" });
});

test("pktDayRange is a [start, end) Karachi day in UTC", () => {
  assert.deepEqual(pktDayRange("2030-01-01"), { start: "2029-12-31T19:00:00.000Z", end: "2030-01-01T19:00:00.000Z" });
});

test("date helpers", () => {
  assert.equal(addDays("2030-02-28", 1), "2030-03-01");
  assert.equal(isoWeekday("2030-01-06"), 7); // Sunday
  assert.equal(isoWeekday("2030-01-07"), 1); // Monday
  assert.deepEqual(datesBetween("2030-01-01", "2030-01-03"), ["2030-01-01", "2030-01-02", "2030-01-03"]);
  assert.deepEqual(datesBetween("2030-01-03", "2030-01-01"), []);
  assert.equal(datesBetween("2000-01-01", "2030-01-01").length, 366); // capped
  assert.match(formatPkt("2030-01-01T12:00:00Z"), /01 Jan 2030.*05:00.*pm PKT/i);
  assert.equal(formatRemaining(90_061_000), "1d 01h 01m");
  assert.equal(formatRemaining(3_661_000), "1h 01m 01s");
  assert.equal(formatRemaining(-5), "0s");
});

test("window boundaries: opens_at <= t < closes_at", () => {
  const o = "2030-01-01T04:00:00Z";
  const c = "2030-01-01T12:00:00Z";
  assert.equal(windowState(o, c, new Date("2030-01-01T03:59:59.999Z")), "scheduled");
  assert.equal(windowState(o, c, new Date(o)), "open");
  assert.equal(windowState(o, c, new Date("2030-01-01T11:59:59.999Z")), "open");
  assert.equal(windowState(o, c, new Date(c)), "closed");
  assert.equal(ruleStatus({ opens_at: o, closes_at: c, is_active: false }, new Date(o)), "disabled");
});

const rule = (o: Partial<DeadlineRule>): DeadlineRule => ({
  id: "d1", kind: "project", title: "", scope_type: "all", class_id: null, batch_id: null, student_id: null, task_id: null,
  opens_at: "2030-01-01T00:00:00Z", closes_at: "2030-01-02T00:00:00Z", is_active: true, note: null, created_at: "", updated_at: "", ...o,
});
const me = { id: "s1", batch_id: "b1", class_id: "c1" };
const at = new Date("2030-01-01T12:00:00Z");

test("resolver: default policy applies when nothing is configured", () => {
  assert.deepEqual(
    [resolveWindow([], [], me, "project", null, "open", at).state, resolveWindow([], [], me, "project", null, "closed", at).state],
    ["open", "closed"],
  );
  assert.equal(resolveWindow([], [], me, "project", null, "open", at).configured, false);
});

test("resolver: disabled rules are ignored; other kinds/scopes do not apply", () => {
  const rules = [rule({ id: "a", is_active: false }), rule({ id: "b", kind: "daily_report" }), rule({ id: "c", scope_type: "batch", batch_id: "other" })];
  const w = resolveWindow(rules, [], me, "project", null, "closed", at);
  assert.equal(w.configured, false);
  assert.equal(w.state, "closed");
});

test("resolver: most specific scope wins, task-specific beats generic", () => {
  const rules = [
    rule({ id: "all", closes_at: "2030-01-05T00:00:00Z" }),
    rule({ id: "cls", scope_type: "class", class_id: "c1", closes_at: "2030-01-01T10:00:00Z" }), // closed at `at`
  ];
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", at).deadlineId, "cls");
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", at).state, "closed");
  rules.push(rule({ id: "stu", scope_type: "student", student_id: "s1", closes_at: "2030-01-09T00:00:00Z" }));
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", at).deadlineId, "stu");
  const taskRules = [rule({ id: "gen", kind: "task" }), rule({ id: "t1", kind: "task", task_id: "T", closes_at: "2030-01-01T11:00:00Z" })];
  assert.equal(resolveWindow(taskRules, [], me, "task", "T", "open", at).deadlineId, "t1");
  assert.equal(resolveWindow(taskRules, [], me, "task", "OTHER", "open", at).deadlineId, "gen");
});

test("resolver: an open window beats a scheduled one; scheduled beats closed", () => {
  const rules = [
    rule({ id: "week1", opens_at: "2030-01-01T00:00:00Z", closes_at: "2030-01-08T00:00:00Z" }),
    rule({ id: "week2", opens_at: "2030-01-05T00:00:00Z", closes_at: "2030-01-15T00:00:00Z" }),
  ];
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", at).deadlineId, "week1");
  const later = new Date("2030-01-20T00:00:00Z");
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", later).deadlineId, "week2"); // latest close
  const before = new Date("2029-12-30T00:00:00Z");
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", before).deadlineId, "week1"); // earliest opening
});

test("resolver: a student's extension moves only their close later", () => {
  const rules = [rule({ closes_at: "2030-01-01T10:00:00Z" })];
  const ext: DeadlineExtension[] = [{ id: "e", deadline_id: "d1", student_id: "s1", extended_until: "2030-01-03T00:00:00Z", reason: null, created_at: "" }];
  assert.equal(resolveWindow(rules, [], me, "project", null, "open", at).state, "closed");
  const w = resolveWindow(rules, ext, me, "project", null, "open", at);
  assert.equal(w.state, "open");
  assert.equal(w.extended, true);
  assert.equal(resolveWindow(rules, ext, { ...me, id: "s2" }, "project", null, "open", at).state, "closed");
  const shorter: DeadlineExtension[] = [{ ...ext[0], extended_until: "2030-01-01T09:00:00Z" }];
  assert.equal(resolveWindow(rules, shorter, me, "project", null, "open", at).closesAt, "2030-01-01T10:00:00.000Z");
});

test("compliance classification", () => {
  const w = resolveWindow([rule({})], [], me, "project", null, "open", at);
  assert.equal(compliance(w, "2030-01-01T05:00:00Z", at), "on_time");
  assert.equal(compliance(w, "2030-01-02T00:00:00Z", new Date("2030-01-03T00:00:00Z")), "late");
  assert.equal(compliance(w, null, new Date("2030-01-03T00:00:00Z")), "missed");
  assert.equal(compliance(w, null, at), "pending");
  assert.equal(compliance(resolveWindow([], [], me, "project", null, "open", at), null, at), "no_deadline");
});
