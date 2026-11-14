/**
 * The live interview has its own top bar (question progress, Stop), so its page renders
 * `SiteShell` itself with those slots and this group adds no frame.
 */
export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
