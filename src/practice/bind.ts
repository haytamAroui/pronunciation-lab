import { fingerprint } from "../core/fingerprint.js";
import { buildCandidate } from "../core/candidate.js";
import type {
  BoundSpeechPracticePlan,
  SpeechPracticeInputMode,
  SpeechPracticeProgram,
  SpeechPracticeRenderRequest,
  SpeechPracticeRendererBinding,
  SpeechPracticeRendererCapabilities,
  SpeechPracticeTimelineEvent,
  SpeechPracticeUnit,
} from "./model.js";

const DEFAULT_RATE_BY_PACE = Object.freeze({
  natural: 0,
  careful: -8,
  slower_careful: -15,
});

function assertBindingMatchesCapabilities(input: {
  binding: SpeechPracticeRendererBinding;
  capabilities: SpeechPracticeRendererCapabilities;
}): void {
  if (input.binding.providerId !== input.capabilities.rendererId) {
    throw new Error("Practice renderer binding providerId does not match capabilities rendererId");
  }
  if (!input.binding.voiceId.trim()) throw new Error("voiceId is required");
}

function chooseInputMode(input: {
  unit: SpeechPracticeUnit;
  capabilities: SpeechPracticeRendererCapabilities;
}): SpeechPracticeInputMode {
  const supportsText = input.capabilities.supportedInputModes.includes("text");
  const supportsIpa =
    input.capabilities.supportedInputModes.includes("ipa") &&
    input.capabilities.supportedAlphabets.includes("ipa") &&
    input.unit.ipa !== null;

  if (input.unit.kind === "phoneme") {
    if (!supportsIpa) throw new Error(`UNIT_REQUIRES_IPA_CONTROL:${input.unit.unitId}`);
    return "ipa";
  }

  if (input.unit.controlRequirement === "phonetic_control_required") {
    if (!supportsIpa) throw new Error(`UNIT_REQUIRES_IPA_CONTROL:${input.unit.unitId}`);
    return "ipa";
  }

  if (input.unit.controlRequirement === "phonetic_control_preferred" && supportsIpa) {
    return "ipa";
  }

  if (supportsText) return "text";
  if (supportsIpa) return "ipa";
  throw new Error(`NO_SUPPORTED_INPUT_MODE:${input.unit.unitId}`);
}

function addSilence(
  timeline: SpeechPracticeTimelineEvent[],
  durationMs: number,
  reason: Extract<SpeechPracticeTimelineEvent, { kind: "silence" }>["reason"],
): void {
  if (durationMs <= 0) return;
  const last = timeline[timeline.length - 1];
  if (last?.kind === "silence" && last.reason === reason) {
    timeline[timeline.length - 1] = Object.freeze({
      ...last,
      durationMs: last.durationMs + durationMs,
    });
    return;
  }
  timeline.push(Object.freeze({ kind: "silence", durationMs, reason }));
}

function createRenderRequest(input: {
  program: SpeechPracticeProgram;
  unit: SpeechPracticeUnit;
  repetitionIndex: number | null;
  inputMode: SpeechPracticeInputMode;
  binding: SpeechPracticeRendererBinding;
}): SpeechPracticeRenderRequest {
  const ratePercent =
    input.binding.ratePercentByPace?.[input.unit.pace] ??
    DEFAULT_RATE_BY_PACE[input.unit.pace];
  const pitchPercent = input.binding.pitchPercent ?? 0;

  const pronunciation =
    input.inputMode === "ipa"
      ? ({
          mode: "canonical_ipa",
          alphabet: "ipa",
          phoneString: input.unit.ipa!,
        } as const)
      : ({ mode: "provider_default" } as const);

  const target = Object.freeze({
    targetId: `${input.program.programId}:${input.unit.unitId}`,
    locale: input.program.locale,
    text: input.unit.text,
    canonicalIpa: input.unit.ipa,
    role: "pronunciation_reference" as const,
    metadata: Object.freeze({
      speechPracticeProgramId: input.program.programId,
      speechPracticeUnitId: input.unit.unitId,
      practiceUnitKind: input.unit.kind,
      targetPhone: input.unit.targetPhone,
      targetPosition: input.unit.targetPosition,
      delivery: input.unit.delivery,
      pace: input.unit.pace,
    }),
  });

  const candidate = buildCandidate({
    target,
    renderer: {
      kind: "tts",
      provider: input.binding.providerId,
      voiceId: input.binding.voiceId,
      pronunciation,
      ratePercent,
      pitchPercent,
      ...(input.binding.outputFormat ? { outputFormat: input.binding.outputFormat } : {}),
      providerOptions: Object.freeze({
        speechPracticeDelivery: input.unit.delivery,
        speechPracticeUnitKind: input.unit.kind,
      }),
    },
  });

  const requestPayload = {
    programId: input.program.programId,
    sourceUnitId: input.unit.unitId,
    repetitionIndex: input.repetitionIndex,
    locale: input.program.locale,
    targetPhone: input.unit.targetPhone,
    unitKind: input.unit.kind,
    targetPosition: input.unit.targetPosition,
    delivery: input.unit.delivery,
    pace: input.unit.pace,
    input:
      input.inputMode === "ipa"
        ? {
            mode: "ipa" as const,
            text: input.unit.text,
            alphabet: "ipa" as const,
            phoneString: input.unit.ipa!,
          }
        : {
            mode: "text" as const,
            text: input.unit.text,
          },
    binding: input.binding,
    candidateId: candidate.candidateId,
  };
  const requestFingerprint = fingerprint(requestPayload);

  return Object.freeze({
    schemaVersion: "1.0.0",
    requestId: `practice-render:${requestFingerprint.slice("sha256:".length)}`,
    ...requestPayload,
    binding: Object.freeze({
      ...input.binding,
      ...(input.binding.ratePercentByPace
        ? { ratePercentByPace: Object.freeze({ ...input.binding.ratePercentByPace }) }
        : {}),
    }),
    candidate,
    authority: "experiment_only",
  });
}

export function bindSpeechPracticeProgramToRenderer(input: {
  program: SpeechPracticeProgram;
  capabilities: SpeechPracticeRendererCapabilities;
  binding: SpeechPracticeRendererBinding;
}): BoundSpeechPracticePlan {
  assertBindingMatchesCapabilities(input);

  const requests: SpeechPracticeRenderRequest[] = [];
  const timeline: SpeechPracticeTimelineEvent[] = [];

  for (const unit of input.program.units) {
    if (!input.capabilities.supportedUnitKinds.includes(unit.kind)) {
      throw new Error(`UNIT_KIND_UNSUPPORTED:${unit.unitId}:${unit.kind}`);
    }
    const inputMode = chooseInputMode({ unit, capabilities: input.capabilities });
    if (
      unit.repetition.mode === "reuse_same_artifact" &&
      !input.capabilities.canReuseArtifact
    ) {
      throw new Error(`RENDERER_CANNOT_REUSE_ARTIFACT:${unit.unitId}`);
    }

    addSilence(timeline, unit.pauseBeforeMs ?? 0, "before_unit");

    const shared =
      unit.repetition.mode === "reuse_same_artifact"
        ? createRenderRequest({
            program: input.program,
            unit,
            repetitionIndex: null,
            inputMode,
            binding: input.binding,
          })
        : null;

    if (shared) requests.push(shared);

    for (let index = 0; index < unit.repetition.count; index += 1) {
      const request =
        shared ??
        createRenderRequest({
          program: input.program,
          unit,
          repetitionIndex: index,
          inputMode,
          binding: input.binding,
        });
      if (!shared) requests.push(request);

      timeline.push(
        Object.freeze({
          kind: "render",
          requestId: request.requestId,
          sourceUnitId: unit.unitId,
          repetitionOrdinal: index + 1,
        }),
      );

      if (index < unit.repetition.count - 1) {
        addSilence(
          timeline,
          unit.repetition.interRepetitionPauseMs,
          "between_repetitions",
        );
      }
    }

    addSilence(timeline, unit.pauseAfterMs ?? 0, "after_unit");
  }

  const planPayload = {
    programId: input.program.programId,
    rendererId: input.capabilities.rendererId,
    rendererVersion: input.binding.rendererVersion,
    voiceId: input.binding.voiceId,
    requestIds: requests.map((request) => request.requestId),
    timeline,
  };
  const planFingerprint = fingerprint(planPayload);

  return Object.freeze({
    schemaVersion: "1.0.0",
    planId: `speech-practice-plan:${planFingerprint.slice("sha256:".length)}`,
    planFingerprint,
    programId: input.program.programId,
    rendererId: input.capabilities.rendererId,
    rendererVersion: input.binding.rendererVersion,
    voiceId: input.binding.voiceId,
    requests: Object.freeze(requests),
    timeline: Object.freeze(timeline),
    authority: "experiment_only",
  });
}

export function canBindSpeechPracticeUnit(input: {
  unit: SpeechPracticeUnit;
  capabilities: SpeechPracticeRendererCapabilities;
}): Readonly<{ supported: boolean; reason?: string; inputMode?: SpeechPracticeInputMode }> {
  if (!input.capabilities.supportedUnitKinds.includes(input.unit.kind)) {
    return Object.freeze({ supported: false, reason: "UNIT_KIND_UNSUPPORTED" });
  }
  try {
    const inputMode = chooseInputMode(input);
    if (
      input.unit.repetition.mode === "reuse_same_artifact" &&
      !input.capabilities.canReuseArtifact
    ) {
      return Object.freeze({ supported: false, reason: "RENDERER_CANNOT_REUSE_ARTIFACT" });
    }
    return Object.freeze({ supported: true, inputMode });
  } catch (error) {
    return Object.freeze({
      supported: false,
      reason: error instanceof Error ? error.message : "UNSUPPORTED",
    });
  }
}
