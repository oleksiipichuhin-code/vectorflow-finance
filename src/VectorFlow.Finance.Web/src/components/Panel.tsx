import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  headingId: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Panel({ title, headingId, actions, children }: PanelProps) {
  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="panel-header">
        <h2 id={headingId}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

type StatusMessageProps = {
  children: ReactNode;
  tone?: "default" | "error" | "success";
};

export function StatusMessage({ children, tone = "default" }: StatusMessageProps) {
  const className =
    tone === "error" ? "state state-error" : tone === "success" ? "state state-success" : "state";

  return <p className={className}>{children}</p>;
}
