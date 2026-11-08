import { html, nothing, type TemplateResult } from "lit";

/**
 * A small Markdown subset for AI answers, rendered as Lit templates: text is
 * always inserted as text, never as HTML, so an answer cannot inject markup.
 * Supported: paragraphs, line breaks, headings (#, ##, ###), lists (- * 1.),
 * **bold**, *italic* / _italic_, `code` and [links](https://…) (http/https only).
 */

type Inline = string | TemplateResult;

const INLINE =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/;

function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function inline(text: string): Inline[] {
  const parts: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      parts.push(rest);
      break;
    }
    if (match.index > 0) parts.push(rest.slice(0, match.index));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(html`<strong>${inline(token.slice(2, -2))}</strong>`);
    } else if (token.startsWith("`")) {
      parts.push(html`<code>${token.slice(1, -1)}</code>`);
    } else if (token.startsWith("[")) {
      const [, label = "", url = ""] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? [];
      const href = safeUrl(url);
      parts.push(
        href
          ? html`<a href=${href} target="_blank" rel="noopener noreferrer">${inline(label)}</a>`
          : label,
      );
    } else {
      parts.push(html`<em>${inline(token.slice(1, -1))}</em>`);
    }
    rest = rest.slice(match.index + token.length);
  }
  return parts;
}

function lines(block: string[]): Inline[] {
  return block.flatMap((line, i) => (i ? [html`<br />`, ...inline(line)] : inline(line)));
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

/** Markdown to templates; unknown syntax stays visible as plain text. */
export function renderMarkdown(text: string): TemplateResult {
  const blocks: TemplateResult[] = [];
  const source = text.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push(html`<p>${lines(paragraph)}</p>`);
    paragraph = [];
    if (list) {
      const items = list.items.map((item) => html`<li>${inline(item)}</li>`);
      blocks.push(
        list.ordered
          ? html`<ol>
              ${items}
            </ol>`
          : html`<ul>
              ${items}
            </ul>`,
      );
    }
    list = null;
  };

  for (const raw of source) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push(html`<h4>${inline(heading[2] ?? "")}</h4>`);
    } else if (bullet || numbered) {
      const ordered = !bullet;
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)?.[1] ?? "");
    } else if (list && /^\s{2,}/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`; // continued list item
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks.length ? html`${blocks}` : html`${nothing}`;
}
