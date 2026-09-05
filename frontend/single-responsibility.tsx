/**
 * Single Responsibility — helper decomposition
 *
 * Source pattern: a "map raw domain data to UI view-model" function that
 * stays readable by delegating every distinct concern to a small, named,
 * pure helper. Simplified/anonymized from a real-app roadmap/journey mapper.
 *
 * Shape: the public entry point reads as a short list of calls to
 * single-purpose helpers; each helper takes plain input and returns plain
 * data, with no shared mutable state, so each one can be reasoned about (and
 * tested) in isolation.
 */

type Rule = { requirement: "free" | "restricted"; slots: number };
type Item = { requirement: "free" | "restricted" };
type StageInput = { number: number; items: Item[]; rules: Rule[] };
type StageSlot = { id: string; title: string; requirement: string };
type SlotUsage = { requirement: string; used: number; total: number };

// --- single-purpose helpers -------------------------------------------------

function buildSummary(rawEntity: { id: number; title: string }) {
  return { id: rawEntity.id.toString(), title: rawEntity.title };
}

function createOpenSlots(rules: Rule[], currentItems: Item[]): StageSlot[] {
  if (rules.length === 0) {
    return [{ id: "add-item", title: "Add item", requirement: "free" }];
  }

  const slots: StageSlot[] = [];
  for (const rule of rules) {
    const used = currentItems.filter((i) => i.requirement === rule.requirement).length;
    const available = rule.slots - used;
    for (let i = 0; i < available; i++) {
      slots.push({
        id: `add-${rule.requirement}-${i}`,
        title: rule.requirement === "free" ? "Pick any option" : "Pick from restricted list",
        requirement: rule.requirement,
      });
    }
  }
  return slots;
}

function calculateSlotUsage(rules: Rule[], currentItems: Item[]): SlotUsage[] {
  return rules.map((rule) => {
    const used = currentItems.filter((i) => i.requirement === rule.requirement).length;
    return { requirement: rule.requirement, used, total: rule.slots };
  });
}

function getStageTitle(stageNumber: number): string {
  switch (stageNumber) {
    case 2:
      return "Stage two";
    case 3:
      return "Stage three";
    default:
      return `Stage ${stageNumber}`;
  }
}

// --- orchestration: decide which case a stage falls into -------------------

function processStage(stage: StageInput) {
  return {
    title: getStageTitle(stage.number),
    openSlots: createOpenSlots(stage.rules, stage.items),
    usage: calculateSlotUsage(stage.rules, stage.items),
  };
}

function mapStages(stages: StageInput[]) {
  return stages.map(processStage);
}

// --- public entry point: reads as a list of calls to the helpers above -----

export function mapDataToUI(entity: { id: number; title: string }, stages: StageInput[]) {
  return {
    summary: buildSummary(entity),
    stages: mapStages(stages),
  };
}
