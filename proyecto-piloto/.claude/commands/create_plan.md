You help create detailed, phased implementation plans for features and tasks.

Let me start by understanding what we're building. Please provide:
1. The task or feature description
2. Any relevant context, constraints, or requirements
3. Links to related research documents (optional)

Tip: You can invoke this command with a research doc directly:
`/create_plan thoughts/shared/research/2026-03-12_feature.md`

Then wait for the user's input.

---

## Planning Process

### Step 1 — Read any provided research documents FIRST
If the user provides a research document path, read it completely before doing anything else.

### Step 2 — Spawn parallel research agents (before asking questions)
Before asking the user ANY questions, research in parallel:

- `codebase-locator` — find all files related to the task
- `codebase-analyzer` — understand how current implementation works in relevant areas
- `codebase-pattern-finder` — find similar features already built that can be modeled
- `thoughts-locator` — find any existing research or previous plans on this topic

Wait for ALL agents to complete before proceeding.

### Step 3 — Ask ONLY what research couldn't answer
After research, ask only questions that require human judgment:
- Business logic decisions (what behavior is correct?)
- Design preferences (which approach do you prefer?)
- Priority tradeoffs (which edge case matters more?)

DO NOT ask about things the codebase already answered.
If you found how auth works, don't ask "how does auth work?"
Maximum 3 questions. If you can make a reasonable assumption, make it and note it in the plan.

### Step 4 — Write the plan

Save to: `thoughts/shared/plans/YYYY-MM-DD-[description].md`

```
---
date: [ISO datetime]
git_commit: [hash]
branch: [branch]
topic: "[Feature/Task Name]"
status: in-progress
---

# Plan: [Feature/Task Name]

## Objective
[One clear sentence describing what this accomplishes]

## Current State
[What exists today, based on research — with file:line references]

## Assumptions
[Decisions made without explicit user input — list clearly so they can be corrected]

## Implementation Phases

### Phase 1: [Name]
**Goal**: [What this phase accomplishes]

**Files to modify:**
- `src/app/api/feature/route.ts` — create new API endpoint for X
- `prisma/schema.prisma` — add User model field Y

**Files to create:**
- `src/components/FeatureForm.tsx` — new form component

**Implementation steps:**
1. [Specific step]
2. [Specific step]

**Verification:**
- [ ] Run: `npm test`
- [ ] Run: `npm run dev` and verify [specific behavior] at [URL]
- [ ] Check: [specific thing to confirm in browser or DB]

---

### Phase 2: [Name]
[same structure]

---

### Phase 3: [Name]
[same structure]

## Edge Cases to Handle
- [Case 1]: [How it should be handled]
- [Case 2]: [How it should be handled]

## Out of Scope
[Explicitly list what we are NOT doing in this plan]

## Commands Reference
- `npm run dev` — start dev server at localhost:3000
- `npx prisma migrate dev --name [name]` — apply schema changes
- `npx prisma studio` — view DB at localhost:5555
- `npm test` — run tests
```

### Step 5 — Present the plan for review
After saving, tell the user:
- Where the plan was saved
- Ask them to review:
  - Are the phases properly scoped?
  - Are the verification steps specific enough?
  - Any edge cases missing?
  - Are the assumptions correct?

Do NOT start implementing until the user explicitly approves.
