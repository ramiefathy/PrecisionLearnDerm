import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderSafeMarkdown(md: string): string {
  const html = marked.parse(md || '') as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
