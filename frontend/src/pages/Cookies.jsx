// pages/Cookies.jsx
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiX, FiSettings, FiInfo, FiMail, FiGlobe } from 'react-icons/fi';
import { useState } from 'react';
import PublicHeader from '../components/common/PublicHeader';

export default function Cookies() {
  const [cookiePreferences, setCookiePreferences] = useState({
    necessary: true,
    functional: true,
    analytics: false,
    marketing: false,
  });

  const togglePreference = (key) => {
    if (key !== 'necessary') {
      setCookiePreferences(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8 transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="bg-[var(--bg-secondary)] rounded-3xl border border-[var(--border)] p-6 sm:p-10">
          <div className="flex items-center gap-3 mb-4">
            <FiSettings className="w-8 h-8 text-pink-500" />
            <h1 className="text-3xl sm:text-4xl font-black">Cookie Policy</h1>
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {new Date().toLocaleDateString()}</p>

          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">What Are Cookies?</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                Cookies are small text files stored on your device when you visit websites. They help websites remember your preferences, analyze site usage, and provide personalized content. Think of them as a website's memory of your visit.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">How We Use Cookies</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-4">
                NexVibe uses cookies to enhance your experience, improve our services, and show relevant content. We categorize cookies as follows:
              </p>

              <div className="space-y-4">
                <div className="border border-[var(--border)] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">Necessary Cookies</h3>
                      <p className="text-xs text-[var(--text-muted)]">Always active</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <FiCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Essential for the website to function properly. These cookies enable core features like security, network management, and accessibility. You cannot disable these.
                  </p>
                </div>

                <div className="border border-[var(--border)] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">Functional Cookies</h3>
                      <p className="text-xs text-[var(--text-muted)]">Enhance your experience</p>
                    </div>
                    <button 
                      onClick={() => togglePreference('functional')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${cookiePreferences.functional ? 'bg-pink-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${cookiePreferences.functional ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Remember your preferences, language settings, and login details to provide a personalized experience.
                  </p>
                </div>

                <div className="border border-[var(--border)] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">Analytics Cookies</h3>
                      <p className="text-xs text-[var(--text-muted)]">Help us improve</p>
                    </div>
                    <button 
                      onClick={() => togglePreference('analytics')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${cookiePreferences.analytics ? 'bg-pink-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${cookiePreferences.analytics ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Collect anonymous data about how you use our site, helping us understand user behavior and improve our services.
                  </p>
                </div>

                <div className="border border-[var(--border)] rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-lg">Marketing Cookies</h3>
                      <p className="text-xs text-[var(--text-muted)]">Personalized content</p>
                    </div>
                    <button 
                      onClick={() => togglePreference('marketing')}
                      className={`w-12 h-6 rounded-full transition-colors relative ${cookiePreferences.marketing ? 'bg-pink-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${cookiePreferences.marketing ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Track your activity across websites to deliver targeted advertisements and measure ad campaign effectiveness.
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Third-Party Cookies</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                Some cookies are placed by third-party services we use:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li><strong>Google Analytics:</strong> Website analytics and usage tracking</li>
                <li><strong>Cloudflare:</strong> Security and performance optimization</li>
                <li><strong>Stripe/PayPal:</strong> Payment processing (if applicable)</li>
                <li><strong>Social Media Platforms:</strong> Sharing buttons and embedded content</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Managing Cookies</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                You can control and manage cookies in several ways:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                <li>Use our cookie preference center above</li>
                <li>Adjust your browser settings to block or delete cookies</li>
                <li>Use private/incognito browsing modes</li>
                <li>Install browser extensions for additional cookie control</li>
              </ul>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mt-4 flex items-start gap-2">
                <FiInfo className="w-4 h-4 text-blue-800 dark:text-blue-200 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Note: Blocking certain cookies may impact site functionality. Some features may not work as expected.
                </p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Cookie Duration</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-[var(--border)] rounded-xl">
                  <thead className="bg-[var(--bg-primary)]">
                    <tr>
                      <th className="text-left p-3 border-b border-[var(--border)]">Cookie Type</th>
                      <th className="text-left p-3 border-b border-[var(--border)]">Duration</th>
                      <th className="text-left p-3 border-b border-[var(--border)]">Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-3 border-b border-[var(--border)]">Session Cookies</td>
                      <td className="p-3 border-b border-[var(--border)]">Until browser closes</td>
                      <td className="p-3 border-b border-[var(--border)]">Temporary, for current session</td>
                    </tr>
                    <tr>
                      <td className="p-3 border-b border-[var(--border)]">Persistent Cookies</td>
                      <td className="p-3 border-b border-[var(--border)]">30 days - 2 years</td>
                      <td className="p-3 border-b border-[var(--border)]">Remember preferences between sessions</td>
                    </tr>
                    <tr>
                      <td className="p-3">Third-Party Cookies</td>
                      <td className="p-3">Varies by provider</td>
                      <td className="p-3">Set by external services</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Updates to This Policy</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                We may update this Cookie Policy periodically to reflect changes in technology or legal requirements. We'll notify you of significant changes through our website or email.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                If you have questions about our use of cookies, please contact:
              </p>
              <div className="mt-3 p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)]">
                <p className="text-sm flex items-center gap-1.5"><FiMail className="w-4 h-4 flex-shrink-0" /> Email: cookies@nexvibe.com</p>
                <p className="text-sm mt-2 flex items-center gap-1.5"><FiGlobe className="w-4 h-4 flex-shrink-0" /> Web: nexvibe.com/cookie-preferences</p>
              </div>
            </section>

            <div className="mt-8 pt-6 border-t border-[var(--border)]">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <button 
                  onClick={() => setCookiePreferences({ necessary: true, functional: true, analytics: true, marketing: true })}
                  className="px-4 py-2 bg-pink-500 text-white rounded-xl text-sm font-semibold hover:bg-pink-600 transition-colors"
                >
                  Accept All Cookies
                </button>
                <button 
                  onClick={() => setCookiePreferences({ necessary: true, functional: false, analytics: false, marketing: false })}
                  className="px-4 py-2 border border-[var(--border)] rounded-xl text-sm font-semibold hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  Reject Non-Essential
                </button>
                <button className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}