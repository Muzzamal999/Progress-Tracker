"use client";

import { useState } from "react";
import { avatarUrl } from "@/lib/cloudinary-url";
import { getInitials } from "@/lib/student-utils";
import { cn } from "@/lib/utils";

/** Round avatar. Falls back to 2-letter initials when there is no image or it fails to load. */
export function StudentAvatar({
  name,
  imageUrl,
  size = 64,
  className,
}: {
  name: string;
  imageUrl: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  const base = "shrink-0 rounded-full object-cover ring-2 ring-white shadow-md";

  if (imageUrl && !failed) {
    return (
      // Cloudinary already serves a resized, auto-format image, so next/image would only re-process it.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl(imageUrl, size >= 96)}
        alt={`${name}'s avatar`}
        width={size}
        height={size}
        style={style}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(base, className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${name}'s avatar`}
      style={{ ...style, fontSize: size * 0.35 }}
      className={cn(base, "flex items-center justify-center bg-accent-gradient font-bold text-white", className)}
    >
      {getInitials(name)}
    </div>
  );
}
