import { NextRequest, NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/db";
import { Link } from "@/models/Link";

interface RouteContext {
  params: Promise<{
    code: string;
  }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { code } = await params;

  if (!code) {
    return NextResponse.json(
      { error: "Код не вказаний" },
      { status: 400 }
    );
  }

  try {
    await connectToDatabase();

    const link = await Link.findOne({ shortCode: code });
    if (!link) {
      return NextResponse.json(
        { error: "Посилання не знайдено" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        originalUrl: link.originalUrl,
        shortCode: link.shortCode,
        clicks: link.clicks,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/stats/[code] error", error);
    return NextResponse.json(
      { error: "Сталася помилка на сервері." },
      { status: 500 }
    );
  }
}
