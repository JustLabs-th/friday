import type { MouseEvent } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowUpRightIcon, GlobeIcon } from 'lucide-react';
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';

export interface Source {
  url: string;
  title?: string;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// A desktop webview does not open target="_blank" links, so hand them to the system browser.
export function openExternally(event: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!isTauri) return;
  event.preventDefault();
  void openUrl(url);
}

export function Sources({ sources }: { sources: Source[] }) {
  // Count unique pages only.
  const unique = sources.filter((source, index) => sources.findIndex(other => other.url === source.url) === index);
  if (unique.length === 0) return null;

  return (
    <Trace>
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon><GlobeIcon aria-hidden="true" /></TraceIcon>
            <TraceTitle>Used {unique.length} {unique.length === 1 ? 'source' : 'sources'}</TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <Trace>
            {unique.map(source => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                onClick={event => openExternally(event, source.url)}
                className="rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <TraceLine>
                  <TraceIcon><GlobeIcon aria-hidden="true" /></TraceIcon>
                  <TraceTitle>
                    {source.title ?? hostname(source.url)}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </TraceTitle>
                  <TraceIcon><ArrowUpRightIcon aria-hidden="true" className="rtl:-scale-x-100" /></TraceIcon>
                </TraceLine>
              </a>
            ))}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  );
}
