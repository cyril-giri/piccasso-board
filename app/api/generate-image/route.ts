import { NextResponse } from "next/server";

import { generateImageFromPrompt } from "@/server/api/generate-image";

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await generateImageFromPrompt(body);
    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    console.error("/api/generate-image error", {
      body,
      error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate AI image.",
      },
      { status: 400 },
    );
  }
}
