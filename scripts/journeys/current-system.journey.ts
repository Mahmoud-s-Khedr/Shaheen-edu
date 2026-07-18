import { healthJourney } from './infrastructure/health.journey.js';
import { superAdminJourney } from './auth/super-admin-bootstrap.journey.js';
import { adminJourney } from './auth/admin-lifecycle.journey.js';
import { partnerJourney } from './auth/partner-lifecycle.journey.js';
import { studentJourney } from './auth/student-auth.journey.js';
import { parentJourney } from './auth/parent-multiple-children.journey.js';
import { hierarchyJourney } from './content/academic-hierarchy.journey.js';
import { contentJourney } from './content/basic-content-authoring.journey.js';
import type { JourneyDefinition } from './lib/types.js';

export const journeys: JourneyDefinition[] = [healthJourney, superAdminJourney, adminJourney, partnerJourney, studentJourney, parentJourney, hierarchyJourney, contentJourney];
