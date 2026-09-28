import type { Good, PlayerView, Rng } from '../engine';
import { BeliefNet } from './belief';
import { JointBeliefNet } from './beliefJoint';
import { PolicyNet } from './policyNet';
import { ValueNet, type NetWeights } from './valueNet';
import belief2V7 from './weights/belief2-v7.json';
import policyV7 from './weights/policy-v7.json';
import valueV1 from './weights/value-v1.json';
import valueV7 from './weights/value-v7.json';

/** Trained value networks by name. Bundled nets are added to `bundled`; experiments can register their own. */
const registry = new Map<string, ValueNet>();
const bundled: Record<string, () => NetWeights> = {
  v1: () => valueV1 as NetWeights,
  v7: () => valueV7 as NetWeights,
};

export function registerNet(name: string, weights: NetWeights): void {
  registry.set(name, new ValueNet(weights));
}

export function getNet(name: string): ValueNet {
  let net = registry.get(name);
  if (!net && bundled[name]) {
    net = new ValueNet(bundled[name]());
    registry.set(name, net);
  }
  if (!net) throw new Error(`unknown value net: ${name}`);
  return net;
}

const policies = new Map<string, PolicyNet>();
const bundledPolicies: Record<string, () => NetWeights> = {
  v7: () => policyV7 as NetWeights,
};

export function registerPolicy(name: string, weights: NetWeights): void {
  policies.set(name, new PolicyNet(weights));
}

export function getPolicy(name: string): PolicyNet {
  let net = policies.get(name);
  if (!net && bundledPolicies[name]) {
    net = new PolicyNet(bundledPolicies[name]());
    policies.set(name, net);
  }
  if (!net) throw new Error(`unknown policy net: ${name}`);
  return net;
}

type AnyBelief = BeliefNet | JointBeliefNet;
const beliefs = new Map<string, AnyBelief>();
const bundledBeliefs: Record<string, () => NetWeights> = {
  v7: () => belief2V7 as NetWeights,
};

const makeBelief = (w: NetWeights): AnyBelief => ((w as { kind?: string }).kind === 'belief2' ? new JointBeliefNet(w) : new BeliefNet(w));

export function registerBelief(name: string, weights: NetWeights): void {
  beliefs.set(name, makeBelief(weights));
}

export function getBelief(name: string): AnyBelief {
  let net = beliefs.get(name);
  if (!net && bundledBeliefs[name]) {
    net = makeBelief(bundledBeliefs[name]());
    beliefs.set(name, net);
  }
  if (!net) throw new Error(`unknown belief net: ${name}`);
  return net;
}

/** How to deal the opponent's unseen cards under a belief model: exact hands (joint model) or per-good weights. */
export interface HiddenModel {
  hidden?: (rng: Rng) => Good[];
  weights?: Record<Good, number>;
}

/** The belief model's view of the opponent's hidden cards, or undefined (no model, or no move history to read). */
export function beliefModel(view: PlayerView, name?: string): HiddenModel | undefined {
  if (!name || !view.oppMoves) return undefined;
  const net = getBelief(name);
  return net instanceof JointBeliefNet ? { hidden: net.sampler(view) } : { weights: net.weights(view) };
}
