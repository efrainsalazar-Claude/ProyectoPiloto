Implement a plan file phase by phase, with verification at each step.

Usage: `/implement_plan thoughts/shared/plans/[plan-file].md`

Then wait for the user to provide the plan file path (or read the path they already provided).

---

## Implementation Process

### Step 1 — Read the FULL plan before starting
Read the plan file completely. Understand all phases before touching any code.
If the plan references a research document, read that too.

### Step 2 — Confirm with user before starting
Summarize:
- Total number of phases
- Which phase you're starting with (always Phase 1 unless user specifies otherwise)
- Estimated scope of Phase 1

Ask: "Ready to start Phase 1: [name]?"

### Step 3 — Implement one phase at a time

For each phase:

1. **Announce**: "Starting Phase [N]: [name]"

2. **Implement** all steps in the phase exactly as specified in the plan
   - Follow existing patterns in the codebase (use codebase-pattern-finder if unsure)
   - Don't improvise — if something in the plan is ambiguous, stop and ask

3. **Run verification steps** from the plan:
   - Run each verification command
   - Report the output (pass/fail)
   - If a test fails, fix it before declaring the phase complete

4. **Check the plan checkboxes** — update `[ ]` to `[x]` for completed items

5. **Announce completion**: "Phase [N] complete. All verification steps passed."

6. **Wait for user confirmation** before starting next phase
   - Don't auto-proceed to the next phase
   - Let the user test and confirm

### Step 4 — Context management
If you notice context is getting large (many files read, many edits made):
- STOP before starting the next phase
- Write current progress to `thoughts/shared/progress/[plan-name]-progress.md`

Progress format:
```
# Progress: [Plan Name]
**Last updated**: [date]
**Plan file**: [path to plan]

## Status: Phase [X] of [Y] complete

## Completed Phases
- Phase 1: [name] — [brief summary of what was done]
- Phase 2: [name] — [brief summary]

## Current Phase
Phase [X+1]: [name] — not yet started

## Remaining Phases
- Phase [X+2]: [name]
- Phase [X+3]: [name]

## Notes / Blockers
[Any issues encountered or decisions made during implementation]
```

Then tell the user: "Context is getting large. Saved progress to [file]. Please start a new Claude Code session and run `/implement_plan [plan-file]` — it will pick up from Phase [X+1]."

### Rules
- NEVER skip verification steps
- NEVER implement more than one phase at a time without confirmation
- NEVER improvise beyond what the plan specifies — stop and ask if unclear
- ALWAYS run the actual commands (npm test, etc.) and report real output
- Use sub-agents only for targeted debugging when stuck, not for general exploration

Remember: You're implementing a solution, not just going through the motions.
Keep the end goal in mind and maintain forward momentum.
