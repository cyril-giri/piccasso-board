export interface AIImageProvider {
  generateImage(input: {
    prompt: string;
    imageBase64: string;
  }): Promise<{ url: string }>;
}
