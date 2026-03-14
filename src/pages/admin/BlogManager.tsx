import { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Pencil, Trash2, Globe, EyeOff, Calendar, Clock, Sparkles,
} from 'lucide-react';

const SAMPLE_POSTS = [
  {
    title: 'How to Sell Out Your Event in Kenya: A Step-by-Step Guide',
    excerpt: 'From choosing the right ticket price to running a WhatsApp promo campaign — everything you need to fill every seat.',
    category: 'Tips & Guides',
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    published: true,
    content: `Selling out an event in Kenya takes more than just putting up a poster. With the rise of digital ticketing, savvy organizers are combining social media, M-Pesa convenience, and early-bird psychology to consistently fill venues.

Here is the step-by-step approach that works.

1. Price Your Tickets Strategically

Start with an Early Bird tier priced 30–40% below your regular price. Limit it to the first 50–100 seats. Scarcity drives urgency. When people see "Only 12 Early Bird tickets left," they act immediately.

Your tier structure should look something like this:
- Early Bird: KES 500 (limited to 100 seats)
- Regular: KES 800
- VIP: KES 1,500 (includes backstage access, reserved seating, or a gift bag)

2. Launch on a Tuesday or Wednesday

Data shows that mid-week launches get 40% more first-day sales than weekend launches. People are at their desks, checking their phones, and making plans for the weekend ahead.

3. Use WhatsApp Broadcast, Not Just Instagram

Instagram is for discovery. WhatsApp is for conversion. Build a broadcast list of past event attendees and send them a personal-feeling message: "Hey, tickets for [Event Name] just went live. Early Bird runs out Friday — grab yours at the link below."

4. Run a Promo Code Campaign

Create a code like EARLYKE20 for 20% off and give it exclusively to your most engaged followers, alumni of past events, or local influencers. They share it because it makes them look good. You get sales because of the discount psychology.

5. Post on the Day of Sale, Not Just Before

Remind people at 8am, 12pm, and 6pm on launch day. Use countdown stories. Show ticket tiers selling out in real time. Social proof in motion is the most powerful sales tool you have.

6. Make Payment Frictionless

If someone has to struggle to pay, they will abandon. Tikooh supports M-Pesa STK push — the buyer enters their phone number, they get a prompt, they confirm. Done in 15 seconds. No card details, no bank transfers, no follow-up.

7. Email Your List 48 Hours Before the Event

Send a reminder with the schedule, venue directions (a Google Maps link), what to wear, and what to bring. People who feel prepared show up. People who feel uncertain ghost.

Follow these steps consistently and selling out stops being a goal — it becomes your default.`,
  },
  {
    title: 'Why M-Pesa is the Best Way to Accept Event Payments in Africa',
    excerpt: "Over 90% of Kenyan ticket buyers prefer M-Pesa. Here's how Tikooh makes it seamless for organizers and buyers alike.",
    category: 'Payments',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
    published: true,
    content: `When you force Kenyan event-goers to pay by card, you lose roughly half your potential buyers. When you add M-Pesa, you get everyone back.

Here is why M-Pesa dominates event ticketing in Kenya — and how to make it work for you.

The Numbers

M-Pesa has over 30 million active users in Kenya. That is nearly 60% of the entire population and well over 90% of anyone likely to attend an event. Credit card penetration, by comparison, sits below 5%.

For event organizers, this is not a payment preference question. It is a revenue question. Every organizer who has switched from card-only to M-Pesa first has reported a significant jump in completed purchases.

How It Works on Tikooh

When a buyer selects their ticket tier and clicks "Pay with M-Pesa," here is what happens:

1. They enter their Safaricom phone number
2. An STK push prompt arrives on their phone within seconds
3. They enter their M-Pesa PIN
4. Payment is confirmed and their PDF ticket is generated immediately

The entire process takes under 30 seconds. There is no app to download, no account to create, no card details to enter. Just a phone number and a PIN that every Kenyan already knows by heart.

Why This Matters for Conversions

Payment friction is the number one reason people abandon ticket purchases. Every extra step — loading a card details form, waiting for an OTP, getting a bank 3D Secure screen — costs you buyers.

M-Pesa eliminates all of that. The conversion rate from "add to cart" to "payment confirmed" is dramatically higher with M-Pesa than with card payments for Kenyan audiences.

Visa and Mastercard Still Matter

Do not drop card support entirely. Corporate ticket buyers, diaspora attendees, and international visitors will prefer cards. Tikooh supports both through PesaPal, so you capture every buyer regardless of their preferred method.

The bottom line: list your events on Tikooh, enable M-Pesa as your primary payment method, and watch your conversion rate climb.`,
  },
  {
    title: 'Setting Up QR Code Check-In for Your Next Event',
    excerpt: "A scanner on any smartphone, zero app download for guests, instant validation. Here's everything your gate staff needs to know.",
    category: 'How-To',
    image: 'https://images.unsplash.com/photo-1580674684081-7617fbf3d745?w=800&q=80',
    published: true,
    content: `Long queues at the gate kill event vibes before the event even starts. QR check-in, done properly, can process 200+ guests per hour with a single scanner and one staff member.

Here is exactly how to set it up using Tikooh.

What Your Guests Get

Every ticket buyer receives a PDF ticket with a unique QR code. It is generated automatically after payment confirmation. They can print it, screenshot it, or just keep the PDF open on their phone — any of these works at the gate.

What Your Gate Staff Needs

Nothing more than a smartphone and the Tikooh Scanner page open in their browser. No app download, no special hardware, no setup beyond logging in.

Step 1: Set Up Your Scanning Station

Open the Tikooh Scanner page on the phone or tablet your gate staff will use. Make sure the device has a working camera and good internet (a mobile hotspot works fine). One device is enough for events under 300 guests. For larger events, set up two or three scanning stations.

Step 2: Brief Your Staff

The flow is simple:
- Guest presents QR code (phone or printed)
- Staff taps "Start Camera" on the scanner
- Green screen = valid ticket, shows guest name
- Red screen = invalid or already used

That is it. Most gate staff are comfortable with the full flow after two test scans.

Step 3: Handle Edge Cases

Some guests will have trouble displaying their QR code — low phone battery, screenshot did not save properly, PDF viewer crashed. For these cases, the scanner also accepts manual ticket ID entry. The ticket ID is printed on every PDF ticket.

Step 4: Monitor Check-Ins Live

While scanning happens at the gate, the event organizer can watch check-in numbers update in real time on the Guests dashboard. You will see exactly how many people have arrived, who is still pending, and whether any duplicate scan attempts have been made.

Tips for a Smooth Gate

- Test your scanning setup 30 minutes before doors open
- Keep a power bank at each scanning station
- Print a shortlist of VIP names as a manual backup
- Have one staff member dedicated to the entry queue, separate from the scanner

QR check-in is not complicated — it just requires a few minutes of preparation. That preparation is what separates a smooth event from a chaotic one.`,
  },
  {
    title: 'The Early Bird Effect: How Ticket Tiers Boost Event Revenue',
    excerpt: 'Early Bird, Regular, VIP — structuring your tiers strategically can increase total revenue by up to 40%.',
    category: 'Strategy',
    image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80',
    published: true,
    content: `Most event organizers set one ticket price, watch sales trickle in slowly, panic two weeks before the event, and slash the price. There is a better way.

Tiered pricing — done deliberately — creates urgency, rewards early commitment, and maximizes total revenue. Here is the psychology and the math behind it.

Why Tiers Work

Human beings respond to scarcity and deadlines. "Get your Early Bird ticket before Friday" triggers a decision that "Buy a ticket for the event" does not. The deadline forces action. The scarcity (limited seats) makes the action feel smart.

Meanwhile, late buyers — those who only decide once the event is imminent — are the least price-sensitive. They want to go. They will pay full price, and sometimes more for a VIP experience that is still available.

The Three-Tier Formula

Tier 1 — Early Bird
Price: 30–40% below your intended regular price
Inventory: 15–25% of total capacity
Window: Available from launch until 2–3 weeks before the event

Tier 2 — Regular
Price: Your baseline price
Inventory: 50–60% of total capacity
Window: Opens when Early Bird sells out or closes

Tier 3 — VIP
Price: 1.5x to 3x the Regular price
Inventory: 10–20% of total capacity
What it includes: Reserved seating, early entry, a meet-and-greet, a gift bag, or backstage access

The Revenue Math

Imagine you are selling 500 tickets for a concert:
- 100 Early Bird at KES 500 = KES 50,000
- 300 Regular at KES 800 = KES 240,000
- 100 VIP at KES 1,500 = KES 150,000
- Total: KES 440,000

Compare that to a flat-rate model: 500 tickets at KES 700 = KES 350,000

The tiered model generates 25% more revenue with the same number of attendees — and that is before accounting for the urgency-driven sellout effect that tiers create.

Setting Tiers on Tikooh

When creating your event on Tikooh, you can add as many ticket tiers as you need. Each tier has its own name, price, inventory count, and description. Once the inventory for a tier is exhausted, it automatically shows as "Sold Out" and buyers move to the next available tier.

The system handles the countdown automatically. You focus on making the event great.`,
  },
  {
    title: 'Post-Event SMS Campaigns: Turn Attendees Into Repeat Buyers',
    excerpt: "The 24 hours after your event are the highest-engagement window you'll ever have. Don't waste them.",
    category: 'Engagement',
    image: 'https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=800&q=80',
    published: true,
    content: `Your event just ended. People are still buzzing. Their phones are in their hands. This is the single best moment to reach them — and most organizers waste it completely.

Here is how to use Tikooh's campaign tools to turn one-time attendees into a loyal audience that buys tickets to everything you do.

The 24-Hour Window

Engagement data is clear: messages sent within 24 hours of an event get 3–5x higher open and click rates than the same message sent a week later. The experience is fresh. The emotion is still there. Act on it.

What to Send (and When)

Within 2 hours of the event ending:

"Thank you for coming to [Event Name]! Hope you had an incredible time. Photos will be up on our Instagram by tomorrow morning. Follow us @handle so you don't miss them."

This is not a sales message. It is appreciation. It deepens the relationship.

24–48 hours after the event:

"Loved having you at [Event Name]. We're planning something even bigger for [Month] — join the waitlist to get first access to Early Bird tickets: [link]"

Now you are planting the seed for the next event with people who have already proven they show up.

One week after:

"Early Bird tickets for [Next Event] are now live for our past attendees — 24 hours before we open to the public. Get yours here: [link]"

This is a VIP moment for your repeat audience. They feel seen. They buy.

How to Send on Tikooh

Go to the Campaigns page. Select your audience — you can target all attendees from a specific event, only those who checked in, or only VIP ticket holders. Type your message and hit Send. The platform tracks delivery and the campaign is logged automatically.

Segment Intelligently

Not every attendee is the same. Someone who bought a VIP ticket and checked in early is a different customer than someone who bought the cheapest ticket and arrived two hours late. Tikooh lets you segment by ticket tier and check-in status so your messages land with the right people.

The organizers who build loyal audiences are not the ones with the best events — they are the ones with the best follow-up. Start now.`,
  },
  {
    title: 'Promo Codes That Actually Work: Lessons From Kenyan Events',
    excerpt: 'A 20% discount code sent to the right audience 48 hours before an event can move dozens of remaining tickets.',
    category: 'Marketing',
    image: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=800&q=80',
    published: true,
    content: `A promo code is not a price cut. Used correctly, it is a targeted marketing tool that feels personal, drives urgency, and converts hesitant buyers — without cheapening your event.

Here is how to use promo codes strategically with Tikooh.

When Promo Codes Work Best

Promo codes perform best in three scenarios:

1. Filling remaining inventory 48–72 hours before the event
2. Rewarding a specific community (alumni, members, followers of a partner brand)
3. Re-engaging past attendees who have not bought tickets to your latest event yet

They work worst when you blast a generic discount to everyone who has ever heard of you. That just trains your audience to wait for a discount every time.

The 3-Code Strategy

Create three separate codes with different audiences in mind:

INSIDER20 — 20% off for your most loyal followers (share in a private WhatsApp group or email list only). Limit: 30 uses.

PARTNER15 — 15% off for a partner brand's audience (a gym, a restaurant, a university club). Share it with the partner to give to their members. Limit: 50 uses.

LASTCHANCE10 — 10% off for general audience, sent 48 hours before the event when urgency is already high. Limit: 100 uses.

Each code targets a different buyer. Each has a use cap so it does not become a free-for-all.

Setting Up Codes on Tikooh

On the Promo Codes page, create each code with:
- A code string (memorable, all caps)
- Discount type: percentage or fixed KES amount
- Max uses (leave blank for unlimited)
- Expiry date (set to the day of the event)

Once a code hits its use limit, it deactivates automatically. You do not need to remember to turn it off.

Tracking Performance

The Promo Codes page shows you exactly how many times each code has been used. This is useful for understanding which community converted best — and for deciding which partners deserve the better discount next time.

One More Thing

Never publicly post a high-value promo code unless you want the entire internet to use it. The power of a promo code is in its exclusivity. If everyone has it, no one feels special — and you just gave a discount to people who would have paid full price.`,
  },
];


interface Post {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  image: string;
  author: string;
  published: boolean;
  createdAt: string;
  readTime: string;
}

const CATEGORIES = [
  'Tips & Guides', 'Payments', 'How-To', 'Strategy',
  'Marketing', 'Engagement', 'News', 'General',
];

const empty = {
  title: '', excerpt: '', content: '',
  category: 'General', image: '', published: false,
};

export default function BlogManager() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [authorName, setAuthorName] = useState('Admin');
  const { toast } = useToast();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (u?.displayName) setAuthorName(u.displayName);
      else if (u?.email) setAuthorName(u.email.split('@')[0]);
    });
    return unsub;
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'blog_posts'), orderBy('createdAt', 'desc'))
      );
      const data = snap.docs.map(d => {
        const p = d.data();
        const wordCount = (p.content || '').split(/\s+/).length;
        return {
          id: d.id,
          title: p.title,
          excerpt: p.excerpt || '',
          content: p.content || '',
          category: p.category || 'General',
          image: p.image || '',
          author: p.author || '',
          published: p.published ?? false,
          createdAt: p.createdAt?.toDate?.()?.toLocaleDateString('en-KE', {
            day: 'numeric', month: 'short', year: 'numeric',
          }) || 'Draft',
          readTime: `${Math.max(1, Math.ceil(wordCount / 200))} min read`,
        };
      });
      setPosts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setDialogOpen(true);
  };

  const openEdit = (post: Post) => {
    setEditing(post);
    setForm({
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      category: post.category,
      image: post.image,
      published: post.published,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast({ title: 'Title and content are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'blog_posts', editing.id), {
          ...form,
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Post updated' });
      } else {
        await addDoc(collection(db, 'blog_posts'), {
          ...form,
          author: authorName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast({ title: 'Post created' });
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save post', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (post: Post) => {
    try {
      await updateDoc(doc(db, 'blog_posts', post.id), {
        published: !post.published,
        updatedAt: serverTimestamp(),
      });
      toast({ title: post.published ? 'Post unpublished' : 'Post published' });
      load();
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDelete = async (post: Post) => {
    if (!confirm(`Delete "${post.title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'blog_posts', post.id));
      toast({ title: 'Post deleted' });
      load();
    } catch {
      toast({ title: 'Failed to delete post', variant: 'destructive' });
    }
  };

  const seedSamples = async () => {
    if (!confirm('This will add 6 sample blog posts to Firestore. Continue?')) return;
    setSeeding(true);
    try {
      for (const p of SAMPLE_POSTS) {
        await addDoc(collection(db, 'blog_posts'), {
          ...p,
          author: authorName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      toast({ title: `${SAMPLE_POSTS.length} sample posts added!` });
      load();
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to seed posts', variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-6 max-w-5xl">
          {/* Header */}
          <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Blog Manager</h1>
              <p className="text-muted-foreground mt-1">Create and manage blog posts visible on the public blog.</p>
            </div>
            <div className="flex items-center gap-2">
              {posts.length === 0 && (
                <Button
                  variant="heroOutline"
                  onClick={seedSamples}
                  disabled={seeding}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {seeding ? 'Adding...' : 'Add Sample Posts'}
                </Button>
              )}
              <Button onClick={openNew} className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> New Post
              </Button>
            </div>
          </div>

          {/* Post list */}
          {loading ? (
            <div className="space-y-4 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl h-24" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-24 glass rounded-2xl">
              <p className="text-muted-foreground mb-4">No blog posts yet.</p>
              <div className="flex items-center justify-center gap-3">
                <Button variant="heroOutline" onClick={seedSamples} disabled={seeding}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {seeding ? 'Adding...' : 'Add Sample Posts'}
                </Button>
                <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Write your own</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => (
                <div key={post.id} className="glass rounded-2xl p-5 flex items-start gap-4">
                  {/* Thumbnail */}
                  {post.image ? (
                    <img src={post.image} alt="" className="w-20 h-16 rounded-xl object-cover flex-shrink-0 hidden sm:block" />
                  ) : (
                    <div className="w-20 h-16 rounded-xl bg-secondary flex-shrink-0 hidden sm:block" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                        {post.category}
                      </span>
                      <Badge variant={post.published ? 'default' : 'secondary'} className="text-xs">
                        {post.published ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-foreground truncate">{post.title}</h3>
                    <p className="text-muted-foreground text-sm line-clamp-1 mt-0.5">{post.excerpt}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {post.createdAt}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {post.readTime}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={post.published ? 'Unpublish' : 'Publish'}
                      onClick={() => togglePublish(post)}
                    >
                      {post.published
                        ? <EyeOff className="w-4 h-4 text-muted-foreground" />
                        : <Globe className="w-4 h-4 text-primary" />
                      }
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(post)}>
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(post)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Post' : 'New Blog Post'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Title *</label>
              <Input
                placeholder="Post title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Excerpt</label>
              <Textarea
                placeholder="Short summary shown on the blog listing page..."
                rows={2}
                value={form.excerpt}
                onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Category</label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Cover Image URL</label>
                <Input
                  placeholder="https://..."
                  value={form.image}
                  onChange={e => setForm(f => ({ ...f, image: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Content *</label>
              <Textarea
                placeholder="Write your post content here. Use double line breaks to separate paragraphs."
                rows={12}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.content.split(/\s+/).filter(Boolean).length} words ·{' '}
                ~{Math.max(1, Math.ceil(form.content.split(/\s+/).filter(Boolean).length / 200))} min read
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <input
                type="checkbox"
                id="published"
                checked={form.published}
                onChange={e => setForm(f => ({ ...f, published: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="published" className="text-sm text-foreground">
                Publish immediately (visible on public blog)
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
