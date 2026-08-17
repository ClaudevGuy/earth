import { useEffect, useState } from "react";
import type { Page } from "../types";
import { DOCS, type DocsBlock } from "../docs/guide.ts";

export function DocsView({ onOpen, chapter }: { onOpen: (page: Page) => void; chapter?: string }) {
  const resolved = chapter === "swap" ? "dex" : chapter;
  const [active, setActive] = useState(resolved ?? DOCS[0]!.id);

  useEffect(() => {
    if (!resolved) return;
    setActive(resolved);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`docs-${resolved}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resolved]);

  function jump(id: string) {
    setActive(id);
    document.getElementById(`docs-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="docs-layout">
      <aside className="panel pad docs-toc">
        <div className="panel-head">
          <span>Guide</span>
        </div>
        <nav className="docs-toc-list">
          {DOCS.map((chapter) => (
            <button
              key={chapter.id}
              type="button"
              className={chapter.id === active ? "active" : ""}
              onClick={() => jump(chapter.id)}
            >
              {chapter.title}
            </button>
          ))}
        </nav>
      </aside>
      <article className="panel pad docs-article">
        {DOCS.map((chapter) => (
          <section key={chapter.id} id={`docs-${chapter.id}`} className="docs-chapter">
            <p className="kicker">{chapter.id}</p>
            <h3>{chapter.title}</h3>
            <p className="lede">{chapter.blurb}</p>
            {chapter.blocks.map((block, i) => (
              <DocsBlockView key={`${chapter.id}-${i}`} block={block} onOpen={onOpen} />
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}

function DocsBlockView({ block, onOpen }: { block: DocsBlock; onOpen: (page: Page) => void }) {
  if (block.type === "p") return <p>{block.text}</p>;
  if (block.type === "h3") return <h4>{block.text}</h4>;
  if (block.type === "ul") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "callout") {
    return <p className={`notice${block.kind === "warn" ? " alert" : ""}`}>{block.text}</p>;
  }
  if (block.type === "action") {
    return (
      <div className="row-actions" style={{ marginTop: 4 }}>
        <button type="button" className="primary" onClick={() => onOpen(block.page)}>
          {block.label}
        </button>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table docs-table">
        <thead>
          <tr>
            {block.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={`${block.headers[i]}-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
