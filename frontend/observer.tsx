/**
 * Observer pattern — DOM `CustomEvent` as a lightweight cross-component event bus
 *
 * Source pattern: simplified/anonymized from a real app's dev-only "impersonate
 * a tenant" feature — a superadmin picks a tenant from a list, and a persistent
 * banner rendered elsewhere in the layout tree needs to reflect that choice
 * immediately. Later removed in favor of a full page reload (see bottom),
 * but the pattern itself is a valid, general-purpose one.
 *
 * Problem it solves: two components with no parent-child relationship need to
 * react to the same piece of state changing. The state lives in `localStorage`
 * so it survives reloads/tabs, but writing to `localStorage` doesn't trigger a
 * re-render in the *same* tab (the native `storage` event only fires in
 * *other* tabs). Dispatching a `CustomEvent` on `window` fills that gap:
 * same-tab, cross-component notification, with zero extra dependencies.
 *
 * This is the Observer pattern implemented with native `CustomEvent`/
 * `EventTarget` instead of a hand-rolled emitter class — component A
 * (publisher) announces a fact, component B (subscriber) reacts, and neither
 * needs to know the other exists. In React, it's an escape hatch for cases
 * where prop-drilling or context would be awkward for something this
 * occasional and this decoupled.
 */

import { useEffect, useState } from "react";

const OVERRIDE_CHANGED_EVENT = "tenant-override-changed";

type OverrideDetail = { id: string | null; name: string | null };

// --- Publisher: picks a tenant, writes to localStorage, notifies same-tab listeners ---

function TenantPickerPage() {
  const [activeTenantId, setActiveTenantId] = useState<string | null>(() =>
    localStorage.getItem("override_tenant_id"),
  );

  function handleSwitch(tenantId: string, tenantName: string) {
    const next = activeTenantId === tenantId ? null : tenantId;

    setActiveTenantId(next);
    if (next) {
      localStorage.setItem("override_tenant_id", next);
      localStorage.setItem("override_tenant_name", tenantName);
    } else {
      localStorage.removeItem("override_tenant_id");
      localStorage.removeItem("override_tenant_name");
    }

    // Same-tab components can't hear localStorage writes (the native
    // `storage` event only fires in *other* tabs) — a CustomEvent bridges that.
    window.dispatchEvent(
      new CustomEvent<OverrideDetail>(OVERRIDE_CHANGED_EVENT, {
        detail: { id: next, name: next ? tenantName : null },
      }),
    );
  }

  return null; // list UI omitted — not relevant to the pattern
}

// --- Subscriber: mounted far away in the layout tree, reacts without any prop link ---

function TenantOverrideBanner() {
  const [state, setState] = useState<{ id: string; name: string } | null>(() => {
    const id = localStorage.getItem("override_tenant_id");
    const name = localStorage.getItem("override_tenant_name");
    return id && name ? { id, name } : null;
  });

  useEffect(() => {
    function onOverrideChanged(e: Event) {
      const { id, name } = (e as CustomEvent<OverrideDetail>).detail;
      setState(id && name ? { id, name } : null);
    }

    window.addEventListener(OVERRIDE_CHANGED_EVENT, onOverrideChanged);
    return () => window.removeEventListener(OVERRIDE_CHANGED_EVENT, onOverrideChanged);
  }, []);

  if (!state) return null;

  return <div>Viewing as {state.name}</div>;
}

/**
 * Why it was later removed: replaced with `window.location.reload()` —
 * trading the in-memory pub/sub for a full reload that just re-reads
 * `localStorage` fresh on mount. Fewer moving parts (no event name to keep
 * in sync between publisher/subscriber, no risk of a missed listener), at
 * the cost of an instant in-app update becoming a full page reload.
 */
