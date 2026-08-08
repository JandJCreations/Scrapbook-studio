import Link from "next/link";

import { Logo } from "@/components/layout/logo";

const FOOTER_LINKS = {
  Product: ["Features", "Templates", "Pricing"],
  Company: ["About", "Careers", "Contact"],
  Resources: ["Help center", "Community", "Blog"],
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              The creative studio for turning memories into living
              scrapbooks.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-8">
            {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
              <div key={heading}>
                <h4 className="text-sm font-semibold">{heading}</h4>
                <ul className="mt-3 space-y-2">
                  {links.map((link) => (
                    <li key={link}>
                      <Link
                        href="#"
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Scrapbook Studio. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
