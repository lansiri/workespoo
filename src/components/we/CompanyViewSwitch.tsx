"use client";

import { cx } from "./cx";
import { Icon } from "./icons";

/**
 * "My view" | "What companies see": segmented control, equal-width buttons that wrap. role="group" with aria-pressed.
 * Icons hide on phones so long Finnish labels fit.
 */
export function CompanyViewSwitch({
  value,
  onChange,
  groupLabel,
  personLabel,
  companyLabel,
  className,
}: {
  value: "person" | "company";
  onChange: (v: "person" | "company") => void;
  groupLabel: string;
  personLabel: string;
  companyLabel: string;
  className?: string;
}) {
  return (
    <div className={cx("we-seg", className)} role="group" aria-label={groupLabel}>
      <button type="button" aria-pressed={value === "person"} onClick={() => onChange("person")} data-testid="view-person">
        <Icon name="person" />
        <span>{personLabel}</span>
      </button>
      <button type="button" aria-pressed={value === "company"} onClick={() => onChange("company")} data-testid="view-company">
        <Icon name="building" />
        <span>{companyLabel}</span>
      </button>
    </div>
  );
}
