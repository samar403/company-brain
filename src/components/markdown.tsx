import { Marked } from "marked";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Raw HTML in knowledge or model output is shown as text, never rendered.
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, text }) {
      const safe = /^(https?:|mailto:|\/|#)/i.test(href) ? href : "#";
      const external = /^https?:/i.test(safe);
      return `<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    },
  },
});

/** Renders Markdown and turns [E12] / [D7] citations into links. */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  const html = (md.parse(children ?? "", { async: false }) as string)
    .replace(/\[E(\d+)\]/g, '<a class="cite" href="/knowledge/$1" title="Knowledge entry E$1">E$1</a>')
    .replace(/\[D(\d+)\]/g, '<a class="cite" href="/library/$1" title="Source document D$1">D$1</a>')
    .replace(/«([^»]*)»/g, '<mark class="marker">$1</mark>');
  return <div className={`prose-brain ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
