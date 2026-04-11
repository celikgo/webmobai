import type { BrowserManager } from "../playwright/browser-manager.js";
import { PageAnalyzer } from "../playwright/page-analyzer.js";
import { logger } from "../utils/logger.js";

export function getAccessibilityToolDefinitions() {
  return [
    {
      name: "webmobai_accessibility_audit",
      description:
        "Run a comprehensive accessibility (a11y) audit on the current page. Checks for missing alt text, form labels, color contrast, ARIA attributes, landmarks, and more. Returns issues grouped by severity.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "webmobai_get_accessibility_tree",
      description:
        "Get the full accessibility tree of the current page as seen by screen readers. Shows the hierarchy of roles and accessible names.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ];
}

export async function handleAccessibilityTool(
  name: string,
  _args: Record<string, unknown>,
  browserManager: BrowserManager,
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    const page = browserManager.page;
    const analyzer = new PageAnalyzer(page);

    switch (name) {
      case "webmobai_accessibility_audit": {
        const issues = await analyzer.runAccessibilityAudit();

        if (issues.length === 0) {
          return text(
            "# Accessibility Audit Results\n\nNo accessibility issues found. The page passes all basic checks.\n\nNote: This is a lightweight audit. For production use, also run full axe-core or Lighthouse audits.",
          );
        }

        const critical = issues.filter((i) => i.impact === "critical");
        const serious = issues.filter((i) => i.impact === "serious");
        const moderate = issues.filter((i) => i.impact === "moderate");
        const minor = issues.filter((i) => i.impact === "minor");

        let result = `# Accessibility Audit Results\n\n`;
        result += `Found ${issues.length} issues: ${critical.length} critical, ${serious.length} serious, ${moderate.length} moderate, ${minor.length} minor\n`;

        for (const [label, group] of [
          ["Critical", critical],
          ["Serious", serious],
          ["Moderate", moderate],
          ["Minor", minor],
        ] as const) {
          if (group.length > 0) {
            result += `\n## ${label} Issues (${group.length})\n`;
            for (const issue of group) {
              result += `\n### ${issue.rule}\n`;
              result += `${issue.description}\n`;
              result += `Help: ${issue.helpUrl}\n`;
              if (issue.nodes.length > 0) {
                result += `Affected elements:\n`;
                for (const node of issue.nodes.slice(0, 5)) {
                  result += `  ${node}\n`;
                }
              }
            }
          }
        }

        return text(result);
      }

      case "webmobai_get_accessibility_tree": {
        const tree = await analyzer.getAccessibilityTree();
        return text(`# Accessibility Tree\n\n${tree}`);
      }

      default:
        return text(`Unknown accessibility tool: ${name}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Accessibility tool error (${name}): ${msg}`);
    return text(`Error executing ${name}: ${msg}`);
  }
}

function text(message: string) {
  return { content: [{ type: "text" as const, text: message }] };
}
