import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { Calendar, Clock, ArrowLeft, Tag } from 'lucide-react';

interface Post {
  id: string;
  title: string;
  excerpt: string;
  content: string;
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

export default function BlogPost() {
  const { postId } = useParams<{ postId: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!postId) return;
    const fetch = async () => {
      try {
        const snap = await getDoc(doc(db, 'blog_posts', postId));
        if (!snap.exists()) { setNotFound(true); return; }
        const d = snap.data();
        const wordCount = (d.content || '').split(/\s+/).length;
        setPost({
          id: snap.id,
          title: d.title,
          excerpt: d.excerpt,
          content: d.content,
          category: d.category || 'General',
          image: d.image || '',
          author: d.author || 'Tikooh Team',
          createdAt: d.createdAt?.toDate?.()?.toLocaleDateString('en-KE', {
            day: 'numeric', month: 'long', year: 'numeric',
          }) || '',
          readTime: `${Math.max(1, Math.ceil(wordCount / 200))} min read`,
        });
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [postId]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-6 max-w-3xl">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-secondary rounded w-3/4" />
              <div className="h-4 bg-secondary rounded w-1/2" />
              <div className="h-64 bg-secondary rounded-2xl" />
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-4 bg-secondary rounded" style={{ width: `${70 + Math.random() * 30}%` }} />
                ))}
              </div>
            </div>
          )}

          {notFound && !loading && (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">Post not found.</p>
              <Link to="/blog" className="text-primary hover:underline mt-4 inline-block">← Back to Blog</Link>
            </div>
          )}

          {post && (
            <article>
              {/* Category & meta */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${categoryColors[post.category] ?? 'bg-secondary text-muted-foreground'}`}>
                  {post.category}
                </span>
                {post.createdAt && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" /> {post.createdAt}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" /> {post.readTime}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
                {post.title}
              </h1>

              {/* Excerpt */}
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed border-l-4 border-primary pl-4">
                {post.excerpt}
              </p>

              {/* Cover image */}
              {post.image && (
                <div className="rounded-2xl overflow-hidden mb-10">
                  <img src={post.image} alt={post.title} className="w-full h-72 object-cover" />
                </div>
              )}

              {/* Author */}
              <div className="flex items-center gap-3 mb-10 pb-8 border-b border-border">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {post.author.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{post.author}</p>
                  <p className="text-xs text-muted-foreground">Tikooh</p>
                </div>
              </div>

              {/* Content */}
              <div className="prose-content text-foreground leading-relaxed space-y-4">
                {post.content.split('\n\n').map((para, i) =>
                  para.trim() ? (
                    <p key={i} className="text-base text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {para}
                    </p>
                  ) : null
                )}
              </div>

              {/* Footer */}
              <div className="mt-16 pt-8 border-t border-border text-center">
                <p className="text-muted-foreground mb-4">Enjoyed this post?</p>
                <Link
                  to="/onboarding"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#F32B81] hover:bg-[#E02575] text-white rounded-full font-medium transition-colors"
                >
                  Create Your Event on Tikooh
                </Link>
              </div>
            </article>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
