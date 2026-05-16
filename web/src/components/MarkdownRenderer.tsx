"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  className?: string;
};

export function MarkdownRenderer({ content, className = "" }: Props) {
  return (
    <div className={`md-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              className="text-[#000000] font-serif mt-12 mb-5 first:mt-0 pb-4 border-b border-[#cfdaf5]"
              style={{ fontSize: 40, lineHeight: 1.2, letterSpacing: "-0.02em" }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className="text-[#000000] font-serif mt-10 mb-4"
              style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: "-0.02em" }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className="text-[#000000] font-serif mt-8 mb-3"
              style={{ fontSize: 24, lineHeight: 1.2, letterSpacing: "-0.02em" }}
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4
              className="text-[#000000] font-serif mt-6 mb-2"
              style={{ fontSize: 20, lineHeight: 1.2, letterSpacing: "-0.02em" }}
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-[#4e4d4d] font-mono text-[16px] leading-[1.35] tracking-[-0.02em] mb-5">
              {children}
            </p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-[#000000] underline underline-offset-4 decoration-[#cfdaf5] hover:decoration-[#000000] transition-colors"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-5 space-y-2 pl-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-5 space-y-2 pl-0 list-none">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-[#4e4d4d] font-mono text-[16px] leading-[1.35] tracking-[-0.02em] flex gap-3 items-start">
              <span className="mt-2.5 w-1 h-1 rounded-full bg-[#242424] shrink-0" />
              <span>{children}</span>
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#242424] pl-5 my-6 text-[#4e4d4d] italic">
              {children}
            </blockquote>
          ),
          code: ({ className: cls, children }) => {
            const isBlock = cls?.includes("language-");
            if (isBlock) {
              return (
                <pre className="bg-[#f6f3f1] border border-[#cfdaf5] rounded-[20px] p-5 overflow-x-auto my-6">
                  <code className="text-[#000000] font-mono text-[14px] leading-relaxed">
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code className="bg-[#cfdaf5] text-[#000000] font-mono text-[14px] px-1.5 py-0.5 rounded">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-6">
              <table className="w-full border-collapse text-[14px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-[#242424]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="text-left text-[#000000] font-mono text-[12px] tracking-[0.05em] uppercase px-4 py-3">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="text-[#4e4d4d] font-mono text-[14px] tracking-[-0.014em] px-4 py-3 border-b border-[#cfdaf5]">
              {children}
            </td>
          ),
          hr: () => <hr className="border-0 border-t border-[#cfdaf5] my-10" />,
          strong: ({ children }) => (
            <strong className="text-[#000000] font-medium">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-[#4e4d4d] italic">{children}</em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
