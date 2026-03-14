import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { Link } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Calendar, Clock, ArrowRight, Tag } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  image: string;
  author: string;
  createdAt: string;
  readTime: string;
}

const categoryColors: Record<string, string> = {
  'Tips & Guides': 'bg-[#F32B81]/10 text-[#F32B81]',
  'Payments': 'bg-[#3ED2D1]/10 text-[#3ED2D1]',
  'How-To': 'bg-[#F8D21F]/10 text-[#F8D21F]',
  'Strategy': 'bg-primary/10 text-primary',
  'Marketing': 'bg-[#F32B81]/10 text-[#F32B81]',
  'Engagement': 'bg-[#3ED2D1]/10 text-[#3ED2D1]',
  'News': 'bg-primary/10 text-primary',
  'General': 'bg-secondary text-muted-foreground',
};

export default function BlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const q = query(
          collection(db, 'blog_posts'),
          where('published', '==', true),
          orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => {
          const p = d.data();
          const wordCount = (p.content || '').split(/\s+/).length;
          return {
            id: d.id,
            title: p.title,
            excerpt: p.excerpt || '',
            category: p.category || 'General',
            image: p.image || '',
            author: p.author || 'Tikooh Team',
            createdAt: p.createdAt?.toDate?.()?.toLocaleDateString('en-KE', {
              day: 'numeric', month: 'short', year: 'numeric',
            }) || '',
            readTime: `${Math.max(1, Math.ceil(wordCount / 200))} min read`,
          };
        });
        setPosts(data);
      } catch (err) {
        console.error('Error loading blog posts', err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-20">
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-16">
            <span className="text-primary font-medium text-sm uppercase tracking-wider">Blog</span>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-3 mb-4">
              Event Organizer{' '}
              <span className="gradient-text">Insights</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Tips, guides, and strategies for selling out your events in Kenya.
            </p>
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-6 animate-pulse">
              <div className="glass rounded-3xl h-64" />
              <div className="grid md:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="glass rounded-2xl h-72" />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && posts.length === 0 && (
            <div className="text-center py-24">
              <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
                <Tag className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No posts yet</h3>
              <p className="text-muted-foreground">Check back soon — articles are on the way.</p>
            </div>
          )}

          {/* Featured post */}
          {!loading && featured && (
            <Link
              to={`/blog/${featured.id}`}
              className="block glass rounded-3xl overflow-hidden mb-12 group hover:border-primary/30 transition-colors"
            >
              <div className="grid md:grid-cols-2 gap-0">
                <div className="relative h-64 md:h-auto overflow-hidden">
                  {featured.image ? (
                    <img
                      src={featured.image}
                      alt={featured.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center">
                      <Tag className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card/60 hidden md:block" />
                </div>
                <div className="p-8 md:p-12 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${categoryColors[featured.category] ?? 'bg-secondary text-muted-foreground'}`}>
                      {featured.category}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Featured
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4 leading-tight">
                    {featured.title}
                  </h2>
                  <p className="text-muted-foreground mb-6 leading-relaxed line-clamp-3">{featured.excerpt}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {featured.createdAt && (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {featured.createdAt}</span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {featured.readTime}</span>
                    </div>
                    <span className="flex items-center gap-1 text-primary text-sm font-medium group-hover:gap-2 transition-all">
                      Read <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Post grid */}
          {!loading && rest.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rest.map((post) => (
                <Link
                  key={post.id}
                  to={`/blog/${post.id}`}
                  className="glass rounded-2xl overflow-hidden group hover:border-primary/30 transition-colors"
                >
                  <div className="relative h-48 overflow-hidden">
                    {post.image ? (
                      <img
                        src={post.image}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-secondary flex items-center justify-center">
                        <Tag className="w-10 h-10 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                    <span className={`absolute top-3 left-3 text-xs font-semibold px-3 py-1 rounded-full ${categoryColors[post.category] ?? 'bg-secondary text-muted-foreground'}`}>
                      {post.category}
                    </span>
                  </div>
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-foreground mb-2 leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-4 line-clamp-2">{post.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      {post.createdAt && (
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {post.createdAt}</span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
