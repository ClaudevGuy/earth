import type { FactoryKind, TokenStandard } from "../types";

export type VariableKind = "text" | "number" | "bps" | "percent" | "days" | "bool" | "address" | "amount";

export interface VariableDef {
  key: string;
  label: string;
  kind: VariableKind;
  help?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  max?: number;
  default: string | number | boolean;
}

export interface FactorySpec {
  standard: TokenStandard;
  blurb: string;
  defaultDecimals: number;
  variables: VariableDef[];
  /** Unused. Kept so older local listings do not break. */
  autoPool?: boolean;
}

export type FactoryKindId = FactoryKind;
