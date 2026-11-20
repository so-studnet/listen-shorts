import { tokenize, type Span, type Token } from "@/lib/domain/text";

type Props = {
  text: string;
  span: Span | null;
  /** 空欄にするか（false なら強調表示） */
  blank: boolean;
};

const join = (tokens: Token[]) =>
  tokens.map((t) => t.pre + t.core + t.post).join(" ");

/** 文を表示する。span の部分を空欄にするか、ひと続きで強調する。 */
export function SentenceView({ text, span, blank }: Props) {
  const tokens = tokenize(text);
  if (!span) return <p className="text-lg leading-relaxed">{text}</p>;

  const before = tokens.slice(0, span.start);
  const inside = tokens.slice(span.start, span.end);
  const after = tokens.slice(span.end);
  const first = inside[0];
  const last = inside[inside.length - 1];
  // 空欄・強調の外に出す記号（語の前の引用符、最後の語の句読点）
  const pre = first.pre;
  const post = last.post;
  const core = inside
    .map((t, i) =>
      (i === 0 ? "" : t.pre) + t.core + (i === inside.length - 1 ? "" : t.post),
    )
    .join(" ");

  return (
    <p className="text-lg leading-relaxed">
      {before.length > 0 && join(before) + " "}
      {pre}
      {blank ? (
        inside.map((_, i) => (
          <span key={i}>
            {i > 0 && " "}
            <span
              aria-label="空欄"
              className="inline-block w-16 border-b-2 border-current align-baseline"
            >
              &nbsp;
            </span>
          </span>
        ))
      ) : (
        <mark className="rounded bg-sky-200 px-0.5 text-inherit dark:bg-sky-800">
          {core}
        </mark>
      )}
      {post}
      {after.length > 0 && " " + join(after)}
    </p>
  );
}
