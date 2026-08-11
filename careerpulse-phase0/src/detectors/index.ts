/**
 * Detector Registry
 *
 * Exports all ATS detectors. The orchestrator (run.ts) uses the individual
 * detection functions directly for the multi-strategy pipeline,
 * but we also export the combined detectors for backward compatibility.
 */

import { detectGreenhouse } from './greenhouse.js';
import { detectLever } from './lever.js';
import { detectAshby } from './ashby.js';
import { detectSmartRecruiters } from './smartrecruiters.js';
import type { DetectionResult } from '../types.js';

export type DetectorFn = (
  companyName: string,
  inputUrl: string
) => Promise<DetectionResult | null>;

/** Combined detectors (URL  guess  scan) for simple usage. */
export const detectors: DetectorFn[] = [
  detectGreenhouse,
  detectLever,
  detectAshby,
  detectSmartRecruiters,
];

// Re-export individual detection functions for the orchestrator
export {
  detectGreenhouseByUrl,
  guessAndVerifyGreenhouse,
  detectGreenhouseByScan,
} from './greenhouse.js';

export {
  detectLeverByUrl,
  guessAndVerifyLever,
  detectLeverByScan,
} from './lever.js';

export {
  detectAshbyByUrl,
  guessAndVerifyAshby,
  detectAshbyByScan,
} from './ashby.js';

export {
  guessAndVerifySmartRecruiters,
} from './smartrecruiters.js';
export { detectAmazon } from './amazon.js';
export { detectZerodha } from './zerodha.js';
export { detectZoho } from './zoho.js';
export { detectPhenom } from './phenom.js';
export { detectClearFeed } from './clearfeed.js';
