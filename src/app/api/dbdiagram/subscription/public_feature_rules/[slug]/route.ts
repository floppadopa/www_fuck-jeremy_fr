import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([
    {
      _id: "5f1fd64855e65a01e533963d",
      name: "version_history",
      isEnabled: false,
      id: "5f1fd64855e65a01e533963d",
    },
    {
      _id: "5f2a6d38d46bf90b99fa6355",
      name: "private_protected_share",
      isEnabled: false,
      id: "5f2a6d38d46bf90b99fa6355",
    },
    {
      _id: "61d6a02d413ccb029fea98a2",
      name: "invite_people_to_diagram",
      isEnabled: false,
      id: "61d6a02d413ccb029fea98a2",
    },
    {
      _id: "648c29a3230e8d49d5311c4e",
      name: "detail_levels",
      isEnabled: false,
      id: "648c29a3230e8d49d5311c4e",
    },
  ]);
}
