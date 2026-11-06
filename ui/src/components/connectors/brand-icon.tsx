import type { ReactNode } from 'react';
import {
  siAtlassian,
  siConfluence,
  siDocker,
  siFigma,
  siGitea,
  siGithub,
  siGitlab,
  siGoogledrive,
  siJira,
  siLinear,
  siNotion,
  siPostgresql,
  siSentry,
  siStripe,
  siSupabase,
  type SimpleIcon,
} from 'simple-icons';

const brands: Record<string, SimpleIcon> = {
  atlassian: siAtlassian,
  confluence: siConfluence,
  docker: siDocker,
  figma: siFigma,
  gitea: siGitea,
  github: siGithub,
  gitlab: siGitlab,
  googledrive: siGoogledrive,
  jira: siJira,
  linear: siLinear,
  notion: siNotion,
  postgres: siPostgresql,
  postgresql: siPostgresql,
  sentry: siSentry,
  stripe: siStripe,
  supabase: siSupabase,
};

/** The brand whose name appears in `name` (for example an MCP server called "github"), if we have its logo. */
export function brandFor(name: string): SimpleIcon | undefined {
  const lower = name.toLowerCase();
  const key = Object.keys(brands).find(brand => lower.includes(brand));
  return key ? brands[key] : undefined;
}

/** A brand logo in its own colour, or `fallback` when the brand is unknown. */
export function BrandIcon({ brand, fallback }: { brand?: SimpleIcon; fallback: ReactNode }) {
  if (!brand) return <>{fallback}</>;
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={brand.title} className="size-6" fill={`#${brand.hex}`}>
      <path d={brand.path} />
    </svg>
  );
}

/** A logo from a URL (an app's own artwork), falling back to `fallback` if it is missing or fails to load. */
export function LogoImage({ url, name, fallback }: { url?: string; name: string; fallback: ReactNode }) {
  if (!url) return <>{fallback}</>;
  return <img src={url} alt={name} className="size-7 rounded object-contain" loading="lazy" />;
}
