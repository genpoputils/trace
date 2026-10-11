<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Trace — Project Development Rules

## Product Context
- **Product name:** Trace.
- **GitHub repository:** [https://github.com/genpoputils/trace](https://github.com/genpoputils/trace)
- **Mission:** Trace is a visual codebase intelligence platform.
- Preserve the existing Next.js, React, and TypeScript architecture.
- Prioritize the interactive code graph, dependency intelligence, change-impact visualization, and evidence-grounded AI explanations.

---

## GitHub Issues Are the Source of Truth for Planned Work
- Before starting a feature, bug fix, optimization, or significant refactor, identify the relevant open GitHub Issue.
- Read the full issue description, acceptance criteria, prerequisites, and parent epic before making changes.
- Use the GitHub integration or authenticated GitHub CLI (`gh`) to read issues when available.
- Verify that you are working in `genpoputils/trace`, not another repository.
- If GitHub issue access is unavailable, explicitly report the limitation and ask for the issue details or access. Do not pretend that an issue was read.
- Do not invent issue requirements or silently expand the scope.

---

## Issue-Driven Development Workflow
1. **Identify:** Identify the requested GitHub Issue by its actual issue number, for example `#1`.
2. **Review:** Read its description and acceptance criteria. Check prerequisite issues where relevant.
3. **Plan:** Summarize the intended changes and define how each acceptance criterion will be verified.
4. **Inspect:** Inspect the existing implementation before editing code.
5. **Implement:** Implement only the scope needed for that issue.
6. **Verify:** Run the relevant tests, checks, and manual verification.
7. **Report:** Report which acceptance criteria passed, failed, or remain unverified.
8. **Reference:** Reference the issue number in the commit or pull request when applicable.
9. **Update:** Update the GitHub issue only when the corresponding work has actually been verified. Do not close an issue or claim completion prematurely.

---

## Engineering Constraints
- Do not rewrite the application or replace existing frameworks without evidence that this is necessary.
- Keep performance, browser responsiveness, correctness, and maintainability as priorities.
- Do not introduce dependencies without a clear justification.
- Do not fabricate analysis results, test results, progress, dependency relationships, or AI evidence.
- Never commit API keys, environment secrets, or credentials.
- Keep unrelated changes out of a task.
- Preserve existing functionality and run regression checks after significant changes.

---

## Repository Performance
- Avoid repeating repository analysis when existing results remain valid.
- Measure performance bottlenecks before attempting speculative optimizations.
- Keep expensive analysis from blocking browser interaction.
- Use caching and lazy loading where measurements justify them.
- Treat large-repository and graph responsiveness as regression-test requirements.

---

## Task Completion Report
At the end of every implementation task, report:
1. **GitHub issue number and title.**
2. **Root cause or reason for the change.**
3. **Files changed.**
4. **Tests and checks actually run, with results.**
5. **Acceptance criteria completed and any remaining work.**
6. **Whether the change has been committed or pushed.**
7. **Any follow-up issue that is genuinely needed.**
