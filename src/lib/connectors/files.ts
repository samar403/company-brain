import "server-only";
import type { IncomingDoc } from "../types";
import { emailsToDocs, htmlToText, parseEml, parseMbox } from "./email";
import { parseSlackExport } from "./slack";

/** Routes an uploaded file to the right parser by extension. */
export async function parseUpload(
  file: File,
): Promise<{ kind: "slack" | "email" | "upload"; docs: IncomingDoc[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) {
    return { kind: "slack", docs: await parseSlackExport(await file.arrayBuffer()) };
  }
  if (name.endsWith(".eml")) {
    return { kind: "email", docs: emailsToDocs([await parseEml(await file.arrayBuffer())]) };
  }
  if (name.endsWith(".mbox")) {
    return { kind: "email", docs: emailsToDocs(await parseMbox(await file.text())) };
  }
  const supported = [".md", ".markdown", ".txt", ".csv", ".json", ".html", ".htm"];
  if (!supported.some((ext) => name.endsWith(ext))) {
    throw new Error(`Unsupported file type: ${file.name}. Use .md, .txt, .csv, .json, .html, .eml, .mbox or a Slack export .zip.`);
  }
  let text = await file.text();
  if (name.endsWith(".html") || name.endsWith(".htm")) text = htmlToText(text);
  if (name.endsWith(".json")) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // keep raw text
    }
  }
  const title = text.match(/^#\s+(.+)$/m)?.[1] ?? file.name.replace(/\.[^.]+$/, "");
  return {
    kind: "upload",
    docs: [
      {
        externalId: `file:${file.name}`,
        kind: "file",
        title,
        content: text,
        occurredAt: new Date(file.lastModified || Date.now()).toISOString(),
      },
    ],
  };
}
