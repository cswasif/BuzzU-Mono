import React, { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../../components/ThemeContext";
import { BuzzULogoIcon } from "../../components/SocialLanding/Icons";
import { Footer } from "../../components/SocialLanding/Footer";
import "../../styles.css";
import "./landing-info.css";

type InfoPageKey =
  | "about"
  | "download"
  | "help"
  | "terms"
  | "privacy"
  | "cookies"
  | "accessibility"
  | "ads-info"
  | "blog"
  | "careers"
  | "brand"
  | "advertising"
  | "marketing"
  | "developers"
  | "news"
  | "safety"
  | "guidelines"
  | "settings";

type InfoPageData = {
  key: InfoPageKey;
  path: string;
  title: string;
  subtitle: string;
  sections: Array<{ heading: string; items: string[] }>;
};

const INFO_PAGES: InfoPageData[] = [
  {
    key: "about",
    path: "/about",
    title: "About BuzzU",
    subtitle: "BRACU-born anonymous chat, open to everyone.",
    sections: [
      {
        heading: "What BuzzU is",
        items: [
          "BuzzU is an anonymous chat experience with video and text modes.",
          "The codebase includes optional BRAC University Google verification and a guest anonymous mode.",
          "Matching supports interests and queue-based room matching."
        ]
      },
      {
        heading: "What is live in product",
        items: [
          "Start from /verify, then continue to /chat/new.",
          "Users can switch chat mode, manage interests, and set wait duration.",
          "The dashboard includes DM, profile controls, and safety/report actions."
        ]
      }
    ]
  },
  {
    key: "download",
    path: "/download",
    title: "Download BuzzU",
    subtitle: "Use BuzzU directly in your browser today.",
    sections: [
      {
        heading: "Current availability",
        items: [
          "BuzzU runs as a browser app and includes a web manifest for installable experience.",
          "No separate native app package is defined in this repository yet."
        ]
      }
    ]
  },
  {
    key: "help",
    path: "/help",
    title: "Help Center",
    subtitle: "How to start, match, and stay safe on BuzzU.",
    sections: [
      {
        heading: "Getting started",
        items: [
          "Open /verify and continue with Google verification or guest mode.",
          "Use /chat/new to begin matching."
        ]
      },
      {
        heading: "Matching basics",
        items: [
          "Pick video or text mode.",
          "Add interests for better matches.",
          "Use verified-only and wait duration options where available."
        ]
      },
      {
        heading: "Safety actions",
        items: [
          "You can report users from chat/video flows.",
          "You can block users from profile actions."
        ]
      }
    ]
  },
  {
    key: "terms",
    path: "/terms",
    title: "Terms of Service",
    subtitle: "Core rules for using BuzzU.",
    sections: [
      {
        heading: "Eligibility and account modes",
        items: [
          "BuzzU provides both guest anonymous mode and optional BRACU Google verification mode.",
          "Do not impersonate or misuse identity information."
        ]
      },
      {
        heading: "Acceptable use",
        items: [
          "No harassment, threats, hate, or non-consensual sexual content.",
          "No scams, malware distribution, or illegal activity."
        ]
      },
      {
        heading: "Platform behavior",
        items: [
          "BuzzU may limit access for abusive behavior based on reports and moderation signals.",
          "Service behavior can change as the open-source project evolves."
        ]
      }
    ]
  },
  {
    key: "privacy",
    path: "/privacy",
    title: "Privacy Policy",
    subtitle: "How BuzzU handles data in this web app.",
    sections: [
      {
        heading: "What we collect",
        items: [
          "Session and preference data needed to run the app, stored locally in your browser.",
          "Profile details you provide, such as display name and avatar selections.",
          "Connection and matchmaking metadata needed to establish real-time chats."
        ]
      },
      {
        heading: "How we use data",
        items: [
          "Enable matching, chat features, and account preferences across sessions.",
          "Support safety actions like reporting, blocking, and abuse prevention.",
          "Maintain reliability through diagnostics and connection health checks."
        ]
      },
      {
        heading: "Storage and retention",
        items: [
          "Most app state lives in localStorage, sessionStorage, IndexedDB, and browser caches.",
          "Clearing local data resets your session, preferences, and stored assets.",
          "Guest mode keeps usage lightweight without requiring account linkage."
        ]
      },
      {
        heading: "Your choices",
        items: [
          "Use guest mode or verified mode depending on your comfort level.",
          "Clear local storage and cookies from the in-app reset actions.",
          "Leave chats at any time and use blocking/reporting controls."
        ]
      },
      {
        heading: "Updates and contact",
        items: [
          "This policy may evolve as the product and services change.",
          "Reach out through official BuzzU project channels for privacy questions."
        ]
      }
    ]
  },
  {
    key: "cookies",
    path: "/cookies",
    title: "Cookie Policy",
    subtitle: "Cookie and local browser storage information.",
    sections: [
      {
        heading: "Storage usage",
        items: [
          "BuzzU may use browser cookies and local storage as part of session and app functionality.",
          "Reset actions in app settings include clearing cookies and other local data."
        ]
      }
    ]
  },
  {
    key: "accessibility",
    path: "/accessibility",
    title: "Accessibility",
    subtitle: "Improving access for all BuzzU users.",
    sections: [
      {
        heading: "Current practices",
        items: [
          "UI components include ARIA roles and labels across modals, controls, and chat flows.",
          "Keyboard focus states and semantic labels are present in many interactive components."
        ]
      },
      {
        heading: "Ongoing work",
        items: [
          "Accessibility is continuously improved as part of active development.",
          "Report accessibility issues through the project channels."
        ]
      }
    ]
  },
  {
    key: "ads-info",
    path: "/ads-info",
    title: "Ads Info",
    subtitle: "Advertising and promotion status on BuzzU.",
    sections: [
      {
        heading: "Current status",
        items: [
          "This repository does not define a dedicated ad delivery module in the landing flow.",
          "Any future advertising policy updates will be published on this page."
        ]
      }
    ]
  },
  {
    key: "blog",
    path: "/blog",
    title: "BuzzU Blog",
    subtitle: "Product updates and stories.",
    sections: [
      {
        heading: "Current status",
        items: [
          "A full blog system is not yet defined in this repository.",
          "Use this page as the official placeholder for future updates."
        ]
      }
    ]
  },
  {
    key: "careers",
    path: "/careers",
    title: "Careers",
    subtitle: "Work with the BuzzU team.",
    sections: [
      {
        heading: "Current status",
        items: [
          "No dedicated careers application flow is defined in this repository yet.",
          "Open-source contributions are a current way to collaborate."
        ]
      }
    ]
  },
  {
    key: "brand",
    path: "/brand",
    title: "Brand Resources",
    subtitle: "BuzzU name and visual identity usage.",
    sections: [
      {
        heading: "Brand basics",
        items: [
          "Use the BuzzU name and icon without implying official partnership unless approved.",
          "Do not alter brand usage in ways that mislead users."
        ]
      }
    ]
  },
  {
    key: "advertising",
    path: "/advertising",
    title: "Advertising",
    subtitle: "Promote with BuzzU.",
    sections: [
      {
        heading: "Current status",
        items: [
          "No public advertising onboarding flow is defined in this repository yet.",
          "Future advertiser details will be published here."
        ]
      }
    ]
  },
  {
    key: "marketing",
    path: "/marketing",
    title: "Marketing",
    subtitle: "BuzzU marketing programs and assets.",
    sections: [
      {
        heading: "Current status",
        items: [
          "This page is reserved for official marketing initiatives and campaign references.",
          "No standalone marketing portal is defined in current app routes."
        ]
      }
    ]
  },
  {
    key: "developers",
    path: "/developers",
    title: "Developers",
    subtitle: "Technical ecosystem around BuzzU.",
    sections: [
      {
        heading: "Codebase reality",
        items: [
          "BuzzU includes web app, worker services, and shared packages in a monorepo.",
          "Open-source development is active and route/features evolve over time."
        ]
      }
    ]
  },
  {
    key: "news",
    path: "/news",
    title: "News",
    subtitle: "Official announcements from BuzzU.",
    sections: [
      {
        heading: "Current status",
        items: [
          "This page is the placeholder for future official announcements and release notes."
        ]
      }
    ]
  },
  {
    key: "safety",
    path: "/safety",
    title: "Safety Center",
    subtitle: "Tools and practices for safer conversations on BuzzU.",
    sections: [
      {
        heading: "Built-in controls",
        items: [
          "Report actions are available in chat and video matching flows.",
          "Block actions are available in profile/moderation controls.",
          "Users can skip matches and leave rooms quickly."
        ]
      },
      {
        heading: "Safety guidance",
        items: [
          "Do not share sensitive personal information.",
          "Leave and report immediately if behavior is abusive."
        ]
      }
    ]
  },
  {
    key: "guidelines",
    path: "/guidelines",
    title: "Community Guidelines",
    subtitle: "Expected behavior in BuzzU conversations.",
    sections: [
      {
        heading: "Respect first",
        items: [
          "Be respectful and avoid harassment, hate, or bullying.",
          "Do not share explicit, violent, or illegal content."
        ]
      },
      {
        heading: "Privacy and consent",
        items: [
          "Do not dox, threaten, or pressure users.",
          "Respect boundaries and end chats when consent is withdrawn."
        ]
      }
    ]
  },
  {
    key: "settings",
    path: "/settings",
    title: "Settings",
    subtitle: "How to access settings in the current BuzzU app.",
    sections: [
      {
        heading: "Where settings live",
        items: [
          "Primary settings are available inside the chat dashboard after entering /chat/new.",
          "Profile, interests, theme, and account cleanup actions are provided there."
        ]
      }
    ]
  }
];

const INFO_PAGE_MAP = new Map(INFO_PAGES.map((page) => [page.path, page]));
const BASE_URL = "https://buzzu.wasif.app";

export default function LandingInfoPage() {
  const location = useLocation();
  const { colors, theme } = useTheme();

  const page = useMemo(() => {
    return INFO_PAGE_MAP.get(location.pathname) ?? INFO_PAGE_MAP.get("/about")!;
  }, [location.pathname]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const title = `${page.title} | BuzzU`;
    const description = page.subtitle;
    const canonicalUrl = `${BASE_URL}${page.path}`;

    document.title = title;

    const setMetaTag = (key: string, value: string, attr: "name" | "property") => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", value);
    };

    setMetaTag("description", description, "name");
    setMetaTag("og:title", title, "property");
    setMetaTag("og:description", description, "property");
    setMetaTag("og:url", canonicalUrl, "property");
    setMetaTag("twitter:title", title, "name");
    setMetaTag("twitter:description", description, "name");

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);
  }, [page.path, page.subtitle, page.title]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.add("info-page");
    return () => {
      document.documentElement.classList.remove("info-page");
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const updateFooterHeight = () => {
      const footer = document.querySelector('nav[aria-label="Footer"]');
      if (!footer) {
        return;
      }
      const height = Math.ceil(footer.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--info-footer-height", `${height}px`);
    };

    updateFooterHeight();
    const frameId = window.requestAnimationFrame(updateFooterHeight);
    const timerId = window.setTimeout(updateFooterHeight, 150);
    const footer = document.querySelector('nav[aria-label="Footer"]');
    const observer = footer ? new ResizeObserver(updateFooterHeight) : null;
    if (footer && observer) {
      observer.observe(footer);
    }
    window.addEventListener("resize", updateFooterHeight);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
      observer?.disconnect();
      window.removeEventListener("resize", updateFooterHeight);
    };
  }, []);

  return (
    <div
      className={`landing-root-bg theme-${theme} info-page-root`}
      data-theme={theme}
    >
      <div className="cinematic-grain"></div>
      
      <main className="info-page-main">
        <div className="info-page-card">
          <div className="info-page-header">
            <div className="info-brand">
              <BuzzULogoIcon style={{ color: colors.accent, width: "32px", height: "32px" }} />
              <span className="info-brand-text">BuzzU</span>
            </div>

            <h1 className="info-title">{page.title}</h1>
            <p className="info-subtitle">{page.subtitle}</p>
          </div>

          <div className="info-nav">
            <Link to="/" className="info-btn info-btn-secondary">
              Back to Landing
            </Link>
            <Link to="/verify" className="info-btn info-btn-primary">
              Start Buzzing
            </Link>
          </div>

          <div className="info-content">
            {page.sections.map((section) => (
              <section key={section.heading} className="info-section">
                <h2 className="info-section-title">{section.heading}</h2>
                <ul className="info-list">
                  {section.items.map((item) => (
                    <li key={item} className="info-list-item">{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
