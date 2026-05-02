import type { AIImageProvider } from "./provider.interface";

export interface KreaStyleImage {
  url?: string;
  strength: number;
}

export type KreaStyleRef = Record<string, unknown>;
export type KreaStyle = Record<string, unknown>;

export interface KreaImageGenerationInput {
  prompt: string;
  imageBase64?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  strength?: number;
  seed?: number;
  steps?: number;
  styleImages?: KreaStyleImage[];
  imageStyleRefs?: KreaStyleRef[];
  guidance_scale_flux?: number;
  relaxedModeAccess?: boolean;
  styles?: KreaStyle[];
}

const KREA_DEFAULT_OPTIONS = {
  // strength: 1,
  // seed: 2336101555,
  // steps: 30,
  // styleImages: [],
  // imageStyleRefs: [],
  // guidance_scale_flux: 8.0,
  // relaxedModeAccess: false,
  // styles: [],

  /**
   * 0.7 is the "Golden Ratio" for Flux Kontext. 
   * It provides enough freedom to add professional textures and lighting 
   * without losing the structural integrity of your input sketch.
   */
  // strength: 0.7,

  /**
   * Using a fixed seed is great for debugging, but for a provider, 
   * null/undefined usually triggers a random seed on the server side.
   */
  seed: Math.floor(Math.random() * 1_000_000_000),

  /**
   * Flux-1-dev (Distilled) works exceptionally well between 25-30 steps. 
   * Going higher yields diminishing returns and increases latency.
   */
  steps: 28,

  /**
   * Keep these as empty arrays to avoid schema validation errors 
   * if the user doesn't provide them.
   */
  styleImages: [],
  imageStyleRefs: [],

  /**
   * CRITICAL: Flux requires a much lower guidance scale than SDXL. 
   * Values between 3.0 and 4.0 prevent "over-cooking" and artifacts.
   */
  guidance_scale_flux: 3.5,

  /**
   * Recommended for API stability and cost-efficiency.
   */
  relaxedModeAccess: true,

  /**
   * Default to empty to prevent unexpected LoRA applications.
   */
  styles: [],
};

const getKreaToken = () => {
  const token = process.env.KREA_API_TOKEN;
  if (!token) throw new Error("Missing KREA_API_TOKEN environment variable.");
  return token;
};

const getKreaBaseUrl = () => {
  const baseUrl = process.env.KREA_API_BASE_URL?.trim() ?? "https://api.krea.ai";
  return baseUrl.replace(/\/+$/u, "");
};

const getKreaModel = () => {
  return process.env.KREA_IMAGE_MODEL?.trim() ?? "bfl/flux-1-dev";
};

const isValidUrlString = (value: string) =>
  value.startsWith("https://") || value.startsWith("http://");

const resolveKreaUrl = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return isValidUrlString(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedUrl = resolveKreaUrl(item);
      if (nestedUrl) {
        return nestedUrl;
      }
    }

    return undefined;
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as Record<string, unknown>;

    if (typeof candidate.url === "string" && isValidUrlString(candidate.url)) {
      return candidate.url;
    }

    if (
      typeof candidate.imageUrl === "string" &&
      isValidUrlString(candidate.imageUrl)
    ) {
      return candidate.imageUrl;
    }

    if (
      typeof candidate.secure_url === "string" &&
      isValidUrlString(candidate.secure_url)
    ) {
      return candidate.secure_url;
    }

    if (typeof candidate.result !== "undefined") {
      const nestedUrl = resolveKreaUrl(candidate.result);
      if (nestedUrl) {
        return nestedUrl;
      }
    }

    if (typeof candidate.output !== "undefined") {
      const nestedUrl = resolveKreaUrl(candidate.output);
      if (nestedUrl) {
        return nestedUrl;
      }
    }

    for (const key of Object.keys(candidate)) {
      const nestedUrl = resolveKreaUrl(candidate[key]);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return undefined;
};

const KREA_MIN_DIMENSION = 512;
const KREA_MAX_DIMENSION = 2368;

const createKreaHeaders = () => ({
  Authorization: `Bearer ${getKreaToken()}`,
  "Content-Type": "application/json",
});

const createKreaAuthHeaders = () => ({
  Authorization: `Bearer ${getKreaToken()}`,
});

const normalizeKreaDimensions = (width: number, height: number) => {
  const needsUpscale = width < KREA_MIN_DIMENSION || height < KREA_MIN_DIMENSION;
  const needsDownscale = width > KREA_MAX_DIMENSION || height > KREA_MAX_DIMENSION;

  if (!needsUpscale && !needsDownscale) {
    return { width, height };
  }

  const minRatio = Math.max(
    KREA_MIN_DIMENSION / width,
    KREA_MIN_DIMENSION / height,
    1,
  );
  const maxRatio = Math.min(
    KREA_MAX_DIMENSION / width,
    KREA_MAX_DIMENSION / height,
    1,
  );

  const ratio = needsUpscale ? minRatio : maxRatio;
  const scaledWidth = Math.round(width * ratio);
  const scaledHeight = Math.round(height * ratio);

  return {
    width: Math.min(Math.max(scaledWidth, KREA_MIN_DIMENSION), KREA_MAX_DIMENSION),
    height: Math.min(Math.max(scaledHeight, KREA_MIN_DIMENSION), KREA_MAX_DIMENSION),
  };
};

export class KreaProvider implements AIImageProvider {
  private readonly baseUrl = getKreaBaseUrl();
  private readonly model = getKreaModel();

  async generateImage(input: KreaImageGenerationInput) {
    const width = input.width ?? 1024;
    const height = input.height ?? 1024;
    const normalizedDimensions = normalizeKreaDimensions(width, height);

    let styleImages = input.styleImages;

    if (!styleImages && input.imageBase64) {
      const normalizedInputImage = this.parseDataUrl(input.imageBase64);
      const asset = await this.uploadAsset(
        normalizedInputImage.base64,
        normalizedInputImage.mimeType,
      );

      styleImages = [
        {
          url: asset.image_url,
          strength: input.strength ?? 0.7,
        },
      ];

      console.log("KreaProvider uploaded asset for styleImages", {
        id: asset.id,
        styleImageUrl: asset.image_url,
      });
    }

    const requestBody: Record<string, unknown> = {
      prompt: "referring to the object in the image be creative with it generate the object  " + input.prompt,
      width: normalizedDimensions.width,
      height: normalizedDimensions.height,
      ...KREA_DEFAULT_OPTIONS,
      ...(styleImages !== undefined ? { styleImages } : {}),
      ...(input.strength !== undefined ? { strength: input.strength } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.steps !== undefined ? { steps: input.steps } : {}),
      ...(input.imageStyleRefs !== undefined ? { imageStyleRefs: input.imageStyleRefs } : {}),
      ...(input.guidance_scale_flux !== undefined ? { guidance_scale_flux: input.guidance_scale_flux } : {}),
      ...(input.relaxedModeAccess !== undefined ? { relaxedModeAccess: input.relaxedModeAccess } : {}),
      ...(input.styles !== undefined ? { styles: input.styles } : {}),
    };

    if (process.env.NODE_ENV !== "production") {
      console.log("KreaProvider request body preview:", {
        ...requestBody,
        originalWidth: input.width,
        originalHeight: input.height,
      });
    }

    const response = await fetch(
      `${this.baseUrl}/generate/image/${this.model}`,
      {
        method: "POST",
        headers: createKreaHeaders(),
        body: JSON.stringify(requestBody),
      },
    );

    const payload = await this.parseResponse(response, "Krea image generation request");
    console.log("KreaProvider generate response payload:", payload);

    const directUrl = resolveKreaUrl(payload);
    if (directUrl) {
      return { url: directUrl };
    }

    if (typeof payload === "object" && payload !== null) {
      const jobId = (payload as Record<string, unknown>).job_id;
      if (typeof jobId === "string") {
        const jobResultUrl = await this.pollJob(jobId);
        return { url: jobResultUrl };
      }
    }

    throw new Error("Krea did not return a valid image URL or job ID.");
  }

  private parseDataUrl(imageBase64: string) {
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      throw new Error("Krea image generation requires a valid base64 image string.");
    }

    const prefixMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.]+);base64,(.*)$/);
    if (prefixMatch) {
      return {
        base64: prefixMatch[2],
        mimeType: prefixMatch[1],
      };
    }

    return {
      base64: imageBase64,
      mimeType: "image/png",
    };
  }

  private async uploadAsset(imageBase64: string, mimeType: string) {
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: mimeType });

    formData.append("file", blob, "upload.png");

    const response = await fetch(`${this.baseUrl}/assets`, {
      method: "POST",
      headers: createKreaAuthHeaders(),
      body: formData,
    });

    const payload = await this.parseResponse(response, "Krea asset upload request");

    if (
      typeof payload === "object" &&
      payload !== null &&
      typeof (payload as Record<string, unknown>).image_url === "string" &&
      typeof (payload as Record<string, unknown>).id === "string"
    ) {
      return payload as { id: string; image_url: string };
    }

    throw new Error("Krea asset upload failed: no image_url returned.");
  }

  private async parseResponse(response: Response, context: string) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`${context} failed: unable to parse JSON (${String(error)}).`);
    }

    if (!response.ok) {
      const errorMessage =
        typeof payload === "object" && payload !== null && "error" in payload
          ? (payload as Record<string, unknown>).error ?? JSON.stringify(payload)
          : response.statusText;
      throw new Error(`${context} failed: ${String(errorMessage)}`);
    }

    return payload;
  }

  private async pollJob(jobId: string) {
    const timeoutMs = 90_000;
    const intervalMs = 2000;
    const startedAt = Date.now();
    const jobUrl = `${this.baseUrl}/jobs/${jobId}`;

    while (Date.now() - startedAt < timeoutMs) {
      const response = await fetch(jobUrl, {
        method: "GET",
        headers: createKreaHeaders(),
      });

      const payload = await this.parseResponse(response, "Krea job status request");

      if (typeof payload === "object" && payload !== null) {
        const status = (payload as Record<string, unknown>).status;

        if (status === "completed") {
          const url = resolveKreaUrl(payload);
          if (url) {
            return url;
          }

          throw new Error("Krea job completed but no usable image URL was returned.");
        }

        if (status === "failed" || status === "cancelled") {
          throw new Error(`Krea image generation failed with status: ${status}.`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error("Krea image generation timeout exceeded.");
  }
}
