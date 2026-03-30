import Replicate from "replicate";

import type { AIImageProvider } from "./provider.interface";

const isValidUrlString = (value: string) =>
  value.startsWith("https://") ||
  value.startsWith("http://") ||
  value.startsWith("data:");

const resolveReplicateUrl = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return isValidUrlString(value) ? value : undefined;
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as Record<string, unknown>;

    if (typeof candidate.url === "function") {
      return resolveReplicateUrl(candidate.url());
    }

    if (typeof candidate.url === "string" && isValidUrlString(candidate.url)) {
      return candidate.url;
    }

    if (typeof candidate.output !== "undefined") {
      const nestedUrl = resolveReplicateUrl(candidate.output);
      if (nestedUrl) {
        return nestedUrl;
      }
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const nestedUrl = resolveReplicateUrl(item);
        if (nestedUrl) {
          return nestedUrl;
        }
      }
    }

    if (typeof candidate.toString === "function") {
      const stringValue = candidate.toString();
      if (isValidUrlString(stringValue)) {
        return stringValue;
      }
    }

    for (const key of Object.keys(candidate)) {
      const nestedUrl = resolveReplicateUrl(candidate[key]);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return undefined;
};

const getReplicateToken = () => {
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    throw new Error("Missing REPLICATE_API_TOKEN environment variable.");
  }

  return token;
};

export class ReplicateProvider implements AIImageProvider {
  private readonly replicate: Replicate;

  constructor() {
    this.replicate = new Replicate({
      auth: getReplicateToken(),
      useFileOutput: false,
    });
  }

  async generateImage(input: { prompt: string; imageBase64: string }) {
    const normalizedImage = input.imageBase64.startsWith("data:image/")
      ? input.imageBase64
      : `data:image/png;base64,${input.imageBase64}`;

    let output: unknown;

    try {
      output = await this.replicate.run(
        "black-forest-labs/flux-kontext-pro",
        {
          input: {
            prompt: input.prompt,
            input_image: normalizedImage,
            aspect_ratio: "match_input_image",
            output_format: "jpg",
          },
        },
      );
    } catch (error: unknown) {
      console.error("Replicate request failed", {
        prompt: input.prompt,
        imageBase64Length: normalizedImage.length,
        error,
      });
      throw error;
    }

    const outputAny = output as any;
    const url = resolveReplicateUrl(outputAny);

    if (!url || typeof url !== "string") {
      console.error("Unexpected response from Replicate", { output: outputAny });
      throw new Error("Unexpected response from Replicate.");
    }

    return { url };
  }
}
