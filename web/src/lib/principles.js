export const LIMITS = { chars: 500 };

const BULLET = /^\s*[-*]\s+/;

export function blocks(body) {
  const result = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^(#+)\s+(.*)$/);
    if (heading) result.push({ type: "heading", level: heading[1].length, text: heading[2] });
    else if (BULLET.test(raw)) {
      const text = line.replace(BULLET, "");
      const last = result[result.length - 1];
      if (last?.type === "list") last.items.push(text);
      else result.push({ type: "list", items: [text] });
    } else result.push({ type: "paragraph", text: line });
  }
  return result;
}

const MARKS = /\*\*(.+?)\*\*|==(.+?)==|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_LINK = /^(#watch\?|https:\/\/)/;

export function inline(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(MARKS)) {
    if (match.index > last) nodes.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) nodes.push({ bold: true, children: inline(match[1]) });
    else if (match[2] !== undefined) nodes.push({ mark: true, children: inline(match[2]) });
    else if (SAFE_LINK.test(match[4])) nodes.push({ href: match[4], children: inline(match[3]) });
    else nodes.push({ text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ text: text.slice(last) });
  return nodes;
}
