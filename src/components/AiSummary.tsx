import { Sparkles } from "lucide-react";

// Tiny markdown renderer for the AI summary. Matches the renderer in
// mcp-server/src/utils/report-generator.ts so the desktop view and the HTML
// report look consistent. Supports the subset Claude is asked to emit:
//   ## heading
//   - bullet
//   **bold**, *italic*, plain paragraph.
function renderInline(s: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold** first, then *italic* (single-asterisk, not part of bold).
  const regex = /\*\*(.+?)\*\*|(?<!\*)\*([^*]+?)\*(?!\*)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(s)) !== null) {
    if (m.index > lastIndex) parts.push(s.slice(lastIndex, m.index));
    if (m[1] !== undefined) {
      parts.push(<strong key={`b-${i++}`}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      parts.push(
        <em key={`i-${i++}`} className="not-italic text-primary/80">
          {m[2]}
        </em>,
      );
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < s.length) parts.push(s.slice(lastIndex));
  return parts;
}

function renderMarkdown(md: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = md.split(/\r?\n/);
  let listBuf: string[] = [];
  let key = 0;
  const flushList = () => {
    if (listBuf.length === 0) return;
    nodes.push(
      <ul
        key={`ul-${key++}`}
        className="list-disc pl-5 space-y-1 my-2 text-sm text-foreground/90"
      >
        {listBuf.map((item, idx) => (
          <li key={idx}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{2,3})\s+(.+)$/);
    if (heading) {
      flushList();
      nodes.push(
        <h4
          key={`h-${key++}`}
          className="text-sm font-semibold text-primary mt-3 first:mt-0 mb-1"
        >
          {renderInline(heading[2] ?? "")}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuf.push(line.slice(2));
      continue;
    }
    flushList();
    nodes.push(
      <p key={`p-${key++}`} className="text-sm text-foreground/90 leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return nodes;
}

interface AiSummaryProps {
  summary: string;
}

export function AiSummary({ summary }: AiSummaryProps) {
  return (
    <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-4">
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-semibold mb-2">
        <Sparkles className="w-3 h-3" />
        Claude summary
      </div>
      <div className="space-y-1">{renderMarkdown(summary)}</div>
    </div>
  );
}
