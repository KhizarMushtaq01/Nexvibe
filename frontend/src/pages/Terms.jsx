// pages/Terms.jsx
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiAlertCircle, FiMail, FiMapPin } from 'react-icons/fi';
import PublicHeader from '../components/common/PublicHeader';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8 transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="bg-[var(--bg-secondary)] rounded-3xl border border-[var(--border)] p-6 sm:p-10">
          <h1 className="text-3xl sm:text-4xl font-black mb-4">Terms of Service</h1>
          <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-8">
              <div className="flex items-start gap-3">
                <FiAlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  By using NexVibe, you agree to these terms. Please read them carefully.
                </p>
              </div>
            </div>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                By accessing or using NexVibe, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any part of these terms, you may not use our service.
              </p>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                We reserve the right to update or modify these terms at any time without prior notice. Your continued use of NexVibe after any changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">2. Eligibility</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                You must be at least 13 years old to use NexVibe. By using our service, you represent and warrant that you meet this age requirement.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>You have the full power and authority to enter into this agreement</li>
                <li>You will not violate any laws or regulations</li>
                <li>You are not located in a country subject to US embargo</li>
                <li>You have not been previously suspended or removed from NexVibe</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">3. User Accounts</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                To access certain features, you must create an account. You are responsible for:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Maintaining the confidentiality of your password</li>
                <li>All activities that occur under your account</li>
                <li>Notifying us immediately of any unauthorized use</li>
                <li>Providing accurate and complete registration information</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">4. User Content</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                You retain all ownership rights to content you post on NexVibe. However, by posting content, you grant us a worldwide, non-exclusive, royalty-free license to:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Use, copy, reproduce, process, and distribute your content</li>
                <li>Modify and create derivative works</li>
                <li>Publicly perform and display your content</li>
                <li>Allow other users to share your content within the platform</li>
              </ul>
              <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4 mt-4 flex items-start gap-2">
                <FiAlertCircle className="w-4 h-4 text-yellow-800 dark:text-yellow-200 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  You are responsible for ensuring you have all necessary rights to any content you post. Do not post content that infringes on others' rights.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">5. Prohibited Conduct</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">You agree not to:</p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Post illegal, harmful, or offensive content</li>
                <li>Harass, bully, or threaten other users</li>
                <li>Impersonate others or provide false information</li>
                <li>Use automated bots or scrapers</li>
                <li>Share intimate images without consent</li>
                <li>Engage in spam or deceptive practices</li>
                <li>Violate intellectual property rights</li>
                <li>Attempt to hack or disrupt our service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">6. Termination</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                We reserve the right to suspend or terminate your account at our sole discretion, without notice, for conduct that violates these terms or is harmful to other users, us, or third parties.
              </p>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                You may delete your account at any time through your account settings. Upon termination, your license to use our service ends immediately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">7. Disclaimer of Warranties</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                NexVibe is provided "as is" without warranties of any kind. We do not guarantee that the service will be uninterrupted, error-free, or secure. Your use of the service is at your sole risk.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">8. Limitation of Liability</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                To the maximum extent permitted by law, NexVibe shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">9. Governing Law</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                These terms shall be governed by and construed in accordance with the laws of your jurisdiction, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">10. Contact Us</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                If you have any questions about these Terms, please contact us at:
              </p>
              <div className="mt-3 p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)]">
                <p className="text-sm flex items-center gap-1.5"><FiMail className="w-4 h-4 flex-shrink-0" /> Email: legal@nexvibe.com</p>
                <p className="text-sm mt-2 flex items-center gap-1.5"><FiMapPin className="w-4 h-4 flex-shrink-0" /> Address: 123 Social Street, Digital City, DC 12345</p>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-[var(--border)]">
              <div className="flex items-center gap-3 text-sm text-green-600 dark:text-green-400">
                <FiCheckCircle className="w-5 h-5" />
                <span>By using NexVibe, you acknowledge that you have read and understood these terms.</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}