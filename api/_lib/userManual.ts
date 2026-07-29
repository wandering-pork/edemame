import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Root of the user manual content, relative to the project root (repo root).
// Vercel sets process.cwd() to the project root for Node serverless functions.
const MANUAL_DIR = join(process.cwd(), "docs", "user-manual");

// Keep the manual well within Gemini's context budget even as the team adds pages.
const MAX_CONTEXT_CHARS = 60_000;

// Serverless containers stay warm between invocations — read the filesystem once
// per warm instance instead of on every chat request.
let cachedContext: string | null = null;

function collectMarkdownFiles(dir: string): string[] {
  let entries: import("fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Folder missing (e.g. not yet created, or not bundled) — fail gracefully.
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function buildManualContext(): string {
  const files = collectMarkdownFiles(MANUAL_DIR).sort();
  if (files.length === 0) return "";

  const sections: string[] = [];
  let totalChars = 0;

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8").trim();
    } catch {
      continue;
    }
    if (!content) continue;

    const relativePath = filePath.slice(MANUAL_DIR.length + 1).replace(/\\/g, "/");
    const section = `--- Manual page: ${relativePath} ---\n${content}`;

    if (totalChars + section.length > MAX_CONTEXT_CHARS) {
      console.warn(
        `[userManual] Truncating manual context at ${relativePath} — exceeded ${MAX_CONTEXT_CHARS} char budget.`
      );
      break;
    }

    sections.push(section);
    totalChars += section.length;
  }

  return sections.join("\n\n");
}

/**
 * Returns the concatenated contents of every markdown page under docs/user-manual,
 * for injection into the Case Manager agent's system prompt. Returns '' if the
 * folder is missing or empty so callers can omit the section entirely.
 */
export function getUserManualContext(): string {
  if (cachedContext === null) {
    cachedContext = buildManualContext();
  }
  return cachedContext;
}
