import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./ArticleMarkdown.module.css";

/**
 * Renders an article body written in Markdown.
 *
 * Members write articles, so the body is untrusted. react-markdown never
 * renders raw HTML (`<script>` and friends come out as text) and its default
 * URL transform drops javascript:, data: and other unsafe link targets.
 *
 * The page title is the only h1, so Markdown headings move down one level.
 */
const shift = (level: 2 | 3 | 4 | 5 | 6) => {
  const Heading = `h${level}` as const;
  return function ShiftedHeading({ children }: { children?: React.ReactNode }) {
    return <Heading>{children}</Heading>;
  };
};

const components: Components = {
  h1: shift(2),
  h2: shift(3),
  h3: shift(4),
  h4: shift(5),
  h5: shift(6),
  h6: shift(6),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
  ),
  // eslint-disable-next-line @next/next/no-img-element -- authors link images from anywhere; next/image needs every host configured.
  img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />,
  table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
};

export default function ArticleMarkdown({ content }: { content: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
    </div>
  );
}
