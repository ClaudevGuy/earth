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
  /** Launch curve mints seed an Earth pool from virtual reserves. */
  autoPool?: boolean;
}

export type FactoryKindId = FactoryKind;
