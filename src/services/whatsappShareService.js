(function (global) {
  function createWhatsAppShareService() {
    function sanitizeShareText(value) {
      return String(value ?? "")
        .normalize("NFC")
        .replace(/\u00A0/g, " ")
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
        .replace(/\uFFFD+/g, "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
        .replace(/[\*_~`]/g, "")
        .trim();
    }

    function buildShareMessage({ location = "", datetime = "", teamsText = "", mapsUrl = "" } = {}) {
      const cleanLocation = sanitizeShareText(location);
      const cleanDatetime = sanitizeShareText(datetime);
      const cleanTeamsText = sanitizeShareText(teamsText);
      const cleanMapsUrl = sanitizeShareText(mapsUrl);

      const headerParts = [];
      if (cleanLocation) headerParts.push(`Location: ${cleanLocation}`);
      if (cleanDatetime) headerParts.push(`Date: ${cleanDatetime}`);

      const sections = [];
      if (headerParts.length > 0) sections.push(headerParts.join("\n"));
      if (cleanTeamsText) sections.push(cleanTeamsText);
      if (cleanMapsUrl) sections.push(`Map:\n${cleanMapsUrl}`);

      return sanitizeShareText(sections.join("\n\n")).replace(/\n{3,}/g, "\n\n");
    }

    async function shareText(text) {
      const cleanText = sanitizeShareText(text);
      if (!cleanText) {
        return { status: "empty", text: "" };
      }

      const encodedText = encodeURIComponent(cleanText);
      const waAppUrl = `whatsapp://send?text=${encodedText}`;
      const waWebUrl = `https://wa.me/?text=${encodedText}`;
      const waApiUrl = `https://api.whatsapp.com/send?text=${encodedText}`;
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");

      if (isMobile) {
        try {
          window.location.href = waAppUrl;
          return { status: "opened", text: cleanText };
        } catch (_error) {
          // Continue to web fallbacks
        }
      }

      let popup = null;
      try {
        popup = window.open(waWebUrl, "_blank", "noopener,noreferrer");
      } catch (_error) {
        popup = null;
      }

      if (!popup) {
        try {
          popup = window.open(waApiUrl, "_blank", "noopener,noreferrer");
        } catch (_error) {
          popup = null;
        }
      }

      if (popup) {
        return { status: "opened", text: cleanText };
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(cleanText);
          return { status: "copied", text: cleanText };
        } catch (_error) {
          return { status: "manual", text: cleanText };
        }
      }

      return { status: "manual", text: cleanText };
    }

    return {
      sanitizeShareText,
      buildShareMessage,
      shareText,
    };
  }

  global.createWhatsAppShareService = createWhatsAppShareService;
})(window);
