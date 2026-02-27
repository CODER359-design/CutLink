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
    return new NextResponse("Код не вказаний", { status: 400 });
  }

  try {
    await connectToDatabase();

    const link = await Link.findOne({ shortCode: code });

    if (!link) {
      return new NextResponse("Посилання не знайдено", { status: 404 });
    }

    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      return new NextResponse("Термін дії цього посилання завершився", {
        status: 404,
      });
    }

    await Link.updateOne({ _id: link._id }, { $inc: { clicks: 1 } });

    return NextResponse.redirect(link.originalUrl, { status: 302 });
  } catch (error) {
    console.error("GET /go/[code] error", error);
    return new NextResponse("Серверна помилка", { status: 500 });
  }
}
