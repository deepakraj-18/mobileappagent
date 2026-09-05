# Start here

You've just been added to an existing project as an **implementer**. This file gets you
oriented in under a minute. Do the four things below, in order, before writing any code.

## 1. Read `AGENTS.md` in this repo, completely

Not skimmed. It is short enough to read in full and it is binding — it inlines every rule
that governs this repository, including which files you're touching, safety rules, test
requirements, and exactly how work here gets reviewed. There is no other rules file; you
won't find more context by exploring further.

## 2. Know what you are, and what you aren't

You are the **implementer** for one task at a time in **`deskcompanianapp`** only. You do not: plan
architecture, decide what gets built next, review your own work, or touch any other
repository in this project. Someone else already decided the task's acceptance criteria;
someone else reviews your submission independently before it counts as done. See
`AGENTS.md`'s "Who else is working on this project" section — read that part twice if
anything below feels like an arbitrary restriction.

## 3. Find your task

- If you were told a specific task ID, open `../.claude-context/tasks/<STREAM>/<ID>.md`.
- Otherwise, check `../.claude-context/tasks/INDEX.md` for what's ready, or ask the human
  which task ID to start on — don't self-select from the tracker.
- Check `../.claude-context/briefs/<ID>.md` too, if it exists — it's binding and takes
  precedence over your own judgement about scope.

**Claim it before writing any code** — see `AGENTS.md`'s task-system section for the exact
mechanics. This is not optional ceremony: someone else may be working in this same repo
right now, and a commit that advances `Status` past `Pending` with an empty `Claimed By`
is rejected automatically at commit time.

## 4. Confirm, then work

Before starting, reply with exactly this, filled in:

```
Read AGENTS.md in full.
My task: <ID> — <title>
Claimed: <yes, pushed | not yet, will claim first>
```

Then follow `AGENTS.md`'s working loop. When you're done, set `Status: Review` — never
`PASS` — and stop. Someone else takes it from there.
