import path from 'node:path';
import type {
  DirectoryResponsibility,
  MigrationAction,
  MigrationPlanProposal,
  ScannedDocMeta
} from './types.js';

export const DOC_CATEGORIES = [
  'product',
  'architecture',
  'decisions',
  'guides',
  'conventions',
  'operations',
  'references',
  'archive'
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

/** Input made of the scan result plus the classification the agent decided */
export interface ClassifiedDoc extends ScannedDocMeta {
  category: DocCategory;
}

const FOLDER_RESPONSIBILITY: Record<DocCategory, { title: string; description: string }> = {
  product: {
    title: 'Product Requirements',
    description: 'What we build and for whom: product requirements and acceptance criteria'
  },
  architecture: {
    title: 'Architecture',
    description:
      'How the system is structured and designed today (system structure, database, design specifications)'
  },
  decisions: {
    title: 'Decisions',
    description: 'Why we decided what we decided (ADRs: architecture decision records)'
  },
  guides: {
    title: 'Guides',
    description:
      'Practical procedures for development and operations (environment setup, deployment, development flow and so on)'
  },
  conventions: {
    title: 'Conventions',
    description: 'Shared rules and conventions for documents, coding, commits and so on'
  },
  operations: {
    title: 'Operations',
    description: 'Operating procedures such as operations, monitoring and incident response'
  },
  references: {
    title: 'References',
    description:
      'Material for reference, such as external specifications, research notes and glossaries'
  },
  archive: {
    title: 'Archive',
    description:
      'A place for temporary notes and old material that has served its purpose (read-only)'
  }
};

export function validateClassifiedDocs(docs: unknown): ClassifiedDoc[] {
  if (!Array.isArray(docs)) throw new Error('extracted JSON must be an array');
  return docs.map((d, i) => {
    if (!d || typeof d.path !== 'string' || typeof d.title !== 'string') {
      throw new Error(`extracted[${i}]: "path" and "title" are required`);
    }
    if (!DOC_CATEGORIES.includes(d.category)) {
      throw new Error(
        `extracted[${i}] (${d.path}): "category" must be one of ${DOC_CATEGORIES.join(', ')}`
      );
    }
    return {
      path: d.path.replace(/\\/g, '/'),
      title: d.title,
      summary: typeof d.summary === 'string' ? d.summary : '',
      category: d.category
    };
  });
}

function toAction(doc: ClassifiedDoc, to: string): MigrationAction {
  return { from: doc.path, to, title: doc.title, description: doc.summary || doc.title };
}

function responsibilities(actions: MigrationAction[], docsRoot: string): DirectoryResponsibility[] {
  const dirs = new Set(actions.map((a) => path.posix.dirname(a.to)));
  const result: DirectoryResponsibility[] = [];
  for (const dir of [...dirs].sort()) {
    const base = path.posix.basename(dir) as DocCategory;
    const known = path.posix.dirname(dir) === docsRoot ? FOLDER_RESPONSIBILITY[base] : undefined;
    if (known) result.push({ dir, ...known });
  }
  return result;
}

/** Stop before applying when several files head for the same destination */
function assertNoCollision(actions: MigrationAction[]): void {
  const seen = new Map<string, string>();
  for (const a of actions) {
    const prev = seen.get(a.to);
    if (prev && prev !== a.from) {
      throw new Error(`Destination collision: ${prev} and ${a.from} both map to ${a.to}`);
    }
    seen.set(a.to, a.from);
  }
}

/**
 * Generate options A/B/C. The classification (category) is decided by the caller (the agent);
 * here only the destinations, collision detection and directory responsibilities are computed, deterministically.
 */
export function buildMigrationProposals(
  docs: ClassifiedDoc[],
  docsRoot = 'docs'
): MigrationPlanProposal[] {
  const standard = (d: ClassifiedDoc) => `${docsRoot}/${d.category}/${path.posix.basename(d.path)}`;

  const planA = docs.map((d) => toAction(d, standard(d)));
  const planB = docs.map((d) => toAction(d, d.path));
  const planC = docs.map((d) => {
    if (d.category === 'archive') return toAction(d, standard(d));
    // Live documents already directly in a standard folder are not moved
    const alreadyStandard = path.posix.dirname(d.path) === `${docsRoot}/${d.category}`;
    return toAction(d, alreadyStandard ? d.path : standard(d));
  });

  for (const actions of [planA, planB, planC]) assertNoCollision(actions);

  return [
    {
      planType: 'plan_a_rigid',
      title: 'Plan A: conform to the zoomdoc standard layout',
      strategyDescription: `Relocate every file to ${docsRoot}/<category>/ according to its classification`,
      pros: ['The structure is uniform and easy to explore with progressive disclosure'],
      cons: ['Many moves, and links from outside change'],
      actions: planA,
      directoryResponsibilities: responsibilities(planA, docsRoot)
    },
    {
      planType: 'plan_b_preserve',
      title: 'Plan B: keep the existing directory structure',
      strategyDescription: 'Do not move paths; only add front matter',
      pros: ['Links do not break', 'The smallest diff'],
      cons: ['Does not match the standard folder layout, so schema.yaml needs adjusting'],
      actions: planB,
      directoryResponsibilities: []
    },
    {
      planType: 'plan_c_hybrid',
      title: 'Plan C: hybrid, organize and consolidate',
      strategyDescription: `Live documents go to the standard folders (left in place if already there), and archive-classified ones are moved to ${docsRoot}/archive/`,
      pros: ['Moves only what is needed and separates old notes'],
      cons: ['Depends on the accuracy of the classification (category)'],
      actions: planC,
      directoryResponsibilities: responsibilities(planC, docsRoot)
    }
  ];
}

export interface PlanRecommendation {
  planType: MigrationPlanProposal['planType'];
  reason: string;
}

/**
 * Choose the recommended option from the scan result: C if there is something to archive (archive classification), otherwise B, which moves nothing.
 * Attach the reason in one line (no fixed star recommendation).
 */
export function recommendPlan(docs: ClassifiedDoc[]): PlanRecommendation {
  const archived = docs.filter((d) => d.category === 'archive');
  if (archived.length > 0) {
    return {
      planType: 'plan_c_hybrid',
      reason: `There are ${archived.length} item(s) to archive (dated temporary notes and the like), so C, which organizes live documents while archiving, fits`
    };
  }
  return {
    planType: 'plan_b_preserve',
    reason:
      'There is nothing to archive and little need to move anything, so B, which breaks no links and has the smallest diff, fits'
  };
}
