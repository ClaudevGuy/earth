import type { StandardSourceCode } from "../types";

export function SourceCodeView({
  source,
  empty,
}: {
  source?: StandardSourceCode;
  empty?: string;
}) {
  if (!source?.code.trim()) {
    return empty ? <p className="notice">{empty}</p> : null;
  }

  return (
    <div className="source-view">
      <div className="source-view-head">
        <span className="mono">{source.filename}</span>
        <span className="pill">public source</span>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(source.code);
          }}
        >
          Copy
        </button>
      </div>
      <pre>
        <code>{source.code}</code>
      </pre>
    </div>
  );
}
