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

    function buildShareMessage({ location = "", datetime = "", teamsText = "", mapsUrl = "", mode = "compat" } = {}) {
      const normalizedMode = mode === "rich" ? "rich" : "compat";
      const cleanLocation = sanitizeShareText(location);
      const cleanDatetime = sanitizeShareText(datetime);
      const cleanTeamsText = sanitizeShareText(teamsText);
      const cleanMapsUrl = sanitizeShareText(mapsUrl);

      if (normalizedMode === "rich") {
        return buildRichShareMessage({
          location: cleanLocation,
          datetime: cleanDatetime,
          teamsText: cleanTeamsText,
          mapsUrl: cleanMapsUrl,
        });
      }

      const headerParts = [];
      if (cleanLocation) headerParts.push(`Location: ${cleanLocation}`);
      if (cleanDatetime) headerParts.push(`Date: ${cleanDatetime}`);

      const sections = [];
      if (headerParts.length > 0) sections.push(headerParts.join("\n"));
      if (cleanTeamsText) sections.push(cleanTeamsText);
      if (cleanMapsUrl) sections.push(`Map:\n${cleanMapsUrl}`);

      return sanitizeShareText(sections.join("\n\n")).replace(/\n{3,}/g, "\n\n");
    }

    function buildRichShareMessage({ location = "", datetime = "", teamsText = "", mapsUrl = "" } = {}) {
      const parsedTeams = parseTeamsText(teamsText);
      const sections = [];

      if (location) {
        sections.push(`⚽ ${location}`);
      }
      if (datetime) {
        sections.push(`🕒 ${datetime}`);
      }

      const teamsSection = [];
      if (parsedTeams.a.length > 0) {
        teamsSection.push(`🔵 Team A:\n${parsedTeams.a.join("\n")}`);
      }
      if (parsedTeams.b.length > 0) {
        teamsSection.push(`🔴 Team B:\n${parsedTeams.b.join("\n")}`);
      }
      if (teamsSection.length > 0) {
        sections.push(teamsSection.join("\n"));
      }

      if (mapsUrl) {
        sections.push(`📍 Location:\n${mapsUrl}`);
      }

      return sections.join("\n").replace(/\n{2,}/g, "\n").trim();
    }

    function parseTeamsText(teamsText) {
      const lines = String(teamsText || "").split("\n");
      let activeTeam = "a";
      const teams = { a: [], b: [] };

      lines.forEach((line) => {
        const cleanLine = sanitizeShareText(line);
        const normalizedLine = cleanLine.toLowerCase();

        if (normalizedLine === "team a:") {
          activeTeam = "a";
          return;
        }

        if (normalizedLine === "team b:") {
          activeTeam = "b";
          return;
        }

        if (cleanLine.startsWith("- ")) {
          const playerName = sanitizeShareText(cleanLine.slice(2));
          if (playerName) {
            teams[activeTeam].push(playerName);
          }
          return;
        }

        if (cleanLine) {
          teams[activeTeam].push(cleanLine);
        }
      });

      return teams;
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
