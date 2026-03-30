import { createAiImageProvider } from "@/lib/ai";

const MAX_PROMPT_LENGTH = 512;
const MAX_IMAGE_PAYLOAD_SIZE = 4_000_000;
const DATA_URL_REGEX = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

type GenerateImagePayload = {
  prompt: string;
  imageBase64: string;
};

const normalizeImageBase64 = (imageBase64: string) => {
  if (imageBase64.startsWith("data:image/")) return imageBase64;

  return `data:image/png;base64,${imageBase64}`;
};

export async function generateImageFromPrompt({
  prompt,
  imageBase64,
}: GenerateImagePayload) {
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Prompt must be a non-empty string.");
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt must be at most ${MAX_PROMPT_LENGTH} characters.`);
  }

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    throw new Error("imageBase64 must be a non-empty base64 string.");
  }

  const normalizedImage = normalizeImageBase64(imageBase64);

  if (!DATA_URL_REGEX.test(normalizedImage)) {
    throw new Error("imageBase64 must be a valid image data URL.");
  }

  if (normalizedImage.length > MAX_IMAGE_PAYLOAD_SIZE) {
    throw new Error("Image payload is too large.");
  }

  const provider = createAiImageProvider();
  const response = await provider.generateImage({
    prompt: prompt.trim(),
    imageBase64: normalizedImage,
  });

  return response;
}
