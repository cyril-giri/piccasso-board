export interface AIImageProvider {
  generateImage(input: {
    prompt: string;
    imageBase64?: string;
    imageUrl?: string;
    width?: number;
    height?: number;
    strength?: number;
    seed?: number;
    steps?: number;
    styleImages?: Array<{ url?: string; strength: number }>;
    imageStyleRefs?: Array<Record<string, unknown>>;
    guidance_scale_flux?: number;
    relaxedModeAccess?: boolean;
    styles?: Array<Record<string, unknown>>;
  }): Promise<{ url: string }>;
}
