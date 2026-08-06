// src/pages/Blog.jsx
import { Link } from 'react-router-dom';
import { useState } from 'react';
import PublicHeader from '../components/common/PublicHeader';
import { FiSearch, FiCalendar, FiUser, FiTag, FiHeart, FiMessageCircle, FiShare2, FiBookmark } from 'react-icons/fi';

const BLOG_POSTS = [
  {
    id: 1,
    title: "10 Tips to Grow Your Social Media Following in 2024",
    excerpt: "Learn proven strategies to increase your engagement and build a loyal community on NexVibe...",
    content: "Full content here...",
    image: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800&h=500&fit=crop",
    author: {
      name: "Sarah Johnson",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
      role: "Social Media Expert"
    },
    date: "March 15, 2024",
    readTime: "5 min read",
    category: "Growth Tips",
    tags: ["social media", "growth", "engagement"],
    likes: 234,
    comments: 45
  },
  {
    id: 2,
    title: "Creating Engaging Reels: A Complete Guide",
    excerpt: "Master the art of short-form video content and reach millions of users on the Explore page...",
    content: "Full content here...",
    image: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=800&h=500&fit=crop",
    author: {
      name: "Mike Chen",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
      role: "Content Creator"
    },
    date: "March 12, 2024",
    readTime: "7 min read",
    category: "Video Content",
    tags: ["reels", "video", "tutorial"],
    likes: 567,
    comments: 89
  },
  {
    id: 3,
    title: "Building a Personal Brand on Social Media",
    excerpt: "Discover how to establish your unique voice and grow your personal brand authentically...",
    content: "Full content here...",
    image: "https://images.unsplash.com/photo-1611162617263-4ec3060a058e?w=800&h=500&fit=crop",
    author: {
      name: "Emma Watson",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop",
      role: "Brand Strategist"
    },
    date: "March 10, 2024",
    readTime: "6 min read",
    category: "Personal Branding",
    tags: ["branding", "personal development", "marketing"],
    likes: 892,
    comments: 123
  },
  {
    id: 4,
    title: "Safety First: Protecting Your Privacy Online",
    excerpt: "Essential tips to keep your account secure and protect your personal information...",
    content: "Full content here...",
    image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=500&fit=crop",
    author: {
      name: "David Kim",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
      role: "Cybersecurity Expert"
    },
    date: "March 8, 2024",
    readTime: "4 min read",
    category: "Security",
    tags: ["privacy", "security", "safety"],
    likes: 445,
    comments: 67
  },
  {
    id: 5,
    title: "Monetizing Your Content: A Beginner's Guide",
    excerpt: "Learn different ways to earn money from your content and turn your passion into profit...",
    content: "Full content here...",
    image: "https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=800&h=500&fit=crop",
    author: {
      name: "Lisa Rodriguez",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop",
      role: "Digital Entrepreneur"
    },
    date: "March 5, 2024",
    readTime: "8 min read",
    category: "Monetization",
    tags: ["money", "business", "tips"],
    likes: 1234,
    comments: 234
  },
  {
    id: 6,
    title: "The Power of Community Building",
    excerpt: "How to create meaningful connections and foster a supportive community around your content...",
    content: "Full content here...",
    image: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&h=500&fit=crop",
    author: {
      name: "James Wilson",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
      role: "Community Manager"
    },
    date: "March 3, 2024",
    readTime: "5 min read",
    category: "Community",
    tags: ["community", "engagement", "support"],
    likes: 678,
    comments: 98
  }
];

const CATEGORIES = ["All", "Growth Tips", "Video Content", "Personal Branding", "Security", "Monetization", "Community"];

export default function Blog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredPosts = BLOG_POSTS.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <PublicHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black mb-4">NexVibe Blog</h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            Insights, tips, and stories from the NexVibe team and community
          </p>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-12">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-pink-500 transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-pink-500 text-white'
                    : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPosts.map(post => (
            <Link 
              key={post.id} 
              to={`/blog/${post.id}`}
              className="group bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl overflow-hidden hover:shadow-xl transition-all hover:scale-[1.02]"
            >
              <div className="aspect-video overflow-hidden">
                <img src={post.image} alt={post.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-pink-500">{post.category}</span>
                  <span className="text-xs text-[var(--text-muted)]">•</span>
                  <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <FiCalendar className="w-3 h-3" />
                    {post.date}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">•</span>
                  <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <FiUser className="w-3 h-3" />
                    {post.readTime}
                  </div>
                </div>
                <h2 className="text-xl font-bold mb-3 group-hover:text-pink-500 transition-colors">{post.title}</h2>
                <p className="text-[var(--text-secondary)] mb-4 line-clamp-2">{post.excerpt}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={post.author.avatar} alt={post.author.name} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <p className="text-sm font-semibold">{post.author.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{post.author.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
                      <FiHeart className="w-4 h-4" />
                      {post.likes}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-[var(--text-muted)]">
                      <FiMessageCircle className="w-4 h-4" />
                      {post.comments}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filteredPosts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[var(--text-secondary)]">No posts found matching your criteria.</p>
          </div>
        )}
      </main>
    </div>
  );
}