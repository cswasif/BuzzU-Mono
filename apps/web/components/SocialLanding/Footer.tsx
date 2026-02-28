import React from 'react';
import { useTheme } from '../ThemeContext';

const footerLinks = [
  { href: "https://about.x.com", label: "About" },
  { href: "https://help.x.com/using-x/download-the-x-app", label: "Download the BuzzU app" },
  { href: "https://help.x.com", label: "Help Center" },
  { href: "https://x.com/tos", label: "Terms of Service" },
  { href: "https://x.com/privacy", label: "Privacy Policy" },
  { href: "https://support.x.com/articles/20170514", label: "Cookie Policy" },
  { href: "https://help.x.com/resources/accessibility", label: "Accessibility" },
  { href: "https://business.x.com/en/help/troubleshooting/how-twitter-ads-work.html?ref=web-twc-ao-gbl-adsinfo&utm_source=twc&utm_medium=web&utm_campaign=ao&utm_content=adsinfo", label: "Ads info" },
  { href: "https://blog.x.com", label: "Blog" },
  { href: "https://careers.x.com", label: "Careers" },
  { href: "https://about.x.com/press/brand-assets", label: "Brand Resources" },
  { href: "https://ads.x.com/?ref=gl-tw-tw-twitter-advertise", label: "Advertising" },
  { href: "https://marketing.x.com", label: "Marketing" },
  { href: "https://developer.x.com", label: "Developers" },
  { href: "https://x.com/i/jf/stories/home", label: "News" },
  { href: "/settings", label: "Settings" },
];

export const Footer = () => {
  const { colors } = useTheme();

  return (
    <nav aria-label="Footer" role="navigation" className="css-175oi2r r-18u37iz r-1w6e6rj r-3pj75a r-1777fci r-1mmae3n" id="component">
      {footerLinks.map((link) => (
        <div key={link.label} className="css-175oi2r r-1kihuf0 r-l00any r-o59np7 r-1awozwy r-18u37iz">
          <a href={link.href} dir="ltr" rel={link.href.startsWith('http') ? "noopener noreferrer nofollow" : undefined} target={link.href.startsWith('http') ? "_blank" : undefined} role="link" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1gkfh8e r-56xrmm r-16dba41 r-1loqt21" style={{ color: colors.textSecondary }}>
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">{link.label}</span>
          </a>
          <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-a023e6 r-rjixqe r-16dba41 r-15jbc68 r-1noe1sz" style={{ color: colors.textSecondary }}>
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3"> </span>
            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">|</span>
          </div>
        </div>
      ))}
      <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1gkfh8e r-56xrmm r-16dba41 r-1kihuf0 r-l00any r-o59np7" style={{ color: colors.textSecondary }}>
        <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">© 2026 BuzzU Corp.</span>
      </div>
    </nav>
  );
};
