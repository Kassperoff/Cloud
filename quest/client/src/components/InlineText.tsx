import type { ReactNode } from "react";
import { githubBlob } from "../pages/fetch";
import { usePagePanel } from "../pages/PagePanel";

// Spaces inside code show as written, so ` *` keeps its space even after a
// space in the text before it (d265-a7).
export const CODE =
  "rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-code font-normal tracking-normal whitespace-break-spaces";

/**
 * A code span's words as CommonMark reads them: one space comes off each end
 * only when both ends have one and the words are not all spaces.
 */
export const codeSpan = (inner: string): string =>
  inner.startsWith(" ") && inner.endsWith(" ") && inner.trim() !== ""
    ? inner.slice(1, -1)
    : inner;

// A code span opens and closes with backtick runs of one length, as in
// CommonMark, so ``a `b` c`` is code that holds backticks (b-5's FAIL line).
const TICKS = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/.source;
const CODE_SPAN = new RegExp(TICKS, "g");
const CODE_WORDS = /^(`+)([\s\S]*)\1$/;
// One span at a time: `code`, **bold** or [text](url). Everything else is
// text, so the Guide's words reach the page as text nodes, never as HTML.
const SPAN = new RegExp(
  `${TICKS}|\\*\\*[^*]+\\*\\*|\\[[^\\]]+\\]\\([^)\\s]+\\)`,
  "g",
);

/** The text cut at each span: text, span, text, ..., text. */
const piecesOf = (text: string, span: RegExp): string[] => {
  const pieces: string[] = [];
  let at = 0;
  for (const match of text.matchAll(span)) {
    pieces.push(text.slice(at, match.index), match[0]);
    at = match.index + match[0].length;
  }
  pieces.push(text.slice(at));
  return pieces;
};

/** A code span's words, or null when the piece is no code span. */
const codeOf = (piece: string): string | null => {
  const words = CODE_WORDS.exec(piece)?.[2];
  return words === undefined ? null : codeSpan(words);
};
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
  piecesOf(label, CODE_SPAN).map((part, i): ReactNode => {
    const code = i % 2 === 1 ? codeOf(part) : null;
    return code === null ? (
      part
    ) : (
      <code key={i} className={CODE}>
        {code}
      </code>
    );
  });

/** Text with the Guide's inline marks: `code`, **bold** and [links](url). */
export function InlineText({ text }: { text: string }) {
  const { open } = usePagePanel();
  return piecesOf(text, SPAN).map((part, i): ReactNode => {
    if (i % 2 === 0) return <span key={i}>{part}</span>;
    const code = codeOf(part);
    if (code !== null)
      return (
        <code key={i} className={CODE}>
          {code}
        </code>
      );
    if (part.startsWith("**"))
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
