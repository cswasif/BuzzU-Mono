
import React from 'react';

const links = [
    { text: "About", url: "https://about.x.com" },
    { text: "Download the X app", url: "https://help.x.com/using-x/download-the-x-app" },
    { text: "Grok", url: "https://grok.com/" },
    { text: "Help Center", url: "https://help.x.com" },
    { text: "Terms of Service", url: "https://x.com/tos" },
    { text: "Privacy Policy", url: "https://x.com/privacy" },
    { text: "Cookie Policy", url: "https://support.x.com/articles/20170514" },
    { text: "Accessibility", url: "https://help.x.com/resources/accessibility" },
    { text: "Ads info", url: "https://business.x.com/en/help/troubleshooting/how-twitter-ads-work.html?ref=web-twc-ao-gbl-adsinfo&utm_source=twc&utm_medium=web&utm_campaign=ao&utm_content=adsinfo" },
    { text: "Blog", url: "https://blog.x.com" },
    { text: "Careers", url: "https://careers.x.com" },
    { text: "Brand Resources", url: "https://about.x.com/press/brand-assets" },
    { text: "Advertising", url: "https://ads.x.com/?ref=gl-tw-tw-twitter-advertise" },
    { text: "Marketing", url: "https://marketing.x.com" },
    { text: "X for Business", url: "https://business.x.com/?ref=web-twc-ao-gbl-twitterforbusiness&utm_source=twc&utm_medium=web&utm_campaign=ao&utm_content=twitterforbusiness" },
    { text: "Developers", url: "https://developer.x.com" },
    { text: "News", url: "https://x.com/i/jf/stories/home" },
    { text: "Settings", url: "/settings" },
];

export const FooterLinks = () => {
    return (
        <div className="css-175oi2r r-wfqgy4 r-zd22at" style={{ marginBottom: '0px' }}>
            <nav aria-label="Footer" role="navigation" className="css-175oi2r r-18u37iz r-1w6e6rj r-3pj75a r-1777fci r-1mmae3n">
                {links.map((link, index) => (
                    <div key={index} className="css-175oi2r r-1kihuf0 r-l00any r-o59np7 r-1awozwy r-18u37iz">
                        <a href={link.url} dir="ltr" rel="noopener noreferrer nofollow" target={link.url.startsWith('http') ? "_blank" : undefined} role="link" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1gkfh8e r-56xrmm r-16dba41 r-1loqt21" style={{ color: 'rgb(113, 118, 123)' }}>
                            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">{link.text}</span>
                        </a>
                        <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-a023e6 r-rjixqe r-16dba41 r-1q89gc9 r-1noe1sz">
                            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3"> </span>
                            <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">|</span>
                        </div>
                    </div>
                ))}

                <div dir="ltr" className="css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-1gkfh8e r-56xrmm r-16dba41 r-1kihuf0 r-l00any r-o59np7" style={{ color: 'rgb(113, 118, 123)' }}>
                    <span className="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3">© 2026 X Corp.</span>
                </div>
            </nav>
        </div>
    );
};
