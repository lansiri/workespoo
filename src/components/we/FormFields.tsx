import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

/**
 * Field wrapper: label above, hint below, error below the hint (danger border + message).
 * Pass the control as `children` through a render function so it receives the ids it needs.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("we-field", className)}>
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <span id={hintId} className="we-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className="we-err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx("we-input", className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cx("we-textarea", className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cx("we-select", className)} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
}

/**
 * Radio or checkbox card. Consent controls always start unchecked: pass `checked` only from a real choice.
 * Checked: pine border and pine-50 fill. Disabled: 60 % opacity.
 */
export function ChoiceCard({
  type = "checkbox",
  title,
  help,
  className,
  ...rest
}: { type?: "checkbox" | "radio"; title: string; help?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "title">) {
  return (
    <label className={cx("we-choice", className)}>
      <input type={type} {...rest} />
      <span className="we-choice-text">
        <b>{title}</b>
        {help ? <span>{help}</span> : null}
      </span>
    </label>
  );
}

/** A single checkbox with a label, for consent. Starts unchecked unless the caller says otherwise. */
export function Checkbox({ label, help, className, ...rest }: { label: string; help?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return <ChoiceCard type="checkbox" title={label} help={help} className={className} {...rest} />;
}
