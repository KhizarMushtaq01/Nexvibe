// src/pages/Help.jsx
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { FiSun, FiMoon, FiArrowLeft, FiSearch, FiHelpCircle, FiMessageCircle, FiShield, FiUser, FiLock, FiCamera, FiHeart, FiUsers, FiMail, FiChevronDown } from 'react-icons/fi';
import { BsInstagram } from 'react-icons/bs';
import { useState } from 'react';

export default function Help() {
  const { isDark, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [openFaq, setOpenFaq] = useState(null);

  const faqCategories = {
    account: {
      title: "Account Management",
      icon: <FiUser className="w-5 h-5" />,
      questions: [
        { id: 1, q: "How do I create an account?", a: "Click 'Sign Up' on the homepage or login page. You can sign up with email, phone number, or connect with Google, Facebook, or Apple." },
        { id: 2, q: "How do I reset my password?", a: "Click 'Forgot Password' on the login page. Enter your email, and we'll send a password reset link to your registered email address." },
        { id: 3, q: "How do I delete my account?", a: "Go to Settings > Account > Delete Account. This action is permanent and cannot be undone. Make sure to backup your data first." },
        { id: 4, q: "Can I change my username?", a: "Yes! Go to Edit Profile and change your username. Note: You can only change it twice within 14 days." },
        { id: 5, q: "How do I verify my account?", a: "Verification is currently available for public figures, celebrities, and brands. Contact our support team for more information." },
      ]
    },
    privacy: {
      title: "Privacy & Security",
      icon: <FiShield className="w-5 h-5" />,
      questions: [
        { id: 6, q: "How do I make my account private?", a: "Go to Settings > Privacy > Account Privacy and toggle 'Private Account' on. Only approved followers can see your posts." },
        { id: 7, q: "What is two-factor authentication?", a: "2FA adds an extra security layer. Enable it in Settings > Security to require a verification code when logging in from new devices." },
        { id: 8, q: "How do I block someone?", a: "Go to their profile, tap the three dots menu, and select 'Block'. They won't be able to find your profile or contact you." },
        { id: 9, q: "Who can see my email and phone number?", a: "Your contact info is private by default. You control this in Privacy Settings under 'Contact Info Visibility'." },
        { id: 10, q: "How do I report inappropriate content?", a: "Tap the three dots on any post or profile and select 'Report'. Our team will review it within 24 hours." },
      ]
    },
    content: {
      title: "Creating & Sharing",
      icon: <FiCamera className="w-5 h-5" />,
      questions: [
        { id: 11, q: "How do I create a post?", a: "Tap the + icon, select photos/videos, apply filters, write a caption, add location, and tap 'Share'." },
        { id: 12, q: "What are Stories?", a: "Stories are photos/videos that disappear after 24 hours. Add stickers, music, text, polls, and questions to engage your audience." },
        { id: 13, q: "How do I create a Reel?", a: "Tap the Reel icon, record or upload videos up to 90 seconds, add trending music, effects, and share to your profile." },
        { id: 14, q: "Can I edit a post after sharing?", a: "Yes! Tap the three dots on your post and select 'Edit'. You can change caption, alt text, location, and tags." },
        { id: 15, q: "How do I save drafts?", a: "When creating a post, tap back arrow and select 'Save Draft'. Find drafts in your profile under the draft icon." },
      ]
    },
    engagement: {
      title: "Engagement",
      icon: <FiHeart className="w-5 h-5" />,
      questions: [
        { id: 16, q: "How do likes and comments work?", a: "Tap the heart icon to like a post. Tap the comment bubble to leave a comment. Double-tap any photo to quickly like it." },
        { id: 17, q: "What are Direct Messages?", a: "DMs are private conversations with other users. You can send text, photos, videos, voice messages, and create group chats." },
        { id: 18, q: "How do I mention someone?", a: "Type '@' followed by their username in captions or comments. They'll receive a notification when mentioned." },
        { id: 19, q: "What are hashtags?", a: "Words or phrases with # symbol that categorize content. Use relevant hashtags to reach more people interested in similar content." },
        { id: 20, q: "How does the Explore page work?", a: "Explore shows content based on your interests, who you follow, and what's trending globally in your region." },
      ]
    },
    troubleshooting: {
      title: "Troubleshooting",
      icon: <FiHelpCircle className="w-5 h-5" />,
      questions: [
        { id: 21, q: "Why can't I log in?", a: "Check your internet connection, ensure caps lock is off, and try resetting your password. If issues persist, clear your browser cache." },
        { id: 22, q: "Why are my posts not loading?", a: "Clear app cache, update to the latest version, or reinstall the app. For web, clear browser cache and cookies." },
        { id: 23, q: "How do I report a bug?", a: "Go to Settings > Help > Report a Problem. Describe the issue, include screenshots if possible, and our team will investigate." },
        { id: 24, q: "Why am I not getting notifications?", a: "Check notification settings in your device settings and NexVibe Settings > Notifications. Ensure notifications are enabled for the app." },
        { id: 25, q: "What should I do if my account is hacked?", a: "Immediately change your password, enable 2FA, check connected apps, and contact support at security@nexvibe.com." },
      ]
    }
  };

  const allFaqs = Object.values(faqCategories).flatMap(cat => 
    cat.questions.map(q => ({ ...q, category: cat.title }))
  );

  const filteredFaqs = searchQuery 
    ? allFaqs.filter(faq => 
        faq.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
        faq.a.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : activeCategory === 'all' 
      ? allFaqs 
      : allFaqs.filter(faq => faq.category === faqCategories[activeCategory]?.title);

  const toggleFaq = (id) => {
    setOpenFaq(openFaq === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/90 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 ig-gradient rounded-xl flex items-center justify-center">
              <BsInstagram className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black text-gradient">NexVibe</span>
          </Link>
          <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]">
            {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8 transition-colors">
          <FiArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black mb-4">How can we help you?</h1>
          <p className="text-lg text-[var(--text-secondary)]">Search for answers or browse our help guides</p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)] w-5 h-5" />
            <input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-pink-500 transition-colors"
            />
          </div>
        </div>

        {/* Category Navigation */}
        <div className="flex flex-wrap gap-3 mb-12 justify-center">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-5 py-2.5 rounded-xl font-semibold transition-all ${
              activeCategory === 'all' 
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25' 
                : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            All Topics
          </button>
          {Object.entries(faqCategories).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all ${
                activeCategory === key 
                  ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/25' 
                  : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {cat.icon}
              {cat.title}
            </button>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="space-y-4 mb-16">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => (
              <div key={faq.id} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden">
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="flex items-center justify-between w-full p-5 text-left hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <span className="font-semibold text-[var(--text-primary)] pr-4">{faq.q}</span>
                  <FiChevronDown className={`w-5 h-5 text-[var(--text-muted)] transition-transform ${openFaq === faq.id ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === faq.id && (
                  <div className="p-5 pt-0 border-t border-[var(--border)] text-[var(--text-secondary)] leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <FiHelpCircle className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No results found</h3>
              <p className="text-[var(--text-secondary)]">Try different keywords or contact our support team</p>
            </div>
          )}
        </div>

        {/* Still Need Help Section */}
        <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-3xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Still need help?</h2>
          <p className="text-[var(--text-secondary)] mb-6">Our support team is ready to assist you</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contact" className="btn-brand inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
              <FiMessageCircle className="w-4 h-4" />
              Contact Support
            </Link>
            <a href="mailto:support@nexvibe.com" className="btn-outline inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold">
              <FiMail className="w-4 h-4" />
              Email Us
            </a>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-4">Average response time: 24 hours</p>
        </div>
      </main>
    </div>
  );
}