import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  UserPlus, 
  Mail, 
  Phone,
  Check,
  X,
  Crown,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Trash2,
  Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Navigation from '@/components/Navigation';
import { db } from '@/firebase/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyOrIndividual: string;
  ticketType: 'VIP' | 'General' | 'Speaker' | 'Press';
  status: 'checked-in' | 'pending' | 'no-show';
  checkedInAt?: string;
  registeredAt: string;
}

const Guests = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch guests from Firestore
  useEffect(() => {
    const fetchGuests = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'guests'));
        const guestList: Guest[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: `${data.firstName} ${data.lastName}`,
            email: data.email,
            phone: data.phone,
            companyOrIndividual: data.companyOrIndividual|| '',
            ticketType: data.ticketType || 'General',
            status: data.checkedIn ? 'checked-in' : data.status || 'pending',
            checkedInAt: data.checkedInAt || (data.checkedIn ? new Date(data.checkedInAt || Date.now()).toLocaleTimeString() : undefined),
            registeredAt: data.registeredAt || '',
          };
        });
        setGuests(guestList);
      } catch (error) {
        console.error('Error fetching guests:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGuests();
  }, []);

  const filteredGuests = guests.filter(guest => {
    const matchesSearch =
      guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.companyOrIndividual.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || guest.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleSelectAll = () => {
    if (selectedGuests.length === filteredGuests.length) {
      setSelectedGuests([]);
    } else {
      setSelectedGuests(filteredGuests.map(g => g.id));
    }
  };

  const toggleSelectGuest = (id: string) => {
    setSelectedGuests(prev => 
      prev.includes(id) 
        ? prev.filter(gId => gId !== id)
        : [...prev, id]
    );
  };

  const getStatusBadge = (status: Guest['status']) => {
    switch (status) {
      case 'checked-in':
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs">
            <Check className="w-3 h-3" /> Checked In
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs">
            Pending
          </span>
        );
      case 'no-show':
        return (
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/20 text-destructive text-xs">
            <X className="w-3 h-3" /> No Show
          </span>
        );
    }
  };

  const getTicketBadge = (type: Guest['ticketType']) => {
    const colors: Record<string, string> = {
      VIP: 'bg-yellow-500/20 text-yellow-500',
      Speaker: 'bg-primary/20 text-primary',
      Press: 'bg-purple-500/20 text-purple-500',
      General: 'bg-muted text-muted-foreground',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[type]}`}>
        {type === 'VIP' && <Crown className="w-3 h-3 inline mr-1" />}
        {type}
      </span>
    );
  };

  const stats = [
    { label: 'Total Guests', value: guests.length },
    { label: 'Checked In', value: guests.filter(g => g.status === 'checked-in').length },
    { label: 'Pending', value: guests.filter(g => g.status === 'pending').length },
    { label: 'No Shows', value: guests.filter(g => g.status === 'no-show').length },
  ];

  if (loading) return <div className="min-h-screen flex items-center justify-center text-foreground">Loading guests...</div>;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="pt-24 pb-12 px-6">
        <div className="container mx-auto max-w-7xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Guest Management</h1>
              <p className="text-muted-foreground">View and manage all event attendees</p>
            </div>
            <div className="flex items-center gap-3 mt-4 md:mt-0">
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button variant="hero" size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Guest
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-4">
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="glass rounded-2xl p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or company..."
                  className="pl-10 h-11"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48 h-11">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="checked-in">Checked In</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="no-show">No Show</SelectItem>
                </SelectContent>
              </Select>
              {selectedGuests.length > 0 && (
                <Button variant="outline">
                  <Send className="w-4 h-4 mr-2" />
                  Message ({selectedGuests.length})
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-4 text-left">
                      <Checkbox 
                        checked={selectedGuests.length === filteredGuests.length && filteredGuests.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Guest</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Contact</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Company</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Ticket</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Check-in</th>
                    <th className="p-4 text-right text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGuests.map((guest) => (
                    <tr 
                      key={guest.id} 
                      className="border-b border-border/50 hover:bg-secondary/50 transition-colors"
                    >
                      <td className="p-4">
                        <Checkbox 
                          checked={selectedGuests.includes(guest.id)}
                          onCheckedChange={() => toggleSelectGuest(guest.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {guest.name.split(' ').map(n => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{guest.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden">{guest.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            {guest.email}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            {guest.phone}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-sm text-foreground">{guest.companyOrIndividual}</span>
                      </td>
                      <td className="p-4">
                        {getTicketBadge(guest.ticketType)}
                      </td>
                      <td className="p-4">
                        {getStatusBadge(guest.status)}
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {guest.checkedInAt || '—'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Send className="w-4 h-4 mr-2" />
                              Send Message
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Showing {filteredGuests.length} of {guests.length} guests
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm">1</Button>
                <Button variant="ghost" size="sm">2</Button>
                <Button variant="ghost" size="sm">3</Button>
                <Button variant="outline" size="icon">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Guests;
