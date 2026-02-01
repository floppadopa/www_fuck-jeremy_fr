import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    permission: 511,
    isWorkspaceDisabled: false,
  });
}
