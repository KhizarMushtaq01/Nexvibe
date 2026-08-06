// pages/Privacy.jsx
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiShield, FiLock, FiDatabase, FiShare2, FiMail, FiGlobe } from 'react-icons/fi';
import PublicHeader from '../components/common/PublicHeader';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8 transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="bg-[var(--bg-secondary)] rounded-3xl border border-[var(--border)] p-6 sm:p-10">
          <div className="flex items-center gap-3 mb-4">
            <FiShield className="w-8 h-8 text-pink-500" />
            <h1 className="text-3xl sm:text-4xl font-black">Privacy Policy</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4 mb-8">
              <p className="text-sm text-green-800 dark:text-green-200">
                🔒 Your privacy is important to us. This policy explains how we collect, use, and protect your personal information.
              </p>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <FiDatabase className="w-5 h-5" /> Information We Collect
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">We collect information you provide directly to us:</p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li><strong>Account Information:</strong> Name, email address, phone number, username, password</li>
                <li><strong>Profile Information:</strong> Profile photo, bio, website, location</li>
                <li><strong>Content:</strong> Photos, videos, stories, comments, messages you post</li>
                <li><strong>Communications:</strong> Messages you send to other users</li>
                <li><strong>Payment Information:</strong> If you make purchases (we use secure third-party processors)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <FiGlobe className="w-5 h-5" /> Automatically Collected Information
              </h2>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li><strong>Usage Data:</strong> How you interact with our service</li>
                <li><strong>Device Information:</strong> IP address, browser type, operating system</li>
                <li><strong>Location Data:</strong> Approximate location based on IP address</li>
                <li><strong>Cookies:</strong> Small text files stored on your device</li>
                <li><strong>Log Data:</strong> Time and date of access, pages viewed</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <FiShare2 className="w-5 h-5" /> How We Use Your Information
              </h2>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Provide, maintain, and improve our services</li>
                <li>Process transactions and send related information</li>
                <li>Send technical notices, updates, and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Personalize your experience and show relevant content</li>
                <li>Monitor and analyze trends, usage, and activities</li>
                <li>Detect, investigate, and prevent fraudulent transactions</li>
                <li>Protect the rights and safety of users and the public</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <FiLock className="w-5 h-5" /> Data Security
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>End-to-end encryption for direct messages</li>
                <li>Secure HTTPS/TLS protocols for data transmission</li>
                <li>Regular security audits and penetration testing</li>
                <li>Access controls and authentication requirements</li>
                <li>Data encryption at rest and in transit</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Information Sharing</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                We do not sell your personal information. We may share information in these circumstances:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li><strong>With your consent:</strong> When you direct us to share</li>
                <li><strong>Service providers:</strong> Companies that help us operate our service</li>
                <li><strong>Legal requirements:</strong> To comply with laws or respond to legal requests</li>
                <li><strong>Business transfers:</strong> In connection with a merger or acquisition</li>
                <li><strong>Public information:</strong> Content you share publicly is visible to all users</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Your Rights and Choices</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">Depending on your location, you may have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Access and receive a copy of your data</li>
                <li>Correct inaccurate information</li>
                <li>Delete your account and associated data</li>
                <li>Object to certain data processing</li>
                <li>Withdraw consent at any time</li>
                <li>Opt-out of marketing communications</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Cookies and Tracking</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                We use cookies and similar technologies to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Keep you logged in</li>
                <li>Remember your preferences</li>
                <li>Analyze site traffic and usage</li>
                <li>Personalize content and ads</li>
              </ul>
              <p className="text-[var(--text-secondary)] leading-relaxed mt-3">
                You can control cookies through your browser settings. However, disabling cookies may affect service functionality.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Data Retention</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                We retain your information as long as your account is active or as needed to provide services. After account deletion, we may retain certain information for legal obligations, fraud prevention, or legitimate business purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Children's Privacy</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                NexVibe is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">International Data Transfers</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for such transfers in compliance with applicable laws.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <FiMail className="w-5 h-5" /> Contact Us
              </h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                For privacy-related questions or to exercise your rights:
              </p>
              <div className="mt-3 p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)]">
                <p className="text-sm">📧 Email: privacy@nexvibe.com</p>
                <p className="text-sm mt-2">🌐 Web: nexvibe.com/privacy-request</p>
                <p className="text-sm mt-2">📞 Privacy Hotline: 1-800-SOCIAL-PRIVACY</p>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--text-muted)] text-center">
                This Privacy Policy is effective as of {new Date().toLocaleDateString()}. We will notify you of any material changes by posting the new policy on this page.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}