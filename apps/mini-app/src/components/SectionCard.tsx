import type { PropsWithChildren, ReactNode } from "react";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  aside?: ReactNode;
}

export const SectionCard = ({
  title,
  eyebrow,
  aside,
  children
}: SectionCardProps) => (
  <section className="section-card">
    <div className="section-card__head">
      <div>
        {eyebrow ? <p className="section-card__eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {aside ? <div>{aside}</div> : null}
    </div>
    {children}
  </section>
);
