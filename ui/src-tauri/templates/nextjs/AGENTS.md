# Instructions for agents (read this first)

You are building or changing a web app from the company's Next.js template. The people you work for are
**not developers**. Reply in the language they write in (usually Thai), in plain words, and write every
screen text in that language. Never ask them for technical details you can decide yourself (folders,
versions, ports, ids). Finish what you start: do the work with tools, then report once at the end.

## 1. Where the app runs

- Docker image built from `Dockerfile`, run by the company platform (Coolify), listening on port 3000.
- Address: `<name>.apps.digitalx.srt`. Everything inside the company network; no internet.
- **Every request passes the company sign-in (SSO) before it reaches the app.** An unsigned visitor never
  gets to your code. So: never build a login page, a password field, a users/passwords table, or add an auth
  package (next-auth, passport, clerk, ...).

## 2. Who is using the app: `getUser()`

```ts
import { getUser, isInGroup } from "@/lib/user";

const user = await getUser(); // Server Components, Route Handlers, Server Actions only
```

| Field | Meaning | Notes |
|---|---|---|
| `user.username` | sign-in name | In this company it **is the employee code** (e.g. `015298`). Empty only if nobody is signed in. |
| `user.employeeId` | employee code | From claim `employee_id` / `employeeId` when the directory sends one, else `username`. **Use this for "employee id" fields.** |
| `user.name` | full name | From claim `name`, else given + family name. May be empty: fall back to `username`. |
| `user.email` | email | May be empty. |
| `user.factory` | factory | claim `factory`, e.g. `fac2`. Empty if not sent. |
| `user.section` | section | claim `section`, e.g. `FA`. Empty if not sent. |
| `user.department` | department | claim `dept`, e.g. `Digital Transformation`. Empty if not sent. |
| `user.groups` | directory groups, short names | e.g. `["FA", "llm-users", "ragflow-users"]`. **A mix:** organisation groups (the section, `FA`) and access groups of other company systems (`bifrost-admins`, `llm-users`, `org-owners`, `ragflow-users`). Pick the group by its exact name; never assume the first one is meaningful. May be empty. |
| `user.roles` | realm roles | claim `realm_access.roles`, e.g. `["ai-user"]`. Empty if not sent. |
| `user.claims` | every claim of the sign-in token | everything above plus `sub`, `preferred_username`, `name`, `given_name`, `family_name`, `email`, `email_verified`, and anything else the directory adds. Read others as `user.claims["x"]`, type-check them (`typeof x === "string"`), and expect them to be missing. |

The directory's claims seen for a real account (values here are examples): `preferred_username: "015298"`,
`name: "Nobparat Bunchalor"`, `email`, `factory: "fac2"`, `section: "FA"`, `dept: "Digital Transformation"`,
`groups: ["FA", "bifrost-admins", ...]`, `realm_access.roles: ["ai-user"]`.
`factory`, `section`, `dept` and the roles only arrive when the platform has enabled them for the app's sign-in
client; if `user.section` is empty on a deployed app, say so to the user instead of guessing.
Group names that control company systems (`bifrost-admins`, `org-owners`, `llm-users`, ...) are not rules for
your app: do not use them to grant access inside the app unless the user explicitly names that group.

Rules:

- `getUser()` works only on the server. A Client Component (`"use client"`) must receive what it needs **as props**
  from a Server Component; it cannot call `getUser()`.
- **Fill forms from the claims; do not make people type who they are.** Employee code and name fields are
  pre-filled from `user.employeeId` / `user.name` and are read-only (or hidden). Store the author/owner of a
  record as `user.employeeId`, taken on the server, never from the form body.
- **Check permissions on the server.** Hiding a button is not security. Every Server Action and Route Handler
  that changes or returns restricted data must check `isInGroup(user, "<group>")` (or the owner) and return
  403/an error when it fails. In a Route Handler also return 401 when `user.username` is empty.
- Do not invent group names. If a rule needs a group ("only managers approve"), ask which group the person
  means, or leave the rule out and say so. Group names are managed in the company directory, not in code.
- On the person's own computer there is no sign-in: `getUser()` returns a stand-in user `dev`
  (`employeeId: "dev"`, `name: "Dev User"`). That is expected, not a bug. In production it is always the real person.
- **Privacy and safety.** The identity comes from request headers set by the sign-in proxy, so trust it only
  from `getUser()`. Never accept a user id/name from the request body, query string, a cookie or a header you
  read yourself. Never log, print, return or store `user.claims` as a whole, the `Authorization` header or any
  token; never pass them to a Client Component or another service. Show only what the screen needs (a name,
  not the whole claims object). Do not put personal data in URLs.

## 3. The top bar (already in `app/layout.tsx`)

`<UserBar title="..." icon={...} />` is the bar at the top of every page.

- **Left side is yours to set:** `title` = the system's name (in the user's language) and `icon` = a
  [lucide-react](https://lucide.dev) icon, for example
  `<UserBar title="ระบบบันทึกงาน" icon={<ClipboardList className="size-5" />} />`.
  Always set a meaningful `title` for the real app (the template's default is just a placeholder).
- **Right side is built in and must not be changed:** sign-in, profile (name, employee code, email), theme
  (light / dark / follow the computer) and sign out.
- An optional menu: `links={[{ href: "/report", label: "รายงาน" }]}`. Add it only when the app has several pages.
- Do not edit or copy the platform files (see section 7) and do not build a second header, profile menu,
  theme switch or sign-out button.

## 4. Screens and components

- **shadcn is the base. Do not write your own base components** (buttons, inputs, dialogs, menus, tables, tabs,
  selects, tooltips, badges, cards). Use the ones in `components/ui/`: badge, button, card, chart, dialog,
  dropdown-menu, field, input, label, select, separator, skeleton, table, tabs, textarea, tooltip. Open
  `/components` (`app/components/page.tsx`) to see them in use; copy the patterns from there.
- `npx shadcn add ...` does not work here (no internet). If you need a component that is not in `components/ui/`,
  build the screen from the ones that exist, or tell the user it needs the platform team.
- **Colors come from tokens, never hard-coded.** Use `bg-primary`, `text-muted-foreground`, `border`, `bg-card`,
  `text-destructive`, ... (defined in `app/globals.css`, brand yellow/black/red). Never write hex colors or
  `bg-yellow-400`-style palette classes. Both themes must work: use tokens, and add `dark:` only when needed.
- **Tables:** wrap in `<div className="overflow-hidden rounded-lg border">`, header `bg-muted/50`, cells
  `px-4 py-3`, status as `Badge`, numbers `text-right tabular-nums`. The full example is `components/demo/demo-table.tsx`.
- **Forms:** `Label` + `Input`/`Select`/`Textarea`, one column, primary `Button` to save. Validate with `zod`.
- Pages go in `app/<name>/page.tsx`. Keep pages as Server Components and put only the interactive part in a
  small `"use client"` component. Use `lucide-react` for icons, `recharts`/`echarts` for charts, `motion` for animation.
- Write text for people, not developers: short Thai labels, no technical words in the interface.

## 5. Data

- There is **no database by default.** Never invent a `DATABASE_URL`, a password or a host. A shared database is
  created by the platform team (in Coolify) and given to the app as environment variables; if the app needs
  shared data that must survive restarts and be seen by several people, tell the user that this needs a database
  from the platform team, and build the screens so the data layer can be swapped in later
  (`drizzle-orm` + `pg` are installed and ready).
- Until then: personal preferences may use `localStorage` (client) ; demo data may live in a constant. Do not
  write files to disk to "save data": the container's disk is lost on every deploy.
- No secrets in code or in the repository. Configuration comes from environment variables (see `.env.example`).
  `SSO_ISSUER`, `SSO_CLIENT_ID`, `AUTH_URL` are set by the platform; do not hard-code the sign-in addresses.

## 6. Packages

- Everything allowed is already in `package.json` with exact versions and `package-lock.json`. Packages come
  only from the company Nexus; the project's `.npmrc` and `certs/` make that work.
- **Do not `npm install <something>` to add a package, and do not change `.npmrc`, `certs/` or the base image
  (`FROM registry.digitalx.srt/...`) in `Dockerfile`.** If you need a package that is not listed, tell the user
  it needs approval from the platform team and offer a way to do it with what exists.
- Never fetch code, fonts, images or scripts from the internet (CDNs, Google Fonts, `<script src="https://...">`).
  The network is closed: use `lucide-react` icons, system fonts (already set) and files in `public/`.

## 7. Files you must not edit (they belong to the platform)

Listed in `template.json` under `platform`: `AGENTS.md` (this file), `app/globals.css` (the brand and theme colors),
`lib/user.ts`, `components/user-bar.tsx`, `components/profile-menu.tsx`, `components/nav-links.tsx`,
`components/ui/button.tsx`, `components/ui/dropdown-menu.tsx`. They are replaced when the template is updated,
so any change you make there is lost. (Need an extra color or style? Put it in your own component with the
existing tokens, or tell the user it needs a change to the template.) Need different behavior? Build it next to them
(a new component of your own) instead of editing them. Also leave `Dockerfile`, `next.config.ts`, `.npmrc`,
`certs/` and `components.json` alone unless the user asks for a platform change.

## 8. Before you say you are done

1. `npx tsc --noEmit` has no errors; if you can, `npm run build` passes. (If Node 24 is not installed on this
   computer, do not try to install it; say that the platform will build it.)
2. Every new page loads from a Server Component without a runtime error, and any form works with the stand-in `dev` user.
3. The `title` in `<UserBar>` is the real name of the app; permissions are checked on the server.
4. Your final message: two or three short sentences in the user's language: what you built and what they can do
   next. No file names, commands or jargon unless they ask.

## 9. Deploying

Do not run Docker or deploy commands yourself. The tool that publishes the project (Liam's `Liam-deploy_project`, or
the platform's pipeline) saves the work to Git, builds the `Dockerfile` and puts the sign-in in front. The app must keep
listening on port 3000 and `output: "standalone"` in `next.config.ts`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
