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
  if (kind === "agent") {
    const mandate = String(config.mandate ?? "").trim();
    if (mandate.length < 8) throw new Error("Mandate must be at least 8 characters.");
    if (mandate.length > 512) throw new Error("Mandate must be under 512 characters.");
    if (Number(config.levyBps) === 0 && Number(config.endowmentBps) === 0) {
      throw new Error("Set a transfer levy or an endowment so the agent treasury can be funded.");
    }
    const dests = [config.allowDest1, config.allowDest2, config.allowDest3]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (dests.length === 0) {
      throw new Error(
        "Allowed ACT destination 1 is required. Paste a Solana wallet pubkey. ACT can only credit token accounts owned by an allowlisted address.",
      );
    }
    if (new Set(dests).size !== dests.length) {
      throw new Error("Allowed ACT destinations must be unique.");
    }
    config.mandate = mandate;
  }
  if (kind === "kernel") {
    if (!config.enableHash && !config.enableRecover && !config.enableIdentity) {
      throw new Error("Enable at least one syscall (hash, recover, or identity).");
    }
  }
  if (kind === "flash") {
    if (Number(config.flashPremiumBps) === 0 && Number(config.reserveBps) === 0) {
      throw new Error("Set a flash premium or a vault reserve so flash credit can exist.");
    }
  }
  if (kind === "chamber") {
    if (Number(config.votingPeriodHours) < 1) {
      throw new Error("Voting period must be at least 1 hour.");
    }
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
  } else if (factory === "agent") {
    lines.push(`levy ${Number(config.levyBps) / 100}% · endowment ${Number(config.endowmentBps) / 100}%`);
    lines.push(
      `epoch cap ${Number(config.epochSpendBps) / 100}% / ${config.epochHours}h · ACT cap ${Number(config.maxActBps) / 100}% · cooldown ${config.cooldownHours}h`,
    );
    const dests = [config.allowDest1, config.allowDest2, config.allowDest3].filter((value) => String(value ?? "").trim());
    lines.push(`${dests.length} allowed ACT destination${dests.length === 1 ? "" : "s"}`);
  } else if (factory === "kernel") {
    const sys: string[] = [];
    if (config.enableHash) sys.push("hash");
    if (config.enableRecover) sys.push("recover");
    if (config.enableIdentity) sys.push("identity");
    lines.push(`slot ${config.kernelSlot} · ${sys.join(" / ") || "no syscalls"}`);
    if (Number(config.syscallFee) > 0) lines.push(`syscall fee ${config.syscallFee} base units`);
  } else if (factory === "proxy") {
    lines.push(`${config.upgradeDelayHours}h upgrade delay`);
    if (config.upgradesFrozen) lines.push("upgrades frozen");
    else lines.push(config.implementation ? "custom implementation" : "self implementation");
  } else if (factory === "flash") {
    lines.push(`premium ${Number(config.flashPremiumBps) / 100}% · vault ${Number(config.reserveBps) / 100}%`);
    if (!config.flashEnabled) lines.push("flash paused");
  } else if (factory === "chamber") {
    lines.push(`quorum ${Number(config.quorumBps) / 100}% · vote ${config.votingPeriodHours}h · lock ${config.timelockHours}h`);
    if (Number(config.treasuryBps) > 0) lines.push(`treasury levy ${Number(config.treasuryBps) / 100}%`);
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

export function fillAgentDefaults(values: Record<string, string>, wallet?: string): Record<string, string> {
  const next = { ...values };
  const addr = wallet?.trim() ?? "";
  if (addr) {
    if (!next.operator?.trim()) next.operator = addr;
    if (!next.allowDest1?.trim()) next.allowDest1 = addr;
  }
  return next;
}

export function asString(config: TokenMintConfig, key: string): string {
  const value = config[key];
  return value == null ? "" : String(value);
}
