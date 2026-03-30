import type { AIImageProvider } from "./provider.interface";
import { ReplicateProvider } from "./replicate.provider";

export const createAiImageProvider = (): AIImageProvider => {
  const provider = process.env.AI_IMAGE_PROVIDER?.toLowerCase() ?? "replicate";

  switch (provider) {
    case "replicate":
      return new ReplicateProvider();
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
};
