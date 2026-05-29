import { NextRequest, NextResponse } from "next/server"
import { getServerToken } from "@/src/lib/get-access-token"
import { prisma } from "@/src/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { userId, error } = await getServerToken(request)
    if (error === "RefreshTokenError") {
      return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 })
    }
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        image: true,
        role: true,
        company: true,
        jobTitle: true,
        department: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json(user)
  } catch (err) {
    console.error("[GET /api/profile]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, error } = await getServerToken(request)
    if (error === "RefreshTokenError") {
      return NextResponse.json({ error: "Session expired, please sign in again" }, { status: 401 })
    }
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { role, company, jobTitle, department } = body

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: typeof role === "string" ? role.trim() || null : undefined,
        company: typeof company === "string" ? company.trim() || null : undefined,
        jobTitle: typeof jobTitle === "string" ? jobTitle.trim() || null : undefined,
        department: typeof department === "string" ? department.trim() || null : undefined,
      },
      select: {
        role: true,
        company: true,
        jobTitle: true,
        department: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error("[PATCH /api/profile]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
