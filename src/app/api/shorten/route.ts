import { NextResponse } from "next/server";
import { z } from "zod";

import { connectToDatabase } from "@/lib/db";
import {
  buildShortUrl,
  generateShortCode,
  isValidHttpUrl,
  normalizeUrl,
  resolveExpiry,
  type ExpirationPreset,
} from "@/lib/shortener";
import { Link } from "@/models/Link";

const requestSchema = z.object({
  originalUrl: z.string().min(1, "URL є обов'язковим"),
  customCode: z.string().optional(),
  expiresIn: z.enum(["24h", "7d", "30d", "never"]).optional(),
});

const BASE_URL =
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  "http://localhost:3000";

const CUSTOM_CODE_REGEX = /^[A-Za-z0-9_-]{3,30}$/;

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Невірні дані. Перевірте поля форми." },
        { status: 400 }
      );
    }

    const { originalUrl, customCode, expiresIn = "never" } = parsed.data;

    const normalizedUrl = normalizeUrl(originalUrl);
    if (!isValidHttpUrl(normalizedUrl)) {
      return NextResponse.json(
        { error: "Будь ласка, введіть коректну адресу з http:// або https://" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    if (customCode) {
      if (!CUSTOM_CODE_REGEX.test(customCode)) {
        return NextResponse.json(
          {
            error:
              "Кастомний код має містити 3-30 символів: латиниця, цифри, _ або -.",
          },
          { status: 400 }
        );
      }

      const existingCustom = await Link.findOne({ shortCode: customCode });
      if (existingCustom) {
        return NextResponse.json(
          { error: "Такий код вже використовується. Оберіть інший." },
          { status: 409 }
        );
      }
    }

    const expiry = resolveExpiry(expiresIn as ExpirationPreset);

    const existingActiveLink = await Link.findOne({
      originalUrl: normalizedUrl,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (existingActiveLink) {
      return NextResponse.json(
        {
          code: existingActiveLink.shortCode,
          shortUrl: buildShortUrl(existingActiveLink.shortCode, BASE_URL),
          clicks: existingActiveLink.clicks,
          expiresAt: existingActiveLink.expiresAt,
          originalUrl: existingActiveLink.originalUrl,
          duplicate: true,
        },
        { status: 200 }
      );
    }

    let shortCode = customCode ?? generateShortCode();
    let attempts = 0;
    while (await Link.exists({ shortCode })) {
      attempts += 1;
      if (attempts > 5) {
        shortCode = generateShortCode(8);
      } else {
        shortCode = generateShortCode();
      }
    }

    const link = await Link.create({
      originalUrl: normalizedUrl,
      shortCode,
      clicks: 0,
      expiresAt: expiry,
    });

    return NextResponse.json(
      {
        code: link.shortCode,
        shortUrl: buildShortUrl(link.shortCode, BASE_URL),
        clicks: link.clicks,
        expiresAt: link.expiresAt,
        originalUrl: link.originalUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/shorten error", error);
    return NextResponse.json(
      { error: "Сталася помилка на сервері. Спробуйте знову." },
      { status: 500 }
    );
  }
}
