import { fingerprint } from "../../core/fingerprint.js";
import type { ProviderMaterializationResult, ProviderRenderPlan } from "../provider.js";

export interface AzureMaterializeOptions {
  apiKey: string;
  region: string;
  fetchImpl?: typeof fetch;
}

function validateRegion(region: string): string {
  const normalized = region.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error("Invalid Azure Speech region");
  }
  return normalized;
}

function mediaType(outputFormat: string): string {
  return outputFormat.includes("mp3") ? "audio/mpeg" : "audio/wav";
}

export async function materializeAzureSpeech(
  plan: ProviderRenderPlan,
  options: AzureMaterializeOptions,
): Promise<ProviderMaterializationResult> {
  if (plan.providerId !== "azure_speech") throw new Error("Azure client requires an Azure render plan");
  if (typeof plan.payload !== "string") throw new Error("Azure render plan payload must be SSML text");
  if (!options.apiKey.trim()) throw new Error("Azure Speech apiKey is required");

  const region = validateRegion(options.region);
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const validationRefs = plan.validationRefs ?? Object.freeze([]);
  const requestFingerprint = fingerprint({
    endpoint,
    outputFormat: plan.outputFormat,
    ssml: plan.payload,
    validationRefs,
  });

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": options.apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": plan.outputFormat,
      "User-Agent": "pronunciation-lab",
    },
    body: plan.payload,
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`Azure Speech synthesis failed: HTTP ${response.status}${body ? ` ${body}` : ""}`);
  }

  return Object.freeze({
    bytes: new Uint8Array(await response.arrayBuffer()),
    mediaType: mediaType(plan.outputFormat),
    providerRequestFingerprint: requestFingerprint,
    responseMetadata: Object.freeze({
      httpStatus: response.status,
      outputFormat: plan.outputFormat,
      region,
      ...(validationRefs.length > 0 ? { validationRefs: validationRefs.join(",") } : {}),
    }),
  });
}
