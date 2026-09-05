/**
 * Object Lookup — component lookup
 *
 * Source pattern: a plain object map from a string key to a React
 * component, used instead of an if/else or switch chain to pick which
 * component to render. Simplified/anonymized from a real-app icon picker
 * used inside a quiz question list.
 *
 * Shape: `COMPONENTS_BY_KEY[key] ?? Fallback` replaces branching logic with
 * a single object access.
 */

import type { ComponentType } from "react";

// Stand-ins for a larger set of icon/variant components.
function IconA() { return null; }
function IconB() { return null; }
function IconC() { return null; }
function DefaultIcon() { return null; }

const ICON_BY_NAME: Record<string, ComponentType> = {
  alpha: IconA,
  beta: IconB,
  gamma: IconC,
};

type Option = { label: string; icon?: string };

function OptionList({ options }: { options: Option[] }) {
  return (
    <div>
      {options.map((option, index) => {
        // Object lookup instead of a switch/if-else chain, with a fallback.
        const Icon = ICON_BY_NAME[option.icon ?? ""] ?? DefaultIcon;

        return (
          <button key={index} type="button">
            <Icon />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
