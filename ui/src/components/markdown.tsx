import { isValidElement, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { MarkdownChart, parseChartSpec } from '@/components/markdown-chart';
import { openExternally } from '@/components/sources';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function CodeBlock({ language, children }: { language: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(textOf(children).replace(/\n$/, ''));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; nothing useful to do then.
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="font-mono text-xs text-muted-foreground">{language || 'text'}</span>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={copied ? 'Copied' : 'Copy code'} title="Copy code" onClick={() => void copy()}>
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">{children}</pre>
    </div>
  );
}

const components: Components = {
  // A fenced block arrives as <pre><code class="language-x">. A `chart` block becomes a chart.
  pre({ children }) {
    const code = (Array.isArray(children) ? children[0] : children) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
    const className = isValidElement(code) ? code.props.className ?? '' : '';
    const language = /language-([\w+-]+)/.exec(className)?.[1] ?? '';
    const inner = isValidElement(code) ? code.props.children : children;
    if (language === 'chart') {
      const spec = parseChartSpec(textOf(inner));
      if (spec) return <MarkdownChart spec={spec} />;
    }
    return <CodeBlock language={language}>{inner}</CodeBlock>;
  },
  code({ className, children, ...props }) {
    // Inline code only; fenced code is handled by `pre` above.
    return <code className={className ?? 'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'} {...props}>{children}</code>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" onClick={event => href && openExternally(event, href)} className="text-primary underline underline-offset-2 hover:opacity-80">
        {children}
      </a>
    );
  },
  table({ children }) {
    return <div className="my-3 overflow-x-auto rounded-lg border"><Table>{children}</Table></div>;
  },
  thead: ({ children }) => <TableHeader>{children}</TableHeader>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ children, style }) => <TableHead style={style}>{children}</TableHead>,
  td: ({ children, style }) => <TableCell style={style}>{children}</TableCell>,
  h1: ({ children }) => <h2 className="mt-5 mb-2 text-xl font-semibold tracking-tight">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-5 mb-2 text-lg font-semibold tracking-tight">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-4 mb-1.5 text-base font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-3 mb-1 text-sm font-semibold">{children}</h5>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children, className }) => <ul className={`my-2 list-disc space-y-1 pl-6 ${className?.includes('contains-task-list') ? 'list-none pl-1' : ''}`}>{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 pl-4 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-4" />,
  input: props => <input {...(props as ComponentProps<'input'>)} className="mr-2 align-middle" />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
