import readabilitySource from "@mozilla/readability/Readability.js?raw";
import turndownSource from "turndown/dist/turndown.js?raw";

export function buildReadablePageScript(maxChars: number) {
  return `(() => {
    ${readabilitySource}
    ${turndownSource}

    const maxChars = ${Math.min(Math.max(maxChars, 200), 120000)};
    const normalizeText = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const escapeForSelector = (value) => {
      if (!value) return "";
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return String(value).replace(/["\\\\]/g, "\\\\$&");
    };
    const describeNode = (element) => {
      const id = element.getAttribute("id");
      const name = element.getAttribute("name");
      const type = element.getAttribute("type");
      const parts = [element.tagName.toLowerCase()];

      if (id) {
        parts.push(\`#\${escapeForSelector(id)}\`);
        return parts.join("");
      }

      if (name) parts.push(\`[name="\${escapeForSelector(name)}"]\`);
      if (type) parts.push(\`[type="\${escapeForSelector(type)}"]\`);

      const role = element.getAttribute("role");
      if (role) parts.push(\`[role="\${escapeForSelector(role)}"]\`);

      const parent = element.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === element.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(element) + 1;
          parts.push(\`:nth-of-type(\${index})\`);
        }
      }

      return parts.join("");
    };
    const collectLinks = () => {
      const seen = new Set();
      return Array.from(document.querySelectorAll("a[href]"))
        .map((anchor) => ({
          href: anchor.href,
          text: normalizeText(anchor.innerText || anchor.textContent),
          rel: anchor.rel || "",
          target: anchor.target || "",
          selector: describeNode(anchor),
        }))
        .filter((link) => {
          const key = \`\${link.href}::\${link.text}\`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    };
    const absolutizeAttribute = (element, attributeName) => {
      const rawValue = element.getAttribute(attributeName);
      if (!rawValue) return;
      try {
        element.setAttribute(attributeName, new URL(rawValue, location.href).href);
      } catch {
        // Ignore invalid URLs and leave the original attribute untouched.
      }
    };
    const absolutizeLinksAndMedia = (root) => {
      Array.from(root.querySelectorAll("a[href]")).forEach((element) =>
        absolutizeAttribute(element, "href")
      );
      Array.from(root.querySelectorAll("img[src], source[src], video[src], audio[src], iframe[src]")).forEach(
        (element) => absolutizeAttribute(element, "src")
      );
      Array.from(root.querySelectorAll("video[poster]")).forEach((element) =>
        absolutizeAttribute(element, "poster")
      );
    };
    const buildLinksSection = (links) => {
      const section = document.createElement("section");
      const heading = document.createElement("h2");
      const list = document.createElement("ul");

      heading.textContent = "All Links";
      section.appendChild(heading);

      links.forEach((link) => {
        const item = document.createElement("li");
        const anchor = document.createElement("a");

        anchor.href = link.href;
        anchor.textContent = link.text || link.href;
        item.appendChild(anchor);
        list.appendChild(item);
      });

      section.appendChild(list);
      return section;
    };

    const readableDocument = document.cloneNode(true);
    const article = new Readability(readableDocument, {
      serializer: (node) => node,
    }).parse();
    const wrapper = document.createElement("article");
    const links = collectLinks();
    let source = "fallback";

    if (article?.title) {
      const title = document.createElement("h1");
      title.textContent = article.title;
      wrapper.appendChild(title);
    }

    if (article?.content && typeof article.content.cloneNode === "function") {
      source = "readability";
      const contentRoot = article.content.cloneNode(true);
      absolutizeLinksAndMedia(contentRoot);
      wrapper.appendChild(contentRoot);
    } else if (document.body) {
      const fallbackRoot = document.body.cloneNode(true);
      absolutizeLinksAndMedia(fallbackRoot);
      wrapper.appendChild(fallbackRoot);
    }

    if (links.length > 0) {
      wrapper.appendChild(buildLinksSection(links));
    }

    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    turndownService.remove(["script", "style", "noscript"]);

    const markdownFull = turndownService.turndown(wrapper.innerHTML).trim();
    const markdown =
      markdownFull.length <= maxChars
        ? markdownFull
        : \`\${markdownFull.slice(0, maxChars)}...\`;
    const fallbackText = normalizeText(document.body?.innerText || "").slice(0, maxChars);
    const text = markdown || fallbackText;

    return {
      title: article?.title || document.title || "",
      excerpt: article?.excerpt || "",
      byline: article?.byline || "",
      siteName: article?.siteName || "",
      publishedTime: article?.publishedTime || null,
      markdown: text,
      text,
      links,
      truncated: markdownFull.length > maxChars,
      source,
    };
  })()`;
}

export function buildInteractiveElementsScript() {
  return `(() => {
    const normalizeText = (value) =>
      (value || "").replace(/\\s+/g, " ").trim();
    const escapeForSelector = (value) => {
      if (!value) return "";
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return String(value).replace(/["\\\\]/g, "\\\\$&");
    };

    const describeNode = (element) => {
      const id = element.getAttribute("id");
      const name = element.getAttribute("name");
      const type = element.getAttribute("type");
      const parts = [element.tagName.toLowerCase()];

      if (id) {
        parts.push(\`#\${escapeForSelector(id)}\`);
        return parts.join("");
      }

      if (name) parts.push(\`[name="\${escapeForSelector(name)}"]\`);
      if (type) parts.push(\`[type="\${escapeForSelector(type)}"]\`);

      const role = element.getAttribute("role");
      if (role) parts.push(\`[role="\${escapeForSelector(role)}"]\`);

      const parent = element.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === element.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(element) + 1;
          parts.push(\`:nth-of-type(\${index})\`);
        }
      }

      return parts.join("");
    };

    const links = Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
      href: anchor.href,
      text: normalizeText(anchor.innerText || anchor.textContent),
      rel: anchor.rel || "",
      target: anchor.target || "",
      selector: describeNode(anchor)
    }));

    const buttons = Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]')
    ).map((button) => ({
      tag: button.tagName.toLowerCase(),
      type: button.getAttribute("type") || "",
      text: normalizeText(
        button.innerText ||
          button.textContent ||
          button.getAttribute("value") ||
          button.getAttribute("aria-label")
      ),
      name: button.getAttribute("name") || "",
      id: button.getAttribute("id") || "",
      selector: describeNode(button),
      disabled: Boolean(button.disabled || button.getAttribute("aria-disabled") === "true")
    }));

    const inputs = Array.from(
      document.querySelectorAll("input, textarea, select")
    )
      .filter((input) => {
        const type = (input.getAttribute("type") || "").toLowerCase();
        return !["hidden", "button", "submit", "reset", "image"].includes(type);
      })
      .map((input) => ({
        tag: input.tagName.toLowerCase(),
        type: input.getAttribute("type") || "",
        name: input.getAttribute("name") || "",
        id: input.getAttribute("id") || "",
        placeholder: input.getAttribute("placeholder") || "",
        label: normalizeText(
          input.getAttribute("aria-label") ||
            (input.labels
              ? Array.from(input.labels)
                  .map((label) => label.innerText || label.textContent || "")
                  .join(" ")
              : "")
        ),
        selector: describeNode(input),
        required: input.required || false,
        disabled: input.disabled || false
      }));

    return { links, buttons, inputs };
  })()`;
}

export function buildMetadataScript() {
  return `(() => {
    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      "";
    const canonical =
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") || null;
    return {
      title: document.title || "",
      description,
      canonical,
      lang: document.documentElement?.lang || null,
      url: location.href
    };
  })()`;
}

export function buildCaptchaDetectionScript() {
  return `(() => {
    const normalizeText = (value) =>
      (value || "").replace(/\\s+/g, " ").trim();
    const bodyText = normalizeText(document.body?.innerText || "").toLowerCase();
    const title = normalizeText(document.title || "").toLowerCase();
    const url = String(location.href || "").toLowerCase();
    const captchaSelectors = [
      "iframe[src*=\\"recaptcha\\"]",
      "iframe[src*=\\"hcaptcha\\"]",
      "iframe[src*=\\"challenges.cloudflare.com\\"]",
      ".g-recaptcha",
      ".h-captcha",
      "[data-sitekey]",
      "input[name=\\"captcha\\"]",
      "input#captcha",
      "#captcha",
      "[id*=\\"captcha\\" i]",
      "[class*=\\"captcha\\" i]"
    ];
    const selector = captchaSelectors.find((candidate) =>
      Boolean(document.querySelector(candidate))
    );
    const phrases = [
      "verify you are human",
      "verify that you are human",
      "checking if the site connection is secure",
      "complete the security check",
      "unusual traffic",
      "our systems have detected unusual traffic",
      "type the characters you see",
      "enter the characters you see"
    ];
    const phrase = phrases.find((candidate) =>
      bodyText.includes(candidate) || title.includes(candidate)
    );
    const googleSorry = /(^|\\.)google\\.[^/]+\\/sorry\\//.test(url);
    const cloudflareChallenge =
      url.includes("/cdn-cgi/challenge-platform/") ||
      title.includes("just a moment");
    const hasCaptcha = Boolean(selector || phrase || googleSorry || cloudflareChallenge);
    return {
      hasCaptcha,
      reason: selector || phrase || (googleSorry ? "google sorry captcha" : "") || (cloudflareChallenge ? "cloudflare challenge" : ""),
      pageUrl: location.href,
      pageTitle: document.title || ""
    };
  })()`;
}

export function buildSearchResultsScript(engine: string, limit: number) {
  return `(() => {
    const engine = ${JSON.stringify(engine)};
    const limit = ${Math.min(Math.max(limit, 1), 25)};
    const normalizeText = (value) =>
      (value || "").replace(/\\s+/g, " ").trim();
    const toAbsoluteUrl = (value) => {
      if (!value) return "";
      try {
        return new URL(value, location.href).href;
      } catch {
        return "";
      }
    };
    const isVisible = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textFromSelectors = (root, selectors) => {
      for (const selector of selectors) {
        const candidate = root.querySelector(selector);
        const text = normalizeText(
          candidate?.innerText ||
            candidate?.textContent ||
            candidate?.getAttribute?.("content")
        );
        if (text) return text;
      }
      return "";
    };
    const isSearchEngineInternalUrl = (href) => {
      if (!href) return true;
      if (
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return true;
      }
      try {
        const parsed = new URL(href, location.href);
        if (!/^https?:$/.test(parsed.protocol)) return true;
        if (engine === "google") {
          return /(^|\\.)google\\./i.test(parsed.hostname) && parsed.pathname !== "/url";
        }
        if (engine === "duckduckgo") {
          return /(^|\\.)duckduckgo\\.com$/i.test(parsed.hostname) && !parsed.pathname.startsWith("/l/");
        }
        if (engine === "brave") {
          return /(^|\\.)search\\.brave\\.com$/i.test(parsed.hostname);
        }
        return false;
      } catch {
        return true;
      }
    };
    const unwrapResultUrl = (href) => {
      try {
        const parsed = new URL(href, location.href);
        if (
          engine === "duckduckgo" &&
          /(^|\\.)duckduckgo\\.com$/i.test(parsed.hostname) &&
          parsed.pathname.startsWith("/l/")
        ) {
          return parsed.searchParams.get("uddg") || parsed.searchParams.get("rut") || parsed.href;
        }
        if (
          engine === "google" &&
          /(^|\\.)google\\./i.test(parsed.hostname) &&
          parsed.pathname === "/url"
        ) {
          return parsed.searchParams.get("url") || parsed.searchParams.get("q") || parsed.href;
        }
        return parsed.href;
      } catch {
        return href;
      }
    };
    const buildDisplayUrl = (href) => {
      try {
        const parsed = new URL(href, location.href);
        return parsed.hostname.replace(/^www\\./i, "") + parsed.pathname;
      } catch {
        return href;
      }
    };
    const seen = new Set();
    const results = [];
    const queryAnchorSelectors =
      engine === "google"
        ? "#search a[href] h3, #search a[href] h2, #search a[href] [role=\\"heading\\"]"
        : engine === "duckduckgo"
          ? "[data-testid=\\"result-title-a\\"], a[data-testid=\\"result-title-a\\"], a.result__a, h2 a[href], .result__title a[href], .results_links_deep a[href]"
          : "a.heading-serpresult, .snippet-title a[href], [data-type=\\"web\\"] a[href]";
    const addCandidate = (anchor, container, descriptionSelectors, displaySelectors) => {
      if (!anchor || !container) return;
      if (!isVisible(anchor) && !normalizeText(anchor.textContent)) return;

      const rawHref = toAbsoluteUrl(anchor.getAttribute("href") || anchor.href || "");
      if (!rawHref || isSearchEngineInternalUrl(rawHref)) return;
      const href = unwrapResultUrl(rawHref);
      if (!href || isSearchEngineInternalUrl(href)) return;

      const title = normalizeText(
        anchor.querySelector("h3, h2, [role=\\"heading\\"]")?.innerText ||
          anchor.querySelector("h3, h2, [role=\\"heading\\"]")?.textContent ||
          anchor.innerText ||
          anchor.textContent ||
          container.querySelector("h3, h2, [role=\\"heading\\"]")?.innerText ||
          container.querySelector("h3, h2, [role=\\"heading\\"]")?.textContent
      );
      if (!title || title.length < 3) return;

      const description = textFromSelectors(container, descriptionSelectors);
      const displayUrl =
        textFromSelectors(container, displaySelectors) || buildDisplayUrl(href);
      const key = href + "::" + title;
      if (seen.has(key)) return;
      seen.add(key);

      results.push({
        engine,
        position: results.length + 1,
        url: href,
        title,
        description,
        displayUrl,
      });
    };

    if (engine === "google") {
      const containers = Array.from(
        document.querySelectorAll("#search .g, #search .tF2Cxc, #search div[data-ved]")
      );
      for (const container of containers) {
        const anchor = Array.from(container.querySelectorAll("a[href]")).find((candidate) =>
          candidate.querySelector("h3, h2, [role=\\"heading\\"]")
        );
        if (!anchor) continue;
        addCandidate(
          anchor,
          container,
          [".VwiC3b", ".yXK7lf", ".MUxGbd", ".s3v9rd", "[data-sncf=\\"1\\"]", ".hgKElc"],
          ["cite", ".tjvcx", ".iUh30", ".yuRUbf cite"]
        );
        if (results.length >= limit) break;
      }
    } else if (engine === "duckduckgo") {
      const containers = Array.from(
        document.querySelectorAll([
          "article[data-testid=\\"result\\"]",
          "[data-testid=\\"result\\"]",
          "[data-testid=\\"web-result\\"]",
          "li[data-layout=\\"organic\\"]",
          ".result",
          ".results_links",
          ".web-result",
          ".react-results--main article",
          "[data-testid=\\"mainline\\"] article"
        ].join(", "))
      );
      for (const container of containers) {
        const anchor =
          container.querySelector("[data-testid=\\"result-title-a\\"]") ||
          container.querySelector("a[data-testid=\\"result-title-a\\"]") ||
          container.querySelector("a.result__a") ||
          container.querySelector(".result__title a[href]") ||
          container.querySelector("h2 a[href]") ||
          Array.from(container.querySelectorAll("a[href]")).find((candidate) => {
            const text = normalizeText(candidate.innerText || candidate.textContent);
            const href = toAbsoluteUrl(candidate.getAttribute("href") || candidate.href || "");
            return text.length >= 3 && href && !isSearchEngineInternalUrl(href);
          });
        if (!anchor) continue;
        addCandidate(
          anchor,
          container,
          [
            ".result__snippet",
            "[data-result=\\"snippet\\"]",
            "[data-testid=\\"result-snippet\\"]",
            "[data-testid=\\"result-description\\"]",
            ".result-snippet",
            ".module__snippet",
            "[data-testid=\\"snippet\\"]",
            "p"
          ],
          [
            ".result__url",
            "[data-testid=\\"result-extras-url-link\\"]",
            "[data-testid=\\"result-url\\"]",
            ".result__extras__url",
            "cite"
          ]
        );
        if (results.length >= limit) break;
      }
    } else if (engine === "brave") {
      const containers = Array.from(
        document.querySelectorAll(".snippet.fdb, .snippet, .card[data-type=\\"web\\"], [data-type=\\"web\\"]")
      );
      for (const container of containers) {
        const anchor =
          container.querySelector("a.heading-serpresult") ||
          container.querySelector(".snippet-title a[href]") ||
          container.querySelector("a[href]");
        if (!anchor) continue;
        addCandidate(
          anchor,
          container,
          [".snippet-description", ".paragraph-2", ".description", ".snippet-content"],
          [".url", ".hostname", ".snippet-url", "cite"]
        );
        if (results.length >= limit) break;
      }
    }

    if (!results.length) {
      const fallbacks = Array.from(document.querySelectorAll("a[href]")).filter((anchor) => {
        if (anchor.querySelector("h3, h2, [role=\\"heading\\"]")) return true;
        if (engine !== "duckduckgo") return false;
        const text = normalizeText(anchor.innerText || anchor.textContent);
        const href = toAbsoluteUrl(anchor.getAttribute("href") || anchor.href || "");
        return text.length >= 3 && href && !isSearchEngineInternalUrl(href);
      });
      for (const anchor of fallbacks) {
        const container =
          anchor.closest("article, .result, .results_links, .web-result, .snippet, .g, .tF2Cxc, [data-ved], [data-testid=\\"result\\"], [data-testid=\\"web-result\\"]") ||
          anchor.parentElement;
        if (!container) continue;
        addCandidate(
          anchor,
          container,
          [".VwiC3b", ".result__snippet", "[data-testid=\\"result-snippet\\"]", "[data-testid=\\"result-description\\"]", ".snippet-description", ".paragraph-2", "p", ".description"],
          ["cite", ".result__url", "[data-testid=\\"result-extras-url-link\\"]", ".url", ".hostname"]
        );
        if (results.length >= limit) break;
      }
    }

    const bodyText = normalizeText(document.body?.innerText || "").toLowerCase();
    const empty =
      bodyText.includes("did not match any documents") ||
      bodyText.includes("no results found") ||
      bodyText.includes("no results for");
    const hasResultAnchors = document.querySelectorAll(queryAnchorSelectors).length > 0;
    const hasFallbackAnchors = Array.from(document.querySelectorAll("a[href]")).some((anchor) =>
      anchor.querySelector("h3, h2, [role=\\"heading\\"]") ||
      (engine === "duckduckgo" &&
        normalizeText(anchor.innerText || anchor.textContent).length >= 3 &&
        !isSearchEngineInternalUrl(toAbsoluteUrl(anchor.getAttribute("href") || anchor.href || "")))
    );
    const blocked =
      bodyText.includes("verify you are human") ||
      bodyText.includes("verify that you are human") ||
      bodyText.includes("unusual traffic") ||
      bodyText.includes("captcha");
    const ready =
      results.length > 0 ||
      empty ||
      blocked ||
      (document.readyState === "complete" &&
        !hasResultAnchors &&
        !hasFallbackAnchors);

    return {
      engine,
      ready,
      empty,
      blocked,
      results,
      pageUrl: location.href,
      pageTitle: document.title || ""
    };
  })()`;
}
