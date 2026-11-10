---
name: liam-nextjs-project
description: Create and edit a web app or website with Next.js using the company's template and approved packages. Use when the user asks for a web app, website, dashboard, form, internal tool or page. Covers starting the project, the project's own rules (AGENTS.md), and how to finish.
---

# Next.js project for Liam users

The people you work for are not developers. Speak plainly, in the language they use, and never ask them
for technical details you can decide yourself (folders, versions, ports, UUIDs).

## 0. Plan first

For work with several steps, call `update_plan` before you start with 3 to 5 short steps in the user's
language (for example "สร้างโปรเจกต์", "ทำหน้าบันทึกงาน", "ตรวจแพ็กเกจ"), and update it as you finish each
step. The user sees this plan instead of the technical details.

## 1. Start the project

1. Look at the project folder. If it is empty, call the tool `Liam-new_nextjs_project` once with a short
   lowercase name made of letters, digits and hyphens (for example `work-log`). It copies the company
   template into the folder.
2. If the folder already has a project (a `package.json`), do not call it again. Edit what is there.
   Call `Liam-upgrade_project` once at the start of a session on an older project (for example when it has
   no `lib/user.ts`, or no `AGENTS.md`): it brings the platform's files up to date (top bar, sign-in helper,
   colors, these rules) without touching the user's own screens.
3. Do not create a Next.js project any other way (`create-next-app`, `npx`, copying from the internet).
   Those download from the internet, which is not allowed, and give a different set of packages.

## 2. Read the project's rules: `AGENTS.md`

**Before you change anything, read `AGENTS.md` in the project folder and follow it.** It is the single source
of truth for how to build in this template: who is signed in and the data the company sign-in gives (name,
employee code, section, department, groups; `getUser()`), checking permissions on the server, the top bar
(`<UserBar title=... icon=...>`), shadcn components (do not write your own base components), colors and
themes, tables and forms, data without a database, packages, and which files belong to the platform and must
not be edited. If this skill and `AGENTS.md` ever disagree, `AGENTS.md` wins.

A few things that matter most, in short:

- Every app is already behind the company sign-in. Never build a login, passwords or an auth package.
- Fill employee code and name from `getUser()`; never ask people to type who they are.
- Use only the components in `components/ui/` and the color tokens; write the screen text in the user's language.
- Never invent a database address or password; shared data needs a database from the platform team.

## 3. Packages: only the approved ones

- Everything the template needs is already listed in `package.json` and locked in `package-lock.json`.
- Do not run `npm install <name>` to add something, and never change `.npmrc` or the `certs` folder.
  Packages come only from the company Nexus; installing from anywhere else will fail or is not allowed.
- If you need a package that is not listed, call `Liam-check_packages` first. If it says the package is
  not approved, do not add it. Tell the user in plain words that this needs approval from the platform
  team, and offer a way to do it with what is available.
- Before you finish, call `Liam-check_packages` once more and fix anything it reports.

## 4. Running and deploying

- Do not run `npm install`, `npm run dev` or `npm run build` on the user's computer unless they ask:
  most computers do not have the right Node version. The platform builds the app for you from the
  `Dockerfile` that is already in the project. Do not edit the `Dockerfile` base images; they come from
  the company registry (`registry.digitalx.srt`), not Docker Hub.
- To put the project online, call `Liam-deploy_project` (only when the user asks to deploy, publish or
  share it). It brings the platform files up to date, saves the work, creates the application, gives it an
  address, adds it to the dashboard and puts the company sign-in in front of it, so only people with a
  company account can open it. Call it again after later changes to publish the newest version. Tell the
  user the address it returns, and that people sign in with their company account. The first build can take
  a few minutes; if the status is not "running" yet, say that it is still being built and offer to check again.
- Do not use the `Coolify-deploy_from_*` tools for a project that has source files: they do not carry
  your code. Use `Liam-deploy_project`.

## 5. When you are done

Tell the user in two or three short sentences what you built and what they can do next. Do not list file
names, commands or technical steps unless they ask.
