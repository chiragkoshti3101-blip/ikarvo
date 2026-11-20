import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Ikarvo collects, why, who processes it, and how to have it deleted.',
  alternates: { canonical: '/privacy' },
};

const UPDATED = 'November 20, 2026';
const CONTACT = 'chiragkoshti3101@gmail.com';

export default function Privacy() {
  return <div className="legal">
    <nav className="lnav" aria-label="Main">
      <Link href="/" className="wordmark">Ikar<em>vo</em></Link>
      <div className="lnav-links"><Link href="/terms">Terms</Link><Link prefetch={false} href="/app" className="btn primary">Open workspace</Link></div>
    </nav>
    <main className="legal-body">
      <span className="legal-meta">Last updated {UPDATED}</span>
      <div className="prose">
        <h1>Privacy Policy</h1>
        <p>Ikarvo is a workspace for building, shipping and marketing software with AI. This policy explains what we collect, why we collect it, who processes it on our behalf, and what you can ask us to do with it. It applies to the Ikarvo web app and the marketing site.</p>

        <h2>What we collect</h2>
        <ul>
          <li><b>Account details.</b> Your email address and, if you sign in with Google, your Google account name and profile picture. Google tells us the email is verified; we never receive your Google password.</li>
          <li><b>Session data.</b> A signed authentication cookie that keeps you signed in. It is required for the product to work.</li>
          <li><b>Your workspace content.</b> Prompts you write, apps and copy that are generated, projects, campaigns, posts, uploaded brand files and settings you save.</li>
          <li><b>Billing data.</b> Plan, credit balance and credit history. Card details are handled by Stripe; we never see or store full card numbers.</li>
          <li><b>Operational logs.</b> Errors, request timing, IP address and user agent, kept so we can keep the service running and prevent abuse.</li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To sign you in, keep your session, and give you your workspace.</li>
          <li>To run the features you ask for: generating apps and copy, publishing to your GitHub and Vercel accounts when you connect them, rendering ads, and scheduling content.</li>
          <li>To meter credits and bill the plan you choose.</li>
          <li>To secure the service: rate limiting, abuse prevention and debugging.</li>
        </ul>
        <p>We do not sell your personal information, and we do not use your workspace content to train our own models.</p>

        <h2>Who processes data for us</h2>
        <p>We use a small set of service providers, each of which only receives what its function needs:</p>
        <ul>
          <li><b>Supabase</b>: database, file storage and authentication (including Google sign-in).</li>
          <li><b>Vercel</b>: application hosting.</li>
          <li><b>AI model providers</b> (for example OpenAI-compatible and Google Gemini endpoints): prompts and the content needed to answer them.</li>
          <li><b>Stripe</b>: subscription billing, when billing is enabled.</li>
          <li><b>GitHub, Vercel, Meta, X, LinkedIn and similar platforms</b>: only if you connect them, and only for the actions you trigger.</li>
        </ul>
        <p>Sign in with Google is provided by Google LLC and is subject to Google&apos;s own privacy policy.</p>

        <h2>Cookies</h2>
        <p>We set the authentication cookie that keeps you signed in. We do not use advertising cookies or third-party trackers on the app.</p>

        <h2>How long we keep it</h2>
        <p>Workspace content stays until you delete it or close your account. Authentication records and operational logs are kept for as long as needed for security and accounting, then removed. When you delete your account, your profile, workspace content and credit history are deleted with it.</p>

        <h2>Your choices</h2>
        <ul>
          <li>Ask for a copy of your data, or for it to be corrected or deleted, by emailing us.</li>
          <li>Delete your account from the workspace; this removes your data and revokes future access.</li>
          <li>Disconnect any integration (GitHub, Vercel, social accounts) at any time from the workspace.</li>
        </ul>
        <p>If you are in the United States, these choices include the rights described by state privacy laws such as the CCPA/CPRA. We do not discriminate against you for exercising them.</p>

        <h2>Children</h2>
        <p>Ikarvo is not directed to children under 13, and we do not knowingly collect their data.</p>

        <h2>Changes</h2>
        <p>If this policy changes materially we will post the new version here and update the date above.</p>

        <h2>Contact</h2>
        <p>Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </div>
    </main>
    <footer className="lfoot"><span className="wordmark">Ikar<em>vo</em></span><nav aria-label="Footer"><Link href="/">Home</Link><Link href="/terms">Terms</Link><Link prefetch={false} href="/app">Sign in</Link></nav><span className="muted small">© {new Date().getFullYear()} Ikarvo</span></footer>
  </div>;
}
