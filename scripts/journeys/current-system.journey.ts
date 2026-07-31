import { healthJourney } from './infrastructure/health.journey.js';
import { geographyJourney } from './infrastructure/geography.journey.js';
import { superAdminJourney } from './auth/super-admin-bootstrap.journey.js';
import { adminJourney } from './auth/admin-lifecycle.journey.js';
import { partnerJourney } from './auth/partner-lifecycle.journey.js';
import { studentJourney } from './auth/student-auth.journey.js';
import { parentJourney } from './auth/parent-multiple-children.journey.js';
import { hierarchyJourney } from './content/academic-hierarchy.journey.js';
import { contentJourney } from './content/basic-content-authoring.journey.js';
import { fullDeliveryJourney } from './content/full-content-delivery.journey.js';
import { publicCatalogJourney } from './content/public-catalog.journey.js';
import { studentCatalogJourney } from './content/student-catalog.journey.js';
import { pricingPublisherAgreementsJourney } from './content/pricing-publisher-agreements.journey.js';
import { questionBankAuthoringJourney } from './content/question-bank-authoring.journey.js';
import { phase9IntegrationJourney } from './content/phase9-integration.journey.js';
import { apiCoverageJourney } from './content/api-coverage.journey.js';
import { manualCommerceJourney } from './content/manual-commerce.journey.js';
import { studentLearningJourney } from './content/student-learning.journey.js';
import type { JourneyDefinition } from './lib/types.js';

export const journeys: JourneyDefinition[] = [
  healthJourney,
  superAdminJourney,
  geographyJourney,
  adminJourney,
  partnerJourney,
  studentJourney,
  parentJourney,
  hierarchyJourney,
  contentJourney,
  fullDeliveryJourney,
  publicCatalogJourney,
  studentCatalogJourney,
  pricingPublisherAgreementsJourney,
  questionBankAuthoringJourney,
  phase9IntegrationJourney,
  apiCoverageJourney,
  manualCommerceJourney,
  studentLearningJourney,
];
