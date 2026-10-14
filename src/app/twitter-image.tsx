import { ImageResponse } from "next/og";

export const alt = "Student Journey Atlas – Track Progress & Badges";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #070a10 0%, #1a0b3d 100%)",
          color: "#f1f5f9",
        }}
      >
        <div style={{ fontSize: 84, fontWeight: 800, color: "#8b5cf6" }}>Student Journey Atlas</div>
        <div style={{ fontSize: 36, marginTop: 24, color: "#94a3b8" }}>Track Progress & Badges</div>
      </div>
    ),
    size,
  );
}
