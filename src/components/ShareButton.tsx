"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Share an approved public page: native share sheet where available, with
// copy-link and download-card fallbacks. Only ever used on published pages.
export function ShareButton({
  url,
  title,
  text,
  cardUrl,
}: {
  url: string;
  title: string;
  text: string;
  cardUrl?: string;
}) {
  const t = useTranslations("share");
  const [copied, setCopied] = useState(false);

  async function share() {
    const absolute = new URL(url, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: absolute });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <span className="share">
      <button className="btn" type="button" onClick={share}>
        {copied ? t("linkCopied") : t("share")}
      </button>
      {cardUrl && (
        <a className="btn secondary" href={cardUrl} target="_blank" rel="noreferrer">
          {t("downloadCard")}
        </a>
      )}
    </span>
  );
}
