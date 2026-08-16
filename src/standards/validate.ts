import type { TokenMintConfig } from "../types";
import { findFactory } from "./factories";
import type { FactorySpec, VariableDef } from "./types";

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function num(raw: string, field: VariableDef): number {
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) throw new Error(`${field.label} must be a number.`);
  if (field.min != null && value < field.min) throw new Error(`${field.label} must be at least ${field.min}.`);
  if (field.max != null && value > field.max) throw new Error(`${field.label} must be at most ${field.max}.`);
  return value;
}

function parseField(field: VariableDef, raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (field.kind === "bool") return trimmed === "true" || trimmed === "1" || trimmed === "on";
  if (field.kind === "address") {
    if (!trimmed) {
      if (field.required) throw new Error(`${field.label} is required.`);
      return "";
    }
    if (!ADDRESS_RE.test(trimmed)) throw new Error(`${field.label} must be a Solana address.`);
    return trimmed;
  }
  if (field.kind === "text") {
    if (!trimmed && field.required) throw new Error(`${field.label} is required.`);
    return trimmed;
  }
  if (field.kind === "amount") {
    if (!trimmed) throw new Error(`${field.label} is required.`);
    if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`${field.label} must be a positive amount.`);
    if (Number(trimmed) <= 0) throw new Error(`${field.label} must be greater than 0.`);
    return trimmed;
  }
  if (field.kind === "bps" || field.kind === "percent" || field.kind === "days" || field.kind === "number") {
    const value = num(trimmed || String(field.default), field);
    if (field.kind === "bps" || field.kind === "days" || field.kind === "number") {
      if (!Number.isInteger(value)) throw new Error(`${field.label} must be a whole number.`);
    }
    return value;
  }
  return trimmed;
}

export function parseMintConfig(factory: FactorySpec, values: Record<string, string>): TokenMintConfig {
  const config: TokenMintConfig = { factory: factory.standard.factory ?? factory.standard.id };
  for (const field of factory.variables) {
    config[field.key] = parseField(field, values[field.key] ?? String(field.default));
  }
  const kind = factory.standard.factory;
  if (kind === "memecoin") {
    const burn = Number(config.burnShareBps);
    const creator = Number(config.creatorShareBps);
    if (burn + creator > 10_000) {
      throw new Error("Burn share plus creator share of tax cannot exceed 10,000 bps.");
    }
  }
  if (kind === "reflect") {
    const total = Number(config.reflectionBps) + Number(config.burnBps) + Number(config.treasuryBps);
    if (total > 2500) throw new Error("Reflection + burn + treasury cannot exceed 25% (2500 bps).");
    if (total === 0) throw new Error("Set at least one of reflection, burn, or treasury.");
  }
  if (kind === "vesting") {
    if (Number(config.vestDays) < Number(config.cliffDays)) {
      throw new Error("Vest duration must be at least the cliff.");
    }
  }
  if (kind === "launch") {
    const supply = Number(config.totalSupply);
    const onCurve = Number(config.tokenReserves);
    if (!(onCurve < supply)) throw new Error("Tokens on the curve must be less than total supply.");
    if (Number(config.graduationSol) <= 0) throw new Error("Graduation SOL must be greater than 0.");
  }
  return config;
}

export function validateFactoryMint(
  standardId: string,
  values: Record<string, string>,
): { factory: FactorySpec; config: TokenMintConfig } {
  const factory = findFactory(standardId);
  if (!factory) throw new Error("That is not an Earth factory standard.");
  return { factory, config: parseMintConfig(factory, values) };
}

export function configSummary(config?: TokenMintConfig): string[] {
  if (!config) return [];
  const lines: string[] = [];
  const factory = String(config.factory ?? "");
  if (factory === "memecoin") {
    lines.push(`buy ${Number(config.buyTaxBps) / 100}% / sell ${Number(config.sellTaxBps) / 100}%`);
    if (Number(config.maxWalletBps) > 0) lines.push(`max wallet ${Number(config.maxWalletBps) / 100}%`);
  } else if (factory === "reflect") {
    lines.push(
      `reflect ${Number(config.reflectionBps) / 100}% · burn ${Number(config.burnBps) / 100}% · treasury ${Number(config.treasuryBps) / 100}%`,
    );
  } else if (factory === "confidential") {
    lines.push(config.auditor ? "auditor set" : "no auditor");
    lines.push(config.autoApprove ? "auto-approve on" : "approve required");
  } else if (factory === "vesting") {
    lines.push(`${config.cliffDays}d cliff · ${config.vestDays}d vest`);
    if (config.revocable) lines.push("revocable");
  } else if (factory === "launch") {
    lines.push(`curve ${config.tokenReserves} / ${config.virtualSol} SOL · graduate at ${config.graduationSol} SOL`);
  }
  return lines;
}

export function asNumber(config: TokenMintConfig, key: string, fallback = 0): number {
  const value = config[key];
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asString(config: TokenMintConfig, key: string): string {
  const value = config[key];
  return value == null ? "" : String(value);
}
