import type { FactorySpec, VariableDef } from "../standards/types";

export function MintVariables({
  factory,
  values,
  onChange,
}: {
  factory: FactorySpec;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="var-grid">
      {factory.variables.map((field) => (
        <VariableField key={field.key} field={field} value={values[field.key] ?? ""} onChange={onChange} />
      ))}
    </div>
  );
}

function VariableField({
  field,
  value,
  onChange,
}: {
  field: VariableDef;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  if (field.kind === "bool") {
    return (
      <label className="check-row var-span">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(field.key, e.target.checked ? "true" : "false")}
        />
        <span>
          {field.label}
          {field.help ? <span className="var-help">{field.help}</span> : null}
        </span>
      </label>
    );
  }

  if (field.kind === "text") {
    return (
      <label className="var-span">
        {field.label}
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
        />
        {field.help ? <span className="var-help">{field.help}</span> : null}
      </label>
    );
  }

  return (
    <label className={field.kind === "address" || field.kind === "amount" ? "var-span" : undefined}>
      {field.label}
      <input
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        inputMode={field.kind === "address" ? "text" : "decimal"}
      />
      {field.help ? <span className="var-help">{field.help}</span> : null}
    </label>
  );
}
