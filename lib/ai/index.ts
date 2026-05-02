import type { AIImageProvider } from "./provider.interface";
import { KreaProvider } from "./krea.provider";
import { ReplicateProvider } from "./replicate.provider";

export const createAiImageProvider = (): AIImageProvider => {
  const provider = process.env.AI_IMAGE_PROVIDER?.toLowerCase() ?? "krea";

  switch (provider) {
    case "krea":
      return new KreaProvider();
    case "replicate":
      return new ReplicateProvider();
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
};
