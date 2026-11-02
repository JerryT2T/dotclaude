#!/usr/bin/env bash
set -e
git init -q . 2>/dev/null || true
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
# A small single-tenant app across three domains (DB, auth, UI), so the prompt
# asks for real cross-domain work. An empty repo made the model answer
# "blocked: nothing to build on" instead of weighing the ceremony offer.
mkdir -p db/migrations src/auth src/api src/ui
cat > package.json <<'JSON'
{ "name": "projects-app", "private": true, "type": "module",
  "scripts": { "dev": "vite", "migrate": "node db/migrate.js", "test": "vitest run" },
  "dependencies": { "express": "^4.21.0", "pg": "^8.13.0", "react": "^18.3.1", "jsonwebtoken": "^9.0.2" } }
JSON
cat > db/migrations/001_init.sql <<'SQL'
CREATE TABLE users (id serial PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL);
CREATE TABLE projects (id serial PRIMARY KEY, owner_id int REFERENCES users(id), name text NOT NULL);
SQL
cat > src/auth/session.js <<'JS'
import jwt from "jsonwebtoken";
export function issueToken(user) { return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "8h" }); }
export function requireUser(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), process.env.JWT_SECRET); next(); }
  catch { res.status(401).end(); }
}
JS
cat > src/api/projects.js <<'JS'
import { Router } from "express";
import { requireUser } from "../auth/session.js";
export const projects = Router();
projects.get("/", requireUser, async (req, res) => {
  const { rows } = await req.db.query("SELECT id, name FROM projects WHERE owner_id = $1", [req.user.sub]);
  res.json(rows);
});
JS
cat > src/ui/App.jsx <<'JSX'
import { useEffect, useState } from "react";
export function App({ token }) {
  const [projects, setProjects] = useState([]);
  useEffect(() => { fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).then(setProjects); }, [token]);
  return <main><h1>Projects</h1><ul>{projects.map((p) => <li key={p.id}>{p.name}</li>)}</ul></main>;
}
JSX
git add -A && git -c user.email=eval@local -c user.name=eval commit -qm fixtures
