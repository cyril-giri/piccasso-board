import { createAiImageProvider } from "@/lib/ai";

const MAX_PROMPT_LENGTH = 512;
const MAX_IMAGE_PAYLOAD_SIZE = 4_000_000;
const DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

type StyleImagePayload = {
  url?: string;
  strength: number;
};

type GenerateImagePayload = {
  prompt: string;
  imageBase64?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  styleImages?: StyleImagePayload[];
};

const normalizeImageBase64 = (imageBase64: string) => {
  if (imageBase64.startsWith("data:image/")) return imageBase64;

  return `data:image/png;base64,${imageBase64}`;
};

export async function generateImageFromPrompt({
  prompt,
  imageBase64,
  imageUrl,
  width,
  height,
  styleImages,
}: GenerateImagePayload) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Prompt must be a non-empty string.");
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`);
  }

  if (!imageUrl && (typeof imageBase64 !== "string" || imageBase64.length === 0)) {
    throw new Error("Either imageUrl or imageBase64 must be provided.");
  }

  if (imageUrl && typeof imageUrl !== "string") {
    throw new Error("imageUrl must be a string.");
  }

  if (imageBase64) {
    const normalizedImage = normalizeImageBase64(imageBase64);

    if (!DATA_URL_REGEX.test(normalizedImage)) {
      throw new Error("imageBase64 must be a valid image data URL.");
    }

    if (normalizedImage.length > MAX_IMAGE_PAYLOAD_SIZE) {
      throw new Error("Image payload is too large.");
    }

    imageBase64 = normalizedImage;
  }

  if (width !== undefined && (typeof width !== "number" || !Number.isFinite(width) || width <= 0)) {
    throw new Error("width must be a positive number.");
  }

  if (height !== undefined && (typeof height !== "number" || !Number.isFinite(height) || height <= 0)) {
    throw new Error("height must be a positive number.");
  }

  if (styleImages !== undefined) {
    if (!Array.isArray(styleImages)) {
      throw new Error("styleImages must be an array.");
    }

    for (const item of styleImages) {
      if (typeof item !== "object" || item === null) {
        throw new Error("Each styleImages item must be an object.");
      }

      if (typeof item.strength !== "number") {
        throw new Error("Each styleImages item must include a numeric strength.");
      }

      if (item.url !== undefined && typeof item.url !== "string") {
        throw new Error("Each styleImages item url must be a string.");
      }
    }
  }

  const provider = createAiImageProvider();
  const response = await provider.generateImage({
    prompt: prompt.trim(),
    imageBase64: imageBase64,
    imageUrl,
    width,
    height,
    styleImages,
  });

  return response;
}
