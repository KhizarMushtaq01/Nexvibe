import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import PublicHeader from '../components/common/PublicHeader';

// ── icons from react-icons/fi (all confirmed available) ──
import {
  FiSun, FiMoon, FiArrowRight,
  FiCamera, FiMessageCircle, FiHeart, FiUsers,
  FiShield, FiZap, FiSmartphone, FiGlobe,
  FiStar, FiTrendingUp, FiPlay, FiCheck,
  FiChevronDown, FiLock, FiBell, FiBookmark,
  FiMail, FiMapPin, FiAlertCircle, FiDownload,
} from 'react-icons/fi';
import {
  BsInstagram, BsCameraVideo, BsPeople,
  BsCollectionPlay, BsChat, BsStars,
  BsShieldCheck, BsImage, BsGrid3X3Gap,
  BsHouse, BsSearch, BsPlusSquare, BsCompass, BsHeart
} from 'react-icons/bs';
import { HiOutlineSparkles } from 'react-icons/hi';
import { MdOutlineExplore } from 'react-icons/md';

const PHONE_SCREENS = [
  {
    bg: 'from-purple-600 via-pink-500 to-orange-400',
    label: 'Share your story',
    icon: <BsInstagram className="w-10 h-10 text-white" />,
  },
  {
    bg: 'from-blue-600 via-cyan-500 to-teal-400',
    label: 'Connect with friends',
    icon: <BsPeople className="w-10 h-10 text-white" />,
  },
  {
    bg: 'from-pink-600 via-rose-500 to-orange-400',
    label: 'Watch & create reels',
    icon: <BsCollectionPlay className="w-10 h-10 text-white" />,
  },
];

const STATS = [
  { number: '2B+', label: 'Active users worldwide', icon: <FiUsers className="w-5 h-5" /> },
  { number: '100M+', label: 'Photos shared daily', icon: <BsImage className="w-5 h-5" /> },
  { number: '4.5B+', label: 'Likes every day', icon: <FiHeart className="w-5 h-5" /> },
  { number: '140+', label: 'Countries connected', icon: <FiGlobe className="w-5 h-5" /> },
];

const FEATURES = [
  {
    icon: <BsInstagram className="w-7 h-7" />,
    title: 'Beautiful Feed',
    desc: 'Share photos and videos with your followers. Apply filters, tag locations, and write captions up to 2,200 characters.',
    color: 'from-pink-500 to-rose-500',
    image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&h=400&fit=crop',
  },
  {
    icon: <BsCollectionPlay className="w-7 h-7" />,
    title: 'Reels',
    desc: 'Create short, entertaining videos set to music. Reach new audiences and go viral on the Explore page.',
    color: 'from-purple-500 to-pink-500',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop',
  },
  {
    icon: <BsStars className="w-7 h-7" />,
    title: 'Stories',
    desc: 'Share moments that disappear after 24 hours. Add stickers, music, polls, and reactions.',
    color: 'from-orange-400 to-pink-500',
    image: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=600&h=400&fit=crop',
  },
  {
    icon: <BsChat className="w-7 h-7" />,
    title: 'Direct Messages',
    desc: 'Chat privately with friends one-on-one or in groups. Send photos, videos, voice messages, and reactions.',
    color: 'from-blue-500 to-purple-500',
    image: 'https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=600&h=400&fit=crop',
  },
  {
    icon: <MdOutlineExplore className="w-7 h-7" />,
    title: 'Explore',
    desc: 'Discover new content, creators, and communities. Personalized for your interests.',
    color: 'from-teal-500 to-blue-500',
    image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&h=400&fit=crop',
  },
  {
    icon: <BsShieldCheck className="w-7 h-7" />,
    title: 'Privacy & Security',
    desc: 'Private accounts, two-factor authentication, login alerts, and full control over who sees your content.',
    color: 'from-green-500 to-teal-500',
    image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&h=400&fit=crop',
  },
];

const TESTIMONIALS = [
  {
    name: 'Sophia Chen',
    handle: '@sophiac',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    text: 'NexVibe changed how I connect with friends. The stories feature is absolutely amazing — I use it every single day.',
    role: 'Lifestyle Creator',
  },
  {
    name: 'Marcus Rivera',
    handle: '@marcusr',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    text: 'I grew my photography business by sharing reels. The reach is incredible and the community is so supportive.',
    role: 'Photographer',
  },
  {
    name: 'Aisha Patel',
    handle: '@aishap',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    text: 'The direct messages and close friends feature make it feel truly personal. Best social app I have ever used.',
    role: 'Travel Blogger',
  },
  {
    name: 'James Kim',
    handle: '@jamesk',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
    text: 'As a small business owner, NexVibe has been game-changing for reaching customers and building my brand.',
    role: 'Business Owner',
  },
];

const STEPS = [
  { step: '01', title: 'Create your account', desc: 'Sign up with email, phone, or connect with Google, Facebook, Apple or X in seconds.', icon: <FiUsers className="w-6 h-6" /> },
  { step: '02', title: 'Build your profile', desc: 'Add a photo, write a bio, link your website, and set your account to public or private.', icon: <BsGrid3X3Gap className="w-6 h-6" /> },
  { step: '03', title: 'Connect & share', desc: 'Follow friends, share your first post, and start engaging with a global community.', icon: <FiHeart className="w-6 h-6" /> },
];

// ─── Animated mock post card with real images ───
function MockPostCard({ delay = 0, username, avatar, imageUrl, likes, time }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl overflow-hidden border border-neutral-100 dark:border-neutral-800 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5 p-3 border-b border-neutral-100 dark:border-neutral-800">
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
          <img src={avatar} alt={username} className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-neutral-800 dark:text-white">{username}</p>
          <p className="text-[10px] text-neutral-400">{time}</p>
        </div>
        <div className="w-4 h-4 flex flex-col gap-0.5 justify-center items-end">
          {[0,1,2].map(i => <div key={i} className="w-3 h-0.5 bg-neutral-300 dark:bg-neutral-600 rounded-full" />)}
        </div>
      </div>
      <div className="aspect-square overflow-hidden">
        <img src={imageUrl} alt="Post" className="w-full h-full object-cover" />
      </div>
      <div className="p-3">
        <div className="flex items-center gap-3 mb-2">
          <FiHeart className="w-5 h-5 text-red-500 fill-red-500" style={{ fill: 'currentColor' }} />
          <FiMessageCircle className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
          <FiBookmark className="w-5 h-5 text-neutral-500 dark:text-neutral-400 ml-auto" />
        </div>
        <p className="text-xs font-bold text-neutral-800 dark:text-white">{likes} likes</p>
      </div>
    </div>
  );
}

// ─── Mock story bubbles with images ───
function MockStoryBubble({ name, avatar, hasRing = true, delay = 0 }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0" style={{ animationDelay: `${delay}ms` }}>
      <div className={`p-[2px] rounded-full ${hasRing ? 'ig-gradient' : 'bg-neutral-200 dark:bg-neutral-700'}`}>
        <div className="bg-white dark:bg-neutral-900 p-[2px] rounded-full">
          <div className="w-12 h-12 rounded-full overflow-hidden">
            <img src={avatar} alt={name} className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate w-12 text-center">{name}</span>
    </div>
  );
}

export default function LandingPage() {
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [statsVisible, setStatsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const statsRef = useRef(null);

  // Cycle features highlight
  useEffect(() => {
    const t = setInterval(() => setActiveFeature(p => (p + 1) % FEATURES.length), 2500);
    return () => clearInterval(t);
  }, []);

  // Intersection observer for stats
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true); }, { threshold: 0.3 });
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (window.location.hash) {
      document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const scrollTo = (id) => {
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] overflow-x-hidden">

      <PublicHeader />

      {/* ── HERO with Phone Mockup ── */}
      <section className="pt-28 pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-pink-400/20 dark:bg-pink-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-80 h-80 bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 w-72 h-72 bg-orange-400/15 dark:bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800/50 rounded-full px-4 py-1.5 text-xs font-semibold mb-6 animate-fade-in">
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              The social platform you've been waiting for
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-6 animate-slide-up">
              Share your world,{' '}
              <span className="text-gradient">one moment</span>{' '}
              at a time
            </h1>

            <p className="text-lg text-[var(--text-secondary)] leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0 animate-fade-in" style={{ animationDelay: '100ms' }}>
              Connect with friends, share stunning photos and videos, watch Reels, send direct messages — all in one beautifully designed app.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start animate-fade-in" style={{ animationDelay: '200ms' }}>
              <Link to="/register"
                className="btn-brand flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-shadow">
                Get started — it's free
                <FiArrowRight className="w-4 h-4" />
              </Link>
              <button onClick={() => scrollTo('#features')}
                className="btn-outline flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-base font-semibold">
                <FiPlay className="w-4 h-4" />
                See how it works
              </button>
            </div>

            <p className="mt-4 text-xs text-[var(--text-muted)] animate-fade-in" style={{ animationDelay: '300ms' }}>
              No credit card required · Free forever · Join 2 billion users
            </p>
          </div>

          {/* Phone mockup with real content - Fixed bottom navigation */}
          <div className="flex-shrink-0 relative flex items-center justify-center w-full max-w-sm lg:max-w-none lg:w-auto">
            <div className="relative w-64 lg:w-80">
              {/* Phone frame */}
              <div className="bg-neutral-900 rounded-[2.5rem] p-3 shadow-2xl shadow-black/40 ring-1 ring-white/10">
                <div className="bg-black rounded-[2rem] overflow-hidden" style={{ aspectRatio: '9/19' }}>
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-5 pt-3 pb-1">
                    <span className="text-white text-[10px] font-medium">9:41</span>
                    <div className="w-20 h-5 bg-black rounded-full" />
                    <div className="flex gap-1 items-center">
                      <div className="w-3 h-2 border border-white/60 rounded-sm">
                        <div className="w-2 h-1 bg-white/60 rounded-sm m-px" />
                      </div>
                    </div>
                  </div>

                  {/* App header */}
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-white font-black text-lg" style={{ fontStyle: 'italic' }}>NexVibe</span>
                    <div className="flex gap-3">
                      <BsHeart className="w-5 h-5 text-white" />
                      <FiMessageCircle className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  {/* Stories row with real images */}
                  <div className="flex gap-3 px-3 pb-3 overflow-x-auto scrollbar-hide">
                    {[
                      { name: 'You', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop', ring: false },
                      { name: 'Mia', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop', ring: true },
                      { name: 'Jake', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop', ring: true },
                      { name: 'Sara', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop', ring: true },
                    ].map((s, i) => (
                      <MockStoryBubble key={s.name} name={s.name} avatar={s.avatar} hasRing={s.ring} delay={i * 100} />
                    ))}
                  </div>

                  {/* Post cards with real images */}
                  <div className="px-2 space-y-2 overflow-y-auto" style={{ maxHeight: '280px' }}>
                    <MockPostCard
                      username="sofia_travels"
                      avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
                      imageUrl="https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=400&h=400&fit=crop"
                      likes="2,847"
                      time="2 min ago"
                    />
                    <MockPostCard
                      username="photo_mike"
                      avatar="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
                      imageUrl="https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=400&h=400&fit=crop"
                      likes="1,203"
                      time="15 min ago"
                      delay={150}
                    />
                    <MockPostCard
                      username="emma_adventures"
                      avatar="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop"
                      imageUrl="https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=400&fit=crop"
                      likes="3,456"
                      time="32 min ago"
                      delay={300}
                    />
                  </div>

                  {/* Bottom navigation bar - FIXED and visible */}
                  <div className="bg-black/90 backdrop-blur-sm border-t border-white/10 flex items-center justify-around py-3 px-4">
                    <BsHouse className="w-5 h-5 text-white" />
                    <BsSearch className="w-5 h-5 text-neutral-500" />
                    <BsPlusSquare className="w-5 h-5 text-neutral-500" />
                    <BsCompass className="w-5 h-5 text-neutral-500" />
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <img src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" alt="profile" className="w-full h-full object-cover" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating notification badges */}
              <div className="absolute -right-4 top-16 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-2.5 flex items-center gap-2 border border-neutral-100 dark:border-neutral-700 animate-slide-up hidden sm:flex" style={{ animationDelay: '400ms' }}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center flex-shrink-0">
                  <FiHeart className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-800 dark:text-white">+2,847 likes</p>
                  <p className="text-[9px] text-neutral-400">on your photo</p>
                </div>
              </div>

              <div className="absolute -left-6 bottom-32 bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-2.5 flex items-center gap-2 border border-neutral-100 dark:border-neutral-700 animate-slide-up hidden sm:flex" style={{ animationDelay: '600ms' }}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <FiUsers className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-800 dark:text-white">42 new followers</p>
                  <p className="text-[9px] text-neutral-400">this week</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-16 animate-bounce">
          <button onClick={() => scrollTo('#stats')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <FiChevronDown className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* STATS section */}
      <section id="stats" ref={statsRef} className="py-16 px-4 sm:px-6 bg-[var(--bg-secondary)]">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="flex justify-center mb-2 text-pink-500">{s.icon}</div>
              <p className="text-3xl sm:text-4xl font-black text-gradient mb-1">{s.number}</p>
              <p className="text-sm text-[var(--text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES section */}
<section id="features" className="py-24 px-4 sm:px-6">
  <div className="max-w-6xl mx-auto">
    <div className="text-center mb-16">
      <p className="text-sm font-semibold text-pink-500 uppercase tracking-widest mb-3">Everything you need</p>
      <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4">
        One app. <span className="text-gradient">Infinite connections.</span>
      </h2>
      <p className="text-[var(--text-secondary)] max-w-2xl mx-auto text-lg">
        NexVibe packs every feature you love — posts, stories, reels, messages, and more — into a seamless, beautiful experience.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {FEATURES.map((f, i) => (
        <div key={f.title}
          onMouseEnter={() => setActiveFeature(i)}
          className={`group relative bg-[var(--bg-secondary)] border rounded-3xl overflow-hidden transition-all duration-300
            ${activeFeature === i ? 'border-pink-400/50 dark:border-pink-600/40 shadow-lg shadow-pink-500/10 scale-[1.02]' : 'border-[var(--border)] hover:border-pink-400/30'}`}>
          <div className="h-48 overflow-hidden">
            <img src={f.image} alt={f.title} className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500" />
          </div>
          <div className="p-7">
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${f.color} text-white mb-5 shadow-lg transition-transform group-hover:scale-110 duration-300`}>
              {f.icon}
            </div>
            <h3 className="text-lg font-bold mb-2">{f.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{f.desc}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
</section>

      {/* STORIES SECTION */}
      <section className="py-24 px-4 sm:px-6 bg-[var(--bg-secondary)] overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 order-2 lg:order-1">
            <div className="bg-[var(--bg-primary)] rounded-3xl border border-[var(--border)] p-5 shadow-2xl max-w-sm mx-auto">
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-sm">Stories</p>
                <FiBell className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
              <div className="flex gap-4 mb-5 overflow-x-auto scrollbar-hide">
                {[
                  { name: 'alex', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop' },
                  { name: 'luna', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop' },
                  { name: 'noah', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop' },
                  { name: 'emma', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop' },
                  { name: 'kai', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop' },
                ].map((s, i) => (
                  <div key={s.name} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="p-[2px] rounded-full ig-gradient">
                      <div className="bg-white dark:bg-neutral-900 p-[2px] rounded-full">
                        <div className="w-12 h-12 rounded-full overflow-hidden">
                          <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate w-12 text-center">{s.name}</span>
                  </div>
                ))}
              </div>
              {/* Big story preview with image */}
              <div className="rounded-2xl overflow-hidden relative" style={{ aspectRatio: '9/14' }}>
                <img 
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop" 
                  alt="Story"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <div className="flex gap-1 w-full mb-4">
                    {[100, 60, 0].map((v, i) => (
                      <div key={i} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                        <div className="h-full bg-white rounded-full" style={{ width: `${v}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white">
                      <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop" alt="luna" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white text-sm font-semibold">luna</p>
                    <p className="text-white/60 text-xs">2m ago</p>
                  </div>
                  <p className="text-white text-lg font-bold leading-snug">Golden hour in Paris ✨</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 order-1 lg:order-2 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50 rounded-full px-4 py-1.5 text-xs font-semibold mb-5">
              <BsStars className="w-3.5 h-3.5" />
              Stories
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-5">
              Live in the <span className="text-gradient">moment</span>
            </h2>
            <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-6">
              Share photos and videos that vanish after 24 hours. Add music, text, stickers, polls, and emoji reactions. Your story, your way.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Disappear after 24 hours',
                'Add stickers, music & text overlays',
                'Share with close friends only',
                'Save to Highlights on your profile',
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <div className="w-5 h-5 rounded-full ig-gradient flex items-center justify-center flex-shrink-0">
                    <FiCheck className="w-3 h-3 text-white" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/register" className="btn-brand inline-flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-semibold">
              Start sharing <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* REELS SECTION */}
      <section id="reels" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50 rounded-full px-4 py-1.5 text-xs font-semibold mb-5">
              <BsCollectionPlay className="w-3.5 h-3.5" />
              Reels
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-5">
              Create videos that <span className="text-gradient">go viral</span>
            </h2>
            <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-6">
              Record and edit short, entertaining videos. Add trending music, effects, and captions. Reach new audiences beyond your followers on the Explore page.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Record up to 90-second videos',
                'Add music from millions of tracks',
                'Reach the Explore page & go viral',
                'See detailed performance analytics',
              ].map(item => (
                <li key={item} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                    <FiCheck className="w-3 h-3 text-white" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/register" className="btn-brand inline-flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-semibold">
              Create your first reel <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Reels mockup with real images */}
          <div className="flex-shrink-0 flex gap-4 overflow-x-auto pb-4 lg:pb-0 scrollbar-hide">
            {[
              { 
  image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=600&fit=crop', 
  user: 'photography_pro', 
  likes: '245K', 
  views: '2.3M' 
},
{ 
  image: 'https://images.unsplash.com/photo-1552581234-26160f608093?w=400&h=600&fit=crop', 
  user: 'coffee_lover', 
  likes: '67K', 
  views: '456K' 
},
{ 
  image: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&h=600&fit=crop', 
  user: 'mountain_hiker', 
  likes: '734K', 
  views: '8.2M' 
},
            ].map((r, i) => (
              <div key={r.user} className={`w-48 md:w-56 rounded-3xl overflow-hidden shadow-2xl border border-white/10 relative flex-shrink-0 ${i === 1 ? 'mt-8' : ''}`} style={{ aspectRatio: '9/16' }}>
                <img src={r.image} alt={r.user} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute top-3 right-3 flex flex-col gap-3">
                  <div className="flex flex-col items-center">
                    <FiHeart className="w-5 h-5 text-white drop-shadow" />
                    <span className="text-white text-[9px] font-bold">{r.likes}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <FiMessageCircle className="w-5 h-5 text-white drop-shadow" />
                    <span className="text-white text-[9px]">2.4K</span>
                  </div>
                  <FiBookmark className="w-5 h-5 text-white drop-shadow" />
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-white">
                      <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop" alt={r.user} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-white text-[10px] font-semibold">@{r.user}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full ig-gradient animate-spin-slow" />
                    <p className="text-white/70 text-[9px] truncate">Trending Sound</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="relative ig-gradient rounded-3xl p-8 sm:p-12 text-center overflow-hidden shadow-2xl shadow-pink-500/30">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full translate-x-1/3 -translate-y-1/3" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -translate-x-1/3 translate-y-1/3" />

            <div className="relative">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-6 mx-auto">
                <BsInstagram className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white mb-4">
                Ready to join the community?
              </h2>
              <p className="text-white/80 text-base sm:text-lg mb-8 max-w-md mx-auto">
                Sign up in under a minute. Connect with people you love. Share the moments that matter most.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/register"
                  className="inline-flex items-center justify-center gap-2 bg-white text-pink-600 font-bold px-6 sm:px-8 py-3 rounded-2xl hover:bg-white/90 transition-colors text-sm shadow-lg">
                  Create free account
                  <FiArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login"
                  className="inline-flex items-center justify-center gap-2 bg-white/15 backdrop-blur-sm text-white border border-white/30 font-semibold px-6 sm:px-8 py-3 rounded-2xl hover:bg-white/25 transition-colors text-sm">
                  Already have an account
                </Link>
              </div>
              <p className="text-white/60 text-xs mt-4">Free forever · No credit card · Join 2B+ users</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 ig-gradient rounded-xl flex items-center justify-center">
                <BsInstagram className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-black text-gradient">NexVibe</span>
            </Link>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              <Link to="/login" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Log in</Link>
              <Link to="/register" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Sign up</Link>
              <Link to="/blog" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Blog</Link>
              <Link to="/terms" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Terms</Link>
              <Link to="/privacy" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Privacy</Link>
              <Link to="/cookies" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Cookies</Link>
              <Link to="/help" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Help</Link>
            </div>

            <button onClick={toggleTheme} className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-2 rounded-xl hover:bg-[var(--bg-tertiary)]">
              {isDark ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

          <div className="border-t border-[var(--border)] pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-muted)]">© {new Date().getFullYear()} NexVibe. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/terms" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Terms</Link>
              <Link to="/privacy" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Privacy</Link>
              <Link to="/cookies" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Cookies</Link>
              <Link to="/help" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Help</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}