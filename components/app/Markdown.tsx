'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

/** Markdown for bot messages: GFM + code highlight, compact chat styling. */
export default function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words text-navy prose-p:my-1 prose-p:leading-relaxed prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:rounded prose-code:bg-ice prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:my-2 prose-pre:rounded-xl prose-pre:bg-navy prose-pre:text-[13px] prose-a:font-semibold prose-a:text-cta prose-strong:text-navy prose-headings:my-2 prose-headings:text-navy">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
