import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply when you use Ikarvo.',
  alternates: { canonical: '/terms' },
};

const UPDATED = 'November 20, 2026';
const CONTACT = 'chiragkoshti3101+legal@gmail.com';

export default function Terms() {
  return <div className="legal">
    <nav className="lnav" aria-label="Main">
      <Link href="/" className="wordmark">Ikar<em>vo</em></Link>
      <div className="lnav-links"><Link href="/privacy">Privacy</Link><Link prefetch={false} href="/app" className="btn primary">Open workspace</Link></div>
    </nav>
    <main className="legal-body">
      <span className="legal-meta">Last updated {UPDATED}</span>
      <div className="prose">
        <h1>Terms of Service</h1>
        <p>These terms cover your use of Ikarvo. By creating an account or using the workspace you agree to them. If you do not agree, do not use the service.</p>

        <h2>Your account</h2>
        <ul>
          <li>You need an account to use the workspace. You can sign up with an email address or with Google.</li>
          <li>Keep your credentials secure and tell us promptly if you believe your account was accessed without permission.</li>
          <li>You are responsible for activity under your account, including anything your team members do.</li>
          <li>You must be at least 13 years old, and old enough to enter a contract where you live.</li>
        </ul>

        <h2>Credits and plans</h2>
        <p>Each plan includes a monthly credit allowance. AI actions spend credits at a fixed cost, and failed calls are refunded. Paid plans, prices and renewal terms are shown at checkout and charged through Stripe. You can cancel at any time; access continues to the end of the paid period.</p>

        <h2>Your content and generated output</h2>
        <ul>
          <li>You keep ownership of the prompts, files and brand material you bring, and of the apps, copy and assets generated for you.</li>
          <li>You give us the limited permission needed to store, process and display that content so the product can work.</li>
          <li>Generated output can be wrong or incomplete. Review it before you publish, deploy or spend money on it. AI output may resemble material produced for other users, so check rights before commercial use.</li>
        </ul>

        <h2>Acceptable use</h2>
        <p>Do not use Ikarvo to break the law, infringe intellectual property, distribute malware, send spam, scrape personal data, impersonate others, or attack the service or other users. Do not attempt to bypass credit metering, rate limits or access controls. We may suspend or close an account that does this.</p>

        <h2>Third-party services</h2>
        <p>Ikarvo can connect to services you own, such as GitHub, Vercel, Stripe, Meta, X and LinkedIn. Your use of those services is governed by their terms, and actions you trigger there (commits, deployments, posts, ad spend) are your responsibility. We are not responsible for third-party outages or policy decisions.</p>

        <h2>Availability and changes</h2>
        <p>We work to keep the service available, but it is provided &quot;as is&quot; without warranties. Features may change, and we may suspend the service for maintenance. We are not liable for indirect, incidental or consequential losses, or for lost profits or data, to the extent the law allows. Our total liability is limited to the amount you paid us in the three months before the claim.</p>

        <h2>Ending the agreement</h2>
        <p>You can stop using Ikarvo and delete your account at any time. We may suspend or end access if these terms are broken or if required by law. Sections that by their nature survive termination, such as content ownership, disclaimers and liability limits, continue to apply.</p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law rules.</p>

        <h2>Contact</h2>
        <p>Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </div>
    </main>
    <footer className="lfoot"><span className="wordmark">Ikar<em>vo</em></span><nav aria-label="Footer"><Link href="/">Home</Link><Link href="/privacy">Privacy</Link><Link prefetch={false} href="/app">Sign in</Link></nav><span className="muted small">© {new Date().getFullYear()} Ikarvo</span></footer>
  </div>;
}
