// src/pages/Community.jsx
import { Link } from 'react-router-dom';
import { useState } from 'react';
import PublicHeader from '../components/common/PublicHeader';
import {
  FiArrowLeft, FiArrowRight, FiUsers, FiHeart, FiMessageCircle,
  FiGlobe, FiAward, FiTrendingUp, FiShield, FiUserPlus, FiShare2,
  FiCamera, FiVideo, FiCalendar, FiMapPin, FiThumbsUp, FiStar
} from 'react-icons/fi';
import { BsPeople, BsChat, BsCollectionPlay } from 'react-icons/bs';

const COMMUNITY_STATS = [
  { number: '2B+', label: 'Active Members', icon: <FiUsers className="w-6 h-6" /> },
  { number: '50M+', label: 'Daily Posts', icon: <FiCamera className="w-6 h-6" /> },
  { number: '140+', label: 'Countries', icon: <FiGlobe className="w-6 h-6" /> },
  { number: '4.5B+', label: 'Daily Interactions', icon: <FiHeart className="w-6 h-6" /> },
];

const COMMUNITY_GUIDELINES = [
  {
    icon: <FiHeart className="w-6 h-6" />,
    title: "Be Kind and Respectful",
    description: "Treat others with kindness and respect. Harassment, hate speech, and bullying are not tolerated.",
    color: "from-pink-500 to-rose-500"
  },
  {
    icon: <FiUsers className="w-6 h-6" />,
    title: "Be Authentic",
    description: "Share authentic content that represents you. Don't impersonate others or create fake accounts.",
    color: "from-blue-500 to-purple-500"
  },
  {
    icon: <FiShield className="w-6 h-6" />,
    title: "Protect Privacy",
    description: "Respect others' privacy. Don't share personal information without consent.",
    color: "from-green-500 to-teal-500"
  },
  {
    icon: <FiShare2 className="w-6 h-6" />,
    title: "Share Responsibly",
    description: "Only share content you have rights to. Respect intellectual property.",
    color: "from-orange-500 to-red-500"
  }
];

const COMMUNITY_FEATURES = [
  {
    title: "Interest-Based Groups",
    desc: "Join groups based on your hobbies, profession, or passions. Connect with like-minded people from around the world.",
    icon: <BsPeople className="w-8 h-8" />,
    image: "https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?w=600&h=400&fit=crop"
  },
  {
    title: "Live Events",
    desc: "Host or join live streams, workshops, and Q&A sessions. Engage with your community in real-time.",
    icon: <FiVideo className="w-8 h-8" />,
    image: "https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?w=600&h=400&fit=crop"
  },
  {
    title: "Community Challenges",
    desc: "Participate in daily or weekly challenges. Win badges, get featured, and connect with other creators.",
    icon: <FiAward className="w-8 h-8" />,
    image: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?w=600&h=400&fit=crop"
  },
  {
    title: "Collaboration Hub",
    desc: "Find collaboration opportunities with other creators. Work together on projects and grow together.",
    icon: <FiUserPlus className="w-8 h-8" />,
    image: "https://images.pexels.com/photos/3184293/pexels-photo-3184293.jpeg?w=600&h=400&fit=crop"
  }
];

const SUCCESS_STORIES = [
  {
    name: "Emma Rodriguez",
    role: "Artist",
    story: "I found my tribe on NexVibe. The supportive community helped me grow my art business from zero to full-time in just 6 months!",
    avatar: "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?w=100&h=100&fit=crop",
    achievement: "50K+ Followers"
  },
  {
    name: "David Kim",
    role: "Photographer",
    story: "The photography community here is incredible. I've made lifelong friends and collaborated on amazing projects worldwide.",
    avatar: "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?w=100&h=100&fit=crop",
    achievement: "Featured Artist"
  },
  {
    name: "Sarah Johnson",
    role: "Small Business Owner",
    story: "NexVibe gave my business a platform to reach customers. The community support has been overwhelming and life-changing.",
    avatar: "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?w=100&h=100&fit=crop",
    achievement: "Business Growth"
  }
];

const UPCOMING_EVENTS = [
  {
    title: "Creator Summit 2024",
    date: "April 15, 2024",
    time: "10:00 AM EST",
    attendees: "2.5K+ attending",
    type: "Virtual"
  },
  {
    title: "Photography Challenge",
    date: "April 20, 2024",
    time: "All Day",
    attendees: "10K+ participants",
    type: "Community"
  },
  {
    title: "Live Q&A with Experts",
    date: "April 25, 2024",
    time: "3:00 PM EST",
    attendees: "1.2K+ interested",
    type: "Live Stream"
  }
];

export default function Community() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-blue-500/20 py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
              <FiUsers className="w-4 h-4 text-pink-500" />
              <span className="text-sm font-semibold">Global Community</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-6">
              Join Our Growing{' '}
              <span className="text-gradient">Global Community</span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-8">
              Connect with millions of creators, artists, and entrepreneurs from around the world. Share, learn, and grow together.
            </p>
            <Link to="/register" className="btn-brand inline-flex items-center gap-2 px-8 py-3 rounded-2xl text-base font-semibold">
              Join Community Now <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 px-4 sm:px-6 bg-[var(--bg-secondary)]">
          <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
            {COMMUNITY_STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-white mb-4 mx-auto">
                  {stat.icon}
                </div>
                <p className="text-3xl sm:text-4xl font-black text-gradient mb-1">{stat.number}</p>
                <p className="text-sm text-[var(--text-muted)]">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Community Guidelines */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Community Guidelines</h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                Our guidelines help create a safe, inclusive, and positive environment for everyone
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {COMMUNITY_GUIDELINES.map((guideline) => (
                <div key={guideline.title} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 text-center hover:border-pink-500/50 transition-all group">
                  <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${guideline.color} text-white mb-4 group-hover:scale-110 transition-transform mx-auto`}>
                    {guideline.icon}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{guideline.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)]">{guideline.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Community Features */}
        <section className="py-20 px-4 sm:px-6 bg-[var(--bg-secondary)]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Community Features</h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                Everything you need to connect, collaborate, and create
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {COMMUNITY_FEATURES.map((feature, index) => (
                <div key={feature.title} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-3xl overflow-hidden group hover:scale-[1.02] transition-all">
                  <div className="h-48 overflow-hidden">
                    <img src={feature.image} alt={feature.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <div className="p-6">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500 text-white mb-4">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-[var(--text-secondary)]">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Success Stories */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Success Stories</h2>
              <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
                Real stories from our amazing community members
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {SUCCESS_STORIES.map((story) => (
                <div key={story.name} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <img src={story.avatar} alt={story.name} className="w-12 h-12 rounded-full object-cover" />
                    <div>
                      <h3 className="font-semibold">{story.name}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{story.role}</p>
                    </div>
                  </div>
                  <p className="text-[var(--text-secondary)] italic mb-3">"{story.story}"</p>
                  <div className="flex items-center gap-2 text-sm text-pink-500">
                    <FiStar className="w-4 h-4 fill-pink-500" />
                    <span>{story.achievement}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Upcoming Events */}
        <section className="py-20 px-4 sm:px-6 bg-[var(--bg-secondary)]">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
              <div>
                <h2 className="text-3xl sm:text-4xl font-black mb-2">Upcoming Events</h2>
                <p className="text-[var(--text-secondary)]">Join these exciting community events</p>
              </div>
              <Link to="/events" className="text-pink-500 hover:text-pink-600 font-semibold">View All Events →</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {UPCOMING_EVENTS.map((event) => (
                <div key={event.title} className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-6 hover:border-pink-500/50 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold px-3 py-1 bg-pink-100 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 rounded-full">
                      {event.type}
                    </span>
                    <FiCalendar className="w-4 h-4 text-[var(--text-muted)]" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{event.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">{event.date}</p>
                  <p className="text-sm text-[var(--text-secondary)] mb-3">{event.time}</p>
                  <p className="text-xs text-pink-500">{event.attendees}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="relative ig-gradient rounded-3xl p-12 text-center overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full translate-x-1/3 -translate-y-1/3" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -translate-x-1/3 translate-y-1/3" />
              <div className="relative">
                <BsPeople className="w-16 h-16 text-white mx-auto mb-6" />
                <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Ready to Join Our Community?</h2>
                <p className="text-white/80 mb-8 max-w-md mx-auto">
                  Become part of something special. Connect with millions of creators worldwide.
                </p>
                <Link to="/register" className="inline-flex items-center gap-2 bg-white text-pink-600 font-bold px-8 py-3 rounded-2xl hover:bg-white/90 transition-colors">
                  Join Now <FiArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
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