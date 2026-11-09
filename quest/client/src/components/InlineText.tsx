import type { ReactNode } from "react";
import { githubBlob } from "../pages/fetch";
import { usePagePanel } from "../pages/PagePanel";

export const CODE =
  "rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-code font-normal tracking-normal";

// One span at a time: `code`, **bold** or [text](url). Everything else is
// text, so the Guide's words reach the page as text nodes, never as HTML.
const SPAN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
// A repository page, such as `beginner/02-first-session.md#why`: a plain
// click opens it in the page panel. Anything with a scheme, a leading slash
// or a ./ or ../ start does not: the panel takes paths from the repository
// root. The app serves no page at that path, so the link's own href is the
// page on GitHub at main, as the compile step's other repository links are
// (resolveLink in quest/engine): a new tab, a middle click or a click with a
// modifier key goes there (263).
const PAGE = /^(?![a-z][a-z0-9+.-]*:)(?!\/)(?!\.\.?\/)([^#]+\.md)(?:#(.+))?$/i;

// A link's or a bold span's words may hold code, as in [`tdd` skill](url)
// (d264-i1, i-6) or **Yes, and don't ask again for `<name>`** (d265-a3).
const labelOf = (label: string) =>
  label.split(/(`[^`]+`)/).map((part, i): ReactNode =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={i} className={CODE}>
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );

/** Text with the Guide's inline marks: `code`, **bold** and [links](url). */
export function InlineText({ text }: { text: string }) {
  const { open } = usePagePanel();
  return text.split(SPAN).map((part, i): ReactNode => {
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className={CODE}>
          {part.slice(1, -1)}
        </code>
      );
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{labelOf(part.slice(2, -2))}</strong>;
    const link = LINK.exec(part);
    if (link) {
      const [, label = "", href = ""] = link;
      const page = PAGE.exec(href);
      if (page) {
        const [, path = "", fragment] = page;
        return (
          <a
            key={i}
            href={`${githubBlob("main", path)}${fragment === undefined ? "" : `#${fragment}`}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              open(path, fragment);
            }}
          >
            {labelOf(label)}
          </a>
        );
      }
      // Only a web link leaves the page: any other scheme stays text.
      if (!/^https?:\/\//i.test(href))
        return <span key={i}>{labelOf(label)}</span>;
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer">
          {labelOf(label)}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
