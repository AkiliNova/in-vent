import { useState, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  Clock, 
  TrendingUp, 
  AlertTriangle,
  Crown,
  MapPin,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import Navigation from '@/components/Navigation';
import { db } from '@/firebase/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

interface Room {
  name: string;
  current: number;
  max: number;
}

interface Activity {
  name: string;
  type: string;
  action: string;
  time: string;
  badge?: string | null;
}

const Dashboard = () => {
  const [checkedIn, setCheckedIn] = useState(0);
  const [expected, setExpected] = useState(0);
  const [capacity, setCapacity] = useState(1500);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // 1️⃣ Fetch all guests
        const guestsSnapshot = await getDocs(collection(db, 'guests'));
        const allGuests = guestsSnapshot.docs.map(doc => doc.data());

        // Calculate stats
        const checkedInCount = allGuests.filter(g => g.checkedIn).length;
        const expectedCount = allGuests.length;
        setCheckedIn(checkedInCount);
        setExpected(expectedCount);

        // 2️⃣ Fetch rooms
        const roomsSnapshot = await getDocs(collection(db, 'rooms'));
        const roomsData: Room[] = roomsSnapshot.docs.map(doc => doc.data() as Room);
        setRooms(roomsData);

        // 3️⃣ Fetch recent activity (last 5)
        const recentSnapshot = await getDocs(
          query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(5))
        );
        const recentData: Activity[] = recentSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            name: data.name,
            type: data.type,
            action: data.action,
            time: new Date(data.timestamp?.toDate?.() || Date.now()).toLocaleTimeString(),
            badge: data.badge || null
          };
        });
        setRecentActivity(recentData);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-foreground">Loading dashboard...</div>;

  const stats = [
    { label: 'Checked In', value: checkedIn, icon: UserCheck, color: 'text-success', change: '+12%' },
    { label: 'Expected', value: expected, icon: Users, color: 'text-primary', change: null },
    { label: 'No Shows', value: expected - checkedIn, icon: AlertTriangle, color: 'text-destructive', change: '-3%' },
    { label: 'Avg Check-in', value: '2.8s', icon: Clock, color: 'text-primary', change: '-0.4s' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold" data-cy="dashboard-header">Event Dashboard</h1>
              <p className="text-muted-foreground">Tech Summit 2024 • Live Now</p>
            </div>
            <div className="flex items-center gap-3 mt-4 md:mt-0">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/20 text-success text-sm">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                Live
              </div>
              <Button variant="outline" size="sm">Export Report</Button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="glass rounded-2xl p-6 group hover:border-primary/30 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-secondary flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                  {stat.change && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      stat.change.startsWith('+') || stat.change.startsWith('-0') 
                        ? 'bg-success/20 text-success' 
                        : 'bg-destructive/20 text-destructive'
                    }`}>
                      {stat.change}
                    </span>
                  )}
                </div>
                <div className="text-3xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Main Content Grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Capacity Overview */}
            <div className="lg:col-span-2 glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Room Capacity</h2>
                <Button variant="ghost" size="sm">View All</Button>
              </div>
              
              <div className="space-y-6">
                {rooms.map((room) => {
                  const percentage = (room.current / room.max) * 100;
                  return (
                    <div key={room.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{room.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {room.current} / {room.max}
                          </span>
                          {percentage > 90 && (
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                          )}
                        </div>
                      </div>
                      <Progress 
                        value={percentage} 
                        className={`h-2 ${percentage > 90 ? '[&>div]:bg-destructive' : percentage > 75 ? '[&>div]:bg-yellow-500' : ''}`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Overall Capacity */}
              <div className="mt-8 p-4 rounded-xl bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">Overall Venue Capacity</span>
                  <span className="text-sm text-muted-foreground">{checkedIn} / {capacity}</span>
                </div>
                <Progress value={(checkedIn / capacity) * 100} className="h-3" />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{Math.round((checkedIn / capacity) * 100)}% filled</span>
                  <span>{capacity - checkedIn} spots available</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
                <Activity className="w-5 h-5 text-primary animate-pulse" />
              </div>
              
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      {activity.badge === 'VIP' ? (
                        <Crown className="w-5 h-5 text-yellow-500" />
                      ) : (
                        <UserCheck className="w-5 h-5 text-success" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{activity.name}</span>
                        {activity.badge && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            activity.badge === 'VIP' 
                              ? 'bg-yellow-500/20 text-yellow-500' 
                              : 'bg-primary/20 text-primary'
                          }`}>
                            {activity.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{activity.time}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <Button variant="ghost" className="w-full mt-4">
                View All Activity
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
