// src/pages/Security.jsx
import { Link } from 'react-router-dom';
import { useState } from 'react';
import PublicHeader from '../components/common/PublicHeader';
import {
  FiArrowLeft, FiShield, FiLock, FiAlertCircle,
  FiCheckCircle, FiEye, FiEyeOff, FiSmartphone, FiMail, FiUserCheck,
  FiShieldOff, FiKey, FiDatabase, FiGlobe, FiBell, FiUserX
} from 'react-icons/fi';
import { BsShieldCheck, BsShieldLock } from 'react-icons/bs';

const SECURITY_FEATURES = [
  {
    icon: <FiLock className="w-6 h-6" />,
    title: "End-to-End Encryption",
    description: "Your messages are encrypted and can only be read by you and the intended recipient.",
    color: "from-blue-500 to-cyan-500"
  },
  {
    icon: <FiUserCheck className="w-6 h-6" />,
    title: "Two-Factor Authentication",
    description: "Add an extra layer of security with SMS or authenticator app verification.",
    color: "from-purple-500 to-pink-500"
  },
  {
    icon: <FiEye className="w-6 h-6" />,
    title: "Privacy Controls",
    description: "Fine-tune who can see your content, send you messages, and find your profile.",
    color: "from-green-500 to-teal-500"
  },
  {
    icon: <FiBell className="w-6 h-6" />,
    title: "Login Alerts",
    description: "Get instant notifications when someone logs into your account from a new device.",
    color: "from-orange-500 to-red-500"
  },
  {
    icon: <FiKey className="w-6 h-6" />,
    title: "Secure Password Storage",
    description: "Passwords are hashed and salted using industry-standard algorithms.",
    color: "from-indigo-500 to-blue-500"
  },
  {
    icon: <FiDatabase className="w-6 h-6" />,
    title: "Data Protection",
    description: "Your data is protected with advanced security measures and regular audits.",
    color: "from-rose-500 to-pink-500"
  }
];

const SECURITY_TIPS = [
  {
    title: "Use Strong Passwords",
    description: "Create a unique password with at least 12 characters, including numbers, symbols, and both cases.",
    icon: <FiKey className="w-5 h-5" />
  },
  {
    title: "Enable 2FA",
    description: "Two-factor authentication significantly reduces the risk of unauthorized access.",
    icon: <FiUserCheck className="w-5 h-5" />
  },
  {
    title: "Review Connected Apps",
    description: "Regularly check and remove apps you no longer use or trust.",
    icon: <FiShield className="w-5 h-5" />
  },
  {
    title: "Be Wary of Phishing",
    description: "Never click suspicious links or share your login credentials.",
    icon: <FiAlertCircle className="w-5 h-5" />
  },
  {
    title: "Keep App Updated",
    description: "Always use the latest version for security patches and improvements.",
    icon: <FiSmartphone className="w-5 h-5" />
  },
  {
    title: "Log Out of Shared Devices",
    description: "Always log out when using public or shared computers.",
    icon: <FiUserX className="w-5 h-5" />
  }
];

const PRIVACY_SETTINGS = [
  {
    category: "Account Privacy",
    options: [
      "Private Account - Approve followers",
      "Hide your activity status",
      "Limit past posts visibility"
    ]
  },
  {
    category: "Message Controls",
    options: [
      "Who can send you messages",
      "Filter offensive messages",
      "Block unknown senders"
    ]
  },
  {
    category: "Data Sharing",
    options: [
      "Control ad personalization",
      "Download your data anytime",
      "Manage connected apps"
    ]
  }
];

export default function Security() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
              <BsShieldCheck className="w-4 h-4 text-pink-500" />
              <span className="text-sm font-semibold">Enterprise-Grade Security</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-6">
              Your Security is Our{' '}
              <span className="text-gradient">Top Priority</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-8">
              Advanced security measures to protect your account and personal information. Stay safe with NexVibe.
            </p>
            <Link to="/settings/security" className="btn-brand inline-flex items-center gap-2 px-8 py-3 rounded-2xl text-base font-semibold">
              Review Security Settings <FiArrowLeft className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        </section>

        {/* Security Features Grid */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Security Features</h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                Comprehensive protection for your account and data
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SECURITY_FEATURES.map((feature) => (
                <div key={feature.title} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 hover:border-pink-500/50 transition-all group">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} text-white mb-4 group-hover:scale-110 transition-transform`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security Tips */}
        <section className="py-20 px-4 sm:px-6 bg-[var(--bg-secondary)]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Security Tips</h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                Best practices to keep your account secure
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SECURITY_TIPS.map((tip) => (
                <div key={tip.title} className="flex gap-4 bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-5">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center text-pink-500">
                    {tip.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{tip.title}</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{tip.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy Settings Overview */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Privacy Controls</h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                You're in control of your privacy settings
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PRIVACY_SETTINGS.map((setting) => (
                <div key={setting.category} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6">
                  <h3 className="text-xl font-bold mb-4">{setting.category}</h3>
                  <ul className="space-y-3">
                    {setting.options.map((option) => (
                      <li key={option} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <FiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {option}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Encryption Info */}
        <section className="py-20 px-4 sm:px-6 bg-[var(--bg-secondary)]">
          <div className="max-w-4xl mx-auto text-center">
            <BsShieldLock className="w-16 h-16 text-pink-500 mx-auto mb-6" />
            <h2 className="text-3xl sm:text-4xl font-black mb-4">End-to-End Encryption</h2>
            <p className="text-lg text-[var(--text-secondary)] mb-6">
              Your private messages are secured with end-to-end encryption. Only you and the person you're communicating with can read them.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left mt-8">
              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4">
                <FiLock className="w-5 h-5 text-green-500 mb-2" />
                <p className="text-sm font-semibold">Secure Transmission</p>
                <p className="text-xs text-[var(--text-muted)]">Messages encrypted before leaving your device</p>
              </div>
              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4">
                <FiEyeOff className="w-5 h-5 text-green-500 mb-2" />
                <p className="text-sm font-semibold">No Third-Party Access</p>
                <p className="text-xs text-[var(--text-muted)]">We can't read your messages</p>
              </div>
              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-4">
                <FiCheckCircle className="w-5 h-5 text-green-500 mb-2" />
                <p className="text-sm font-semibold">Verified Security</p>
                <p className="text-xs text-[var(--text-muted)]">Industry-standard encryption protocols</p>
              </div>
            </div>
          </div>
        </section>

        {/* Report Security Issue */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 rounded-3xl p-8 text-center border border-red-500/20">
              <FiAlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-3">Report a Security Issue</h2>
              <p className="text-[var(--text-secondary)] mb-6">
                Found a security vulnerability? Help us keep NexVibe safe for everyone.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a href="mailto:security@nexvibe.com" className="btn-brand inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                  Report Now
                </a>
                <Link to="/help" className="btn-outline inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
                  Visit Help Center
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 bg-[var(--bg-secondary)]">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-black mb-4">Stay Safe on NexVibe</h2>
            <p className="text-lg text-[var(--text-secondary)] mb-8">
              Review your security settings today and enable two-factor authentication for maximum protection.
            </p>
            <Link to="/settings/security" className="btn-brand inline-flex items-center gap-2 px-8 py-3 rounded-2xl text-base font-semibold">
              Go to Security Settings
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-[var(--text-muted)]">© {new Date().getFullYear()} NexVibe. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}