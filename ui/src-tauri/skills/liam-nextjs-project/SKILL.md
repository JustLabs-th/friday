---
name: liam-nextjs-project
description: Create and edit a web app or website with Next.js using the company's approved packages. Use when the user asks for a web app, website, dashboard, form, internal tool or page. Covers starting the project, which packages are allowed, and how to finish.
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
3. Do not create a Next.js project any other way (`create-next-app`, `npx`, copying from the internet).
   Those download from the internet, which is not allowed, and give a different set of packages.

## 2. Build the app

- Pages live in `app/` (`app/page.tsx` is the home page; `app/about/page.tsx` is `/about`).
- Ready-made parts are in `components/ui/`: `button`, `card`, `input`, `label`, `badge`, `table`.
  Import them with `@/components/ui/button` and so on. Style with Tailwind classes.
- Write the screen text in the user's language (usually Thai).
- Keep it simple. Save data in the browser (`localStorage`) or in a file only when the user did not ask
  for a database. Never invent a database address or password: databases are created by the platform
  team, not in the project.
- Code that needs the browser (`useState`, `onClick`, `localStorage`) goes in a file that starts with
  `"use client";`.

## 3. Packages: only the approved ones

- Everything the template needs is already listed in `package.json` and locked in `package-lock.json`.
  Prefer what is there: `react`, `next`, `tailwindcss`, `lucide-react` (icons), `recharts` and `echarts`
  (charts), `motion` (animation), `zod` (validation), `drizzle-orm` and `pg` (database code), `radix-ui`.
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
- Deploying a project (putting it online) is a separate step handled by the deploy tools. Do not use
  `Coolify-deploy_from_dockerfile` for a project that has source files: it only uploads the Dockerfile
  and not your code.

## 5. When you are done

Tell the user in two or three short sentences what you built and what they can do next. Do not list file
names, commands or technical steps unless they ask.
