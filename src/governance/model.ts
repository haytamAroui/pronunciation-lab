import type {
  CanonicalPronunciationTarget,
  PronunciationCandidate,
  PronunciationMode,
} from "../core/model.js";

export type TargetRegistryApproval =
  | Readonly<{
      status: "native_reviewed";
      evidenceIds: readonly string[];
      approvedAt: string;
      reviewerRole: "native_linguistic";
      reviewerAuthorityIds?: readonly string[];
    }>
  | Readonly<{
      status: "draft" | "retired";
      reason?: string;
    }>;

export interface TargetRegistryRecord {
  schemaVersion: "1.0.0";
  target: CanonicalPronunciationTarget;
  registryVersion: string;
  approval: TargetRegistryApproval;
}

export type ProfileRateIntent = "natural" | "careful" | "slower_careful";
export type ProfileSalienceIntent = "natural" | "enhanced_without_exaggeration";

export interface RenderingProfile {
  schemaVersion: "1.0.0";
  profileId: string;
  version: string;
  locale: string;
  targetClass: string;
  intent: Readonly<{
    rate: ProfileRateIntent;
    salience: ProfileSalienceIntent;
    childImitationModel: boolean;
    notes?: string;
  }>;
}

export interface RendererIdentity {
  kind: "tts" | "human";
  rendererId: string;
  rendererVersion: string;
}

export type RendererControlMode = PronunciationMode | "human_recording";

export interface RendererEligibilityRecord {
  schemaVersion: "1.0.0";
  eligibilityId: string;
  renderer: RendererIdentity;
  locale: string;
  targetClass: string;
  controlMode: RendererControlMode;
  status: "eligible_for_candidate_generation" | "ineligible";
  rationale: string;
  evidenceRefs?: readonly string[];
  authority: "capability_only_not_pronunciation_approval";
}

export interface GovernedCandidatePlan {
  schemaVersion: "1.0.0";
  planId: string;
  planFingerprint: string;
  targetId: string;
  targetRegistryVersion: string;
  locale: string;
  targetClass: string;
  renderingProfileId: string;
  renderingProfileVersion: string;
  renderer: RendererIdentity;
  eligibilityId: string;
  candidateId: string;
  candidateFingerprint: string;
  authority: "experiment_only";
}

export interface TechnicalQaCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface TechnicalQaResult {
  schemaVersion: "1.0.0";
  qaId: string;
  artifactId: string;
  status: "pass" | "fail";
  checks: readonly TechnicalQaCheck[];
  checkedAt: string;
  authority: "machine_filter_only";
}

export interface AcousticQaResult {
  schemaVersion: "1.0.0";
  qaId: string;
  artifactId: string;
  status: "target_likely_located" | "flagged" | "abstain";
  confidence?: number;
  reason?: string;
  flags: readonly string[];
  checkedAt: string;
  authority: "machine_advisory_only";
}

export interface ReleasedReference {
  schemaVersion: "1.0.0";
  releaseId: string;
  targetId: string;
  targetRegistryVersion: string;
  artifactId: string;
  audioSha256: string;
  candidateId: PronunciationCandidate["candidateId"];
  renderingProfileId: string;
  renderingProfileVersion: string;
  rendererIdentity: string;
  rendererVersion: string;
  linguisticReviewEvidenceIds: readonly string[];
  clinicalReviewEvidenceIds: readonly string[];
  technicalQaId: string;
  acousticQaId: string;
  acousticQaStatus: AcousticQaResult["status"];
  releasedAt: string;
  releaseManifestFingerprint: string;
  status: "active";
  authority: "human_approved_release";
}
