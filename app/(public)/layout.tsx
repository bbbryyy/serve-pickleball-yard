import { FloatingDink } from "@/components/FloatingDink";
import { SectionAnimator } from "@/components/SectionAnimator";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <div id="top" aria-hidden />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      {/* AGENT_ENABLED=false turns the Ask Dink assistant off (kill switch) */}
      <FloatingDink chatEnabled={process.env.AGENT_ENABLED !== "false"} />
      <SectionAnimator />
    </>
  );
}
