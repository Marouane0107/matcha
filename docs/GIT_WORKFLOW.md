# Git Workflow

Nobody works directly on `main`. Use one small, short-lived branch per feature.
Do not keep permanent frontend/backend branches. Both developers can work in
parallel in their owned workspace; shared contracts require joint review.

## Branch Examples

| Marouane: Frontend & Realtime Client | Oussama: Backend & Core |
| --- | --- |
| feat/auth-ui | feat/database-foundation |
| feat/profile-ui | feat/auth-api |
| feat/browse-ui | feat/profile-api |
| feat/search-ui | feat/search-api |
| feat/chat-ui | feat/matching-api |
| feat/notifications-ui | feat/socket-server |

## Start a Feature

Start with a clean working tree. Finish or stash unrelated work first.

```sh
git checkout main
git pull
git checkout -b feat/name
```

Use the finalized Phase 0 API/socket contracts; review changes to them before
implementing a different contract on either side. Keep PRs focused;
avoid unrelated formatting, dependency churn and changes to the other owner's area.

## Complete a Feature

Run `npm run typecheck`, `npm run build`, and feature tests when available. Check
`git status` and review changes for secrets before staging.

```sh
git add .
git diff --cached
git commit -m "feat: description"
git push -u origin feat/name
```

Then open a pull request and request review from the other developer. Include
scope, verification results, contract changes, migration requirements and UI
screenshots when relevant. Resolve comments before merging; delete the merged
feature branch. Never commit local environment files or credentials.

```text
main -> feature branch -> commit -> push -> pull request
     -> review by the other developer -> merge to main
```

## Repository Settings

Configure main-branch protection in the hosting service: require pull requests,
one approving review by the other developer, and resolution of review discussions.
Add required CI checks once CI is introduced. Do not force-push `main`.
