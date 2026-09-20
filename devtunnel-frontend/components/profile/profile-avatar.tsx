import Image from "next/image";
import { UserIcon } from "@/components/layout/nav-icons";

/**
 * Profile-card avatar: the real `avatarUrl` when present, otherwise a
 * placeholder circle with a person glyph — never a blank space, and
 * never a fabricated photo (5_devtunnel_profile_page.html's fallback
 * treatment, colors lifted into tailwind.config.ts as
 * `avatar-placeholder`).
 */
export function ProfileAvatar({
  avatarUrl,
}: {
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={56}
        height={56}
        className="h-14 w-14 shrink-0 rounded-full border border-border-subtle"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-avatar-placeholder-border bg-avatar-placeholder-bg"
    >
      <UserIcon className="h-6 w-6 text-avatar-placeholder-icon" />
    </span>
  );
}