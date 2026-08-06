// src/pages/BlogPostDetails.jsx
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import PublicHeader from '../components/common/PublicHeader';
import {
  FiArrowLeft, FiHeart, FiMessageCircle, FiShare2,
  FiBookmark, FiCalendar, FiUser, FiTag, FiTwitter, FiFacebook,
  FiLink, FiChevronLeft, FiChevronRight
} from 'react-icons/fi';
import { BsInstagram } from 'react-icons/bs';
import toast from 'react-hot-toast';

const BLOG_POSTS = {
  1: {
    id: 1,
    title: "10 Tips to Grow Your Social Media Following in 2024",
    excerpt: "Learn proven strategies to increase your engagement and build a loyal community on NexVibe...",
    content: `
      <p>Building a strong social media following takes time, dedication, and the right strategies. In this comprehensive guide, we'll share 10 actionable tips to help you grow your presence on NexVibe in 2024.</p>
      
      <h2>1. Post Consistently</h2>
      <p>Consistency is key when it comes to social media growth. Create a content calendar and stick to a regular posting schedule. Aim for at least one post per day to stay top-of-mind with your audience.</p>
      
      <h2>2. Engage With Your Community</h2>
      <p>Social media is meant to be social! Take time to respond to comments, engage with other users' content, and build genuine connections. The algorithm rewards accounts that foster active communities.</p>
      
      <h2>3. Use Relevant Hashtags</h2>
      <p>Research and use a mix of popular and niche-specific hashtags. Aim for 5-10 relevant hashtags per post to maximize reach without looking spammy.</p>
      
      <h2>4. Create High-Quality Content</h2>
      <p>Invest time in creating visually appealing photos and engaging videos. Use good lighting, interesting angles, and authentic moments that resonate with your audience.</p>
      
      <h2>5. Leverage Reels and Stories</h2>
      <p>Short-form video content gets priority in the algorithm. Create entertaining Reels and use Stories to share behind-the-scenes moments and daily updates.</p>
      
      <h2>6. Collaborate With Others</h2>
      <p>Partner with creators in your niche for shoutouts, joint Lives, or content collaborations. This exposes your account to new audiences who already enjoy similar content.</p>
      
      <h2>7. Analyze Your Performance</h2>
      <p>Use NexVibe's analytics tools to understand what content performs best. Pay attention to reach, engagement rates, and audience demographics to refine your strategy.</p>
      
      <h2>8. Post at Optimal Times</h2>
      <p>Experiment with posting at different times and days to find when your audience is most active. Use insights to schedule posts for maximum engagement.</p>
      
      <h2>9. Run Contests and Giveaways</h2>
      <p>Contests are excellent for rapid growth. Require participants to follow your account, like the post, and tag friends to enter. This creates viral loops.</p>
      
      <h2>10. Stay Authentic</h2>
      <p>Above all, be yourself! Audiences connect with real, authentic personalities. Share your unique perspective and don't be afraid to show vulnerability.</p>
      
      <p>Remember, building a following takes time. Focus on providing value to your audience, and the growth will follow naturally. Start implementing these tips today and watch your community flourish!</p>
    `,
    image: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1200&h=600&fit=crop",
    author: {
      name: "Sarah Johnson",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop",
      role: "Social Media Expert",
      bio: "Sarah is a digital marketing strategist with over 10 years of experience helping brands grow their social media presence."
    },
    date: "March 15, 2024",
    readTime: "5 min read",
    category: "Growth Tips",
    tags: ["social media", "growth", "engagement", "tips", "2024"],
    likes: 234,
    comments: 45
  },
  2: {
    id: 2,
    title: "Creating Engaging Reels: A Complete Guide",
    excerpt: "Master the art of short-form video content and reach millions of users on the Explore page...",
    content: `
      <p>Reels have revolutionized how we consume content on social media. This guide will walk you through everything you need to know to create engaging Reels that capture attention and drive growth.</p>
      
      <h2>Understanding the Reels Algorithm</h2>
      <p>The algorithm prioritizes entertaining, educational, or inspiring content. It looks at completion rates, shares, saves, and replays to determine which Reels to promote.</p>
      
      <h2>Choosing the Right Format</h2>
      <p>Vertical video (9:16 aspect ratio) works best for Reels. Ensure your content fills the entire frame and captures attention within the first 3 seconds.</p>
      
      <h2>Adding Trending Audio</h2>
      <p>Using popular sounds can significantly boost your reach. Check the Reels audio library regularly to find trending tracks that fit your content style.</p>
      
      <h2>Editing Tips</h2>
      <p>Use quick cuts, transitions, text overlays, and effects to keep viewers engaged. The Reels editor offers powerful tools - experiment with different features.</p>
      
      <h2>Creating Hooks</h2>
      <p>Start with a strong hook that makes people want to watch more. Ask questions, make bold statements, or tease what's coming up in the Reel.</p>
      
      <h2>Optimizing Captions</h2>
      <p>Write compelling captions that add context and encourage engagement. Include relevant keywords and a clear call-to-action.</p>
      
      <p>With practice and creativity, you'll be creating viral-worthy Reels in no time. Remember to analyze your performance and continuously improve your content strategy.</p>
    `,
    image: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=1200&h=600&fit=crop",
    author: {
      name: "Mike Chen",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop",
      role: "Content Creator",
      bio: "Mike is a full-time content creator who has grown his audience to over 1 million followers through strategic Reels content."
    },
    date: "March 12, 2024",
    readTime: "7 min read",
    category: "Video Content",
    tags: ["reels", "video", "tutorial", "content creation"],
    likes: 567,
    comments: 89
  },
  3: {
    id: 3,
    title: "Building a Personal Brand on Social Media",
    excerpt: "Discover how to establish your unique voice and grow your personal brand authentically...",
    content: `
      <p>Your personal brand is your reputation - it's what people say about you when you leave the room. Building a strong personal brand on social media can open doors to opportunities you never imagined.</p>
      
      <h2>Define Your Niche</h2>
      <p>What makes you unique? Identify your passions, expertise, and the value you can provide to others. Focus on a specific niche where you can become an authority.</p>
      
      <h2>Develop Your Voice</h2>
      <p>Your brand voice should be consistent across all content. Are you educational? Inspirational? Humorous? Find your authentic tone and stick with it.</p>
      
      <h2>Create a Visual Identity</h2>
      <p>Use consistent colors, fonts, and filters to create a recognizable aesthetic. Your profile should look cohesive and professional.</p>
      
      <h2>Share Your Journey</h2>
      <p>People connect with stories, not just successes. Share your struggles, lessons learned, and behind-the-scenes moments to build genuine connections.</p>
      
      <h2>Provide Value</h2>
      <p>Every post should educate, entertain, or inspire your audience. Focus on helping others rather than just promoting yourself.</p>
      
      <h2>Network Strategically</h2>
      <p>Engage with others in your niche, collaborate on content, and attend virtual events. Building relationships is crucial for brand growth.</p>
      
      <p>Building a personal brand takes time, but the rewards are worth it. Stay authentic, provide value consistently, and watch your influence grow.</p>
    `,
    image: "https://images.unsplash.com/photo-1611162617263-4ec3060a058e?w=1200&h=600&fit=crop",
    author: {
      name: "Emma Watson",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop",
      role: "Brand Strategist",
      bio: "Emma helps professionals and entrepreneurs build authentic personal brands that stand out in crowded digital spaces."
    },
    date: "March 10, 2024",
    readTime: "6 min read",
    category: "Personal Branding",
    tags: ["branding", "personal development", "marketing", "career"],
    likes: 892,
    comments: 123
  },
  4: {
    id: 4,
    title: "Safety First: Protecting Your Privacy Online",
    excerpt: "Essential tips to keep your account secure and protect your personal information...",
    content: `
      <p>In today's digital age, protecting your privacy online is more important than ever. This guide will help you secure your NexVibe account and keep your personal information safe.</p>
      
      <h2>Enable Two-Factor Authentication</h2>
      <p>2FA adds an extra layer of security by requiring a verification code in addition to your password. Enable this feature in your security settings immediately.</p>
      
      <h2>Use Strong, Unique Passwords</h2>
      <p>Avoid using the same password across multiple platforms. Use a password manager to generate and store complex passwords securely.</p>
      
      <h2>Review Connected Apps</h2>
      <p>Regularly check which third-party apps have access to your NexVibe account. Remove any apps you no longer use or don't recognize.</p>
      
      <h2>Be Cautious With Personal Info</h2>
      <p>Think twice before sharing your location, phone number, or email address publicly. Use your privacy settings to control who can see this information.</p>
      
      <h2>Recognize Phishing Attempts</h2>
      <p>Never click on suspicious links or share your login credentials. NexVibe will never ask for your password via email or direct message.</p>
      
      <h2>Regular Privacy Audits</h2>
      <p>Review your privacy settings monthly to ensure they still align with your comfort level. Social media platforms frequently update their policies.</p>
      
      <p>Staying safe online requires ongoing vigilance. Implement these practices today to protect yourself and your digital presence.</p>
    `,
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&h=600&fit=crop",
    author: {
      name: "David Kim",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop",
      role: "Cybersecurity Expert",
      bio: "David is a cybersecurity professional dedicated to helping people stay safe and secure in the digital world."
    },
    date: "March 8, 2024",
    readTime: "4 min read",
    category: "Security",
    tags: ["privacy", "security", "safety", "protection"],
    likes: 445,
    comments: 67
  },
  5: {
    id: 5,
    title: "Monetizing Your Content: A Beginner's Guide",
    excerpt: "Learn different ways to earn money from your content and turn your passion into profit...",
    content: `
      <p>Turning your passion into profit is possible with the right monetization strategies. This guide explores various ways to earn money from your content on NexVibe.</p>
      
      <h2>Brand Partnerships</h2>
      <p>Once you've built an engaged following, brands will want to collaborate. Start with micro-influencer campaigns and scale up as your audience grows.</p>
      
      <h2>Affiliate Marketing</h2>
      <p>Promote products you genuinely love and earn commissions on sales. Share affiliate links in your content and stories, always disclosing the partnership.</p>
      
      <h2>Selling Products</h2>
      <p>Create and sell your own digital products like e-books, presets, courses, or templates. NexVibe's shopping features make it easy to showcase products.</p>
      
      <h2>Offering Services</h2>
      <p>Use your platform to offer consulting, coaching, or creative services. Your social proof serves as a powerful portfolio.</p>
      
      <h2>Fan Support Features</h2>
      <p>Enable features that allow followers to support you directly through tips, subscriptions, or exclusive content.</p>
      
      <h2>Building Multiple Streams</h2>
      <p>Don't rely on one income source. Combine brand deals, affiliate income, product sales, and services to create sustainable revenue.</p>
      
      <p>Monetization takes time and patience. Focus on providing value first, and the money will follow. Start implementing these strategies today!</p>
    `,
    image: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=1200&h=600&fit=crop",
    author: {
      name: "Lisa Rodriguez",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop",
      role: "Digital Entrepreneur",
      bio: "Lisa has helped hundreds of creators monetize their content and build sustainable online businesses."
    },
    date: "March 5, 2024",
    readTime: "8 min read",
    category: "Monetization",
    tags: ["money", "business", "tips", "earn"],
    likes: 1234,
    comments: 234
  },
  6: {
    id: 6,
    title: "The Power of Community Building",
    excerpt: "How to create meaningful connections and foster a supportive community around your content...",
    content: `
      <p>A strong community is the foundation of any successful social media presence. Learn how to build genuine connections that turn followers into loyal fans.</p>
      
      <h2>Start Conversations</h2>
      <p>Ask questions in your content and encourage discussion. Respond to comments thoughtfully and create space for your audience to share their perspectives.</p>
      
      <h2>Create Shared Experiences</h2>
      <p>Host Lives, challenges, or virtual meetups that bring your community together. Shared experiences strengthen bonds between members.</p>
      
      <h2>Spotlight Community Members</h2>
      <p>Feature user-generated content, shout out active members, and celebrate community wins. Recognition makes people feel valued.</p>
      
      <h2>Establish Community Guidelines</h2>
      <p>Set clear expectations for behavior and enforce them consistently. A safe, respectful environment encourages participation.</p>
      
      <h2>Go Beyond the Platform</h2>
      <p>Consider creating a Discord server, Facebook group, or email newsletter for deeper connections beyond NexVibe.</p>
      
      <h2>Listen and Adapt</h2>
      <p>Pay attention to what your community wants. Conduct polls, ask for feedback, and adjust your content strategy accordingly.</p>
      
      <p>Community building is an ongoing process, but the rewards are immeasurable. Start nurturing your community today and watch it flourish.</p>
    `,
    image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&h=600&fit=crop",
    author: {
      name: "James Wilson",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop",
      role: "Community Manager",
      bio: "James has built and managed online communities for major brands, focusing on authentic engagement and member success."
    },
    date: "March 3, 2024",
    readTime: "5 min read",
    category: "Community",
    tags: ["community", "engagement", "support", "connection"],
    likes: 678,
    comments: 98
  }
};

export default function BlogPostDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(BLOG_POSTS[id]?.likes || 0);

  const post = BLOG_POSTS[id];
  
  if (!post) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Post not found</h1>
          <Link to="/blog" className="text-pink-500 hover:underline">Back to Blog</Link>
        </div>
      </div>
    );
  }

  const handleLike = () => {
    if (liked) {
      setLikesCount(likesCount - 1);
    } else {
      setLikesCount(likesCount + 1);
    }
    setLiked(!liked);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-8 transition-colors"
        >
          <FiChevronLeft className="w-4 h-4" /> Back
        </button>

        {/* Hero Image */}
        <div className="rounded-3xl overflow-hidden mb-8 aspect-video">
          <img src={post.image} alt={post.title} className="w-full h-full object-cover" />
        </div>

        {/* Post Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-pink-100 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400 rounded-full text-sm font-semibold">
              {post.category}
            </span>
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <FiCalendar className="w-4 h-4" />
              {post.date}
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <FiUser className="w-4 h-4" />
              {post.readTime}
            </div>
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-6">{post.title}</h1>
          
          {/* Author Info */}
          <div className="flex items-center justify-between flex-wrap gap-4 p-6 bg-[var(--bg-secondary)] rounded-2xl border border-[var(--border)]">
            <div className="flex items-center gap-4">
              <img src={post.author.avatar} alt={post.author.name} className="w-12 h-12 rounded-full object-cover" />
              <div>
                <p className="font-semibold text-lg">{post.author.name}</p>
                <p className="text-sm text-[var(--text-muted)]">{post.author.role}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 max-w-md">{post.author.bio}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                  liked ? 'bg-pink-500 text-white' : 'bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-pink-500'
                }`}
              >
                <FiHeart className={`w-5 h-5 ${liked ? 'fill-white' : ''}`} />
                <span>{likesCount}</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-pink-500 transition-all">
                <FiMessageCircle className="w-5 h-5" />
                <span>{post.comments}</span>
              </button>
              <button 
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-pink-500 transition-all"
              >
                <FiShare2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setSaved(!saved)}
                className={`p-2 rounded-xl transition-all ${
                  saved ? 'bg-pink-500 text-white' : 'bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-pink-500'
                }`}
              >
                <FiBookmark className={`w-5 h-5 ${saved ? 'fill-white' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Post Content */}
        <div className="prose prose-lg dark:prose-invert max-w-none mb-12">
          <div dangerouslySetInnerHTML={{ __html: post.content }} />
        </div>

        {/* Tags */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <FiTag className="w-5 h-5 text-[var(--text-muted)]" />
            <h3 className="font-semibold">Tags</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {post.tags.map(tag => (
              <Link 
                key={tag} 
                to={`/hashtag/${tag}`}
                className="px-3 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full text-sm hover:border-pink-500 transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </div>

        {/* Share Section */}
        <div className="text-center p-8 bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-3xl">
          <h3 className="text-xl font-bold mb-4">Share this article</h3>
          <div className="flex justify-center gap-4">
            <button className="p-3 bg-[#1DA1F2] text-white rounded-full hover:scale-110 transition-transform">
              <FiTwitter className="w-5 h-5" />
            </button>
            <button className="p-3 bg-[#1877F2] text-white rounded-full hover:scale-110 transition-transform">
              <FiFacebook className="w-5 h-5" />
            </button>
            <button className="p-3 bg-[#E4405F] text-white rounded-full hover:scale-110 transition-transform">
              <BsInstagram className="w-5 h-5" />
            </button>
            <button onClick={handleShare} className="p-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full hover:border-pink-500 transition-transform hover:scale-110">
              <FiLink className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation between posts */}
        <div className="mt-12 flex justify-between">
          <button 
            onClick={() => navigate(`/blog/${parseInt(id) - 1}`)}
            disabled={parseInt(id) <= 1}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${
              parseInt(id) > 1 
                ? 'bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-pink-500' 
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <FiChevronLeft className="w-4 h-4" />
            Previous Post
          </button>
          <button 
            onClick={() => navigate(`/blog/${parseInt(id) + 1}`)}
            disabled={parseInt(id) >= 6}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${
              parseInt(id) < 6 
                ? 'bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-pink-500' 
                : 'opacity-50 cursor-not-allowed'
            }`}
          >
            Next Post
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}