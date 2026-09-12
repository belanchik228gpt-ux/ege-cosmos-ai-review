import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export function TutorMarkdown({ text }: { text: string }) {
  const normalized = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => '\n$$\n' + m + '\n$$\n')
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
  return (
    <div className="tutor-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { trust: false, throwOnError: false, strict: 'ignore', maxExpand: 1000 }],
        ]}
        components={{
          img: () => null,
          a: ({ href, children }) => (
            <a
              href={/^https:\/\//.test(href ?? '') ? href : undefined}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {normalized}
      </Markdown>
    </div>
  );
}
