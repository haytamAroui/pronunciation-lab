import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fingerprint } from "../../core/fingerprint.js";
import type { ProviderMaterializationResult, ProviderRenderPlan } from "../provider.js";

export interface EdgeCliMaterializeOptions {
  executable?: string;
  cwd?: string;
}

function run(executable: string, args: readonly string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`edge-tts exited with ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

export async function materializeEdgeTtsCli(
  plan: ProviderRenderPlan,
  options: EdgeCliMaterializeOptions = {},
): Promise<ProviderMaterializationResult> {
  if (plan.providerId !== "edge_tts") throw new Error("Edge CLI requires an Edge render plan");
  if (!plan.payload || typeof plan.payload === "string") {
    throw new Error("Edge render plan payload must be a CLI descriptor");
  }

  const payload = plan.payload as { executable?: unknown; args?: unknown };
  if (!Array.isArray(payload.args) || payload.args.some((item) => typeof item !== "string")) {
    throw new Error("Edge render plan has invalid CLI args");
  }

  const executable = options.executable ?? (typeof payload.executable === "string" ? payload.executable : "edge-tts");
  const dir = await mkdtemp(path.join(tmpdir(), "pronunciation-lab-edge-"));
  const outputPath = path.join(dir, "candidate.mp3");
  const args = [...(payload.args as string[]), "--write-media", outputPath];

  try {
    await run(executable, args, options.cwd);
    const bytes = new Uint8Array(await readFile(outputPath));
    return Object.freeze({
      bytes,
      mediaType: "audio/mpeg",
      providerRequestFingerprint: fingerprint({ executable, args: payload.args }),
      responseMetadata: Object.freeze({
        executable,
        outputFormat: plan.outputFormat,
      }),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
