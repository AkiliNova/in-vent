"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import Navigation from "@/components/Navigation";
import { db } from "@/firebase/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc, query } from "firebase/firestore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useAuth } from "@/context/AuthContext"; // assume you have a hook for auth and tenant

interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  companyOrIndividual: string;
  ticketType: "VIP" | "General" | "Speaker" | "Press";
  status: "checked-in" | "pending" | "no-show";
  checkedInAt?: string;
  registeredAt: string;
  amountPaid: 0;
  customFields?: Record<string, any>;
}

const Guests = () => {
  const { tenantId } = useAuth(); // tenant-aware
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ticketFilter, setTicketFilter] = useState<"all" | Guest["ticketType"]>("all");
  const [selectedGuests, setSelectedGuests] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewGuest, setViewGuest] = useState<Guest | null>(null);
  const [editGuest, setEditGuest] = useState<Guest | null>(null);
  const [editForm, setEditForm] = useState<Partial<Guest>>({});

  // -----------------------------
  // Fetch guests (tenant-aware)
  // -----------------------------
  useEffect(() => {
    if (!tenantId) return;

    const fetchGuests = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "tenants", tenantId, "guests"));
        const snapshot = await getDocs(q);
        const guestList: Guest[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            firstName: data.firstName,
            lastName: data.lastName,
            name: `${data.firstName} ${data.lastName}`,
            email: data.email,
            phone: data.phone,
            companyOrIndividual: data.companyOrIndividual || "",
            ticketType: data.ticketType || "General",
            status: data.checkedIn ? "checked-in" : data.status || "pending",
            checkedInAt: data.checkedInAt || (data.checkedIn ? new Date(data.checkedInAt || Date.now()).toLocaleTimeString() : undefined),
            registeredAt: data.registeredAt || "",
            amountPaid: data.amountPaid || 0,
            customFields: data.customFields || {},
          };
        });
        setGuests(guestList);
      } catch (error) {
        console.error("Error fetching guests:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGuests();
  }, [tenantId]);

  // -----------------------------
  // CRUD operations (tenant-aware)
  // -----------------------------
  const handleCheckIn = async (guest: Guest) => {
    if (!tenantId) return;
    const status = guest.status === "checked-in" ? "pending" : "checked-in";
    try {
      const docRef = doc(db, "tenants", tenantId, "guests", guest.id);
      await updateDoc(docRef, {
        status,
        checkedInAt: status === "checked-in" ? new Date().toISOString() : null,
      });
      setGuests((prev) =>
        prev.map((g) =>
          g.id === guest.id
            ? { ...g, status, checkedInAt: status === "checked-in" ? new Date().toLocaleTimeString() : null }
            : g
        )
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteGuest = async (id: string) => {
    if (!tenantId) return;
    if (!confirm("Are you sure you want to delete this guest?")) return;
    try {
      const docRef = doc(db, "tenants", tenantId, "guests", id);
      await deleteDoc(docRef);
      setGuests((prev) => prev.filter((g) => g.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  const handleEditGuest = (guest: Guest) => {
    setEditGuest(guest);
    setEditForm({ ...guest });
  };

  const saveGuestEdits = async () => {
    if (!tenantId || !editGuest) return;
    try {
      const docRef = doc(db, "tenants", tenantId, "guests", editGuest.id);
      await updateDoc(docRef, editForm);
      setGuests((prev) =>
        prev.map((g) => (g.id === editGuest.id ? { ...g, ...editForm } : g))
      );
      setEditGuest(null);
    } catch (error) {
      console.error(error);
    }
  };

  // -----------------------------
  // Filter & select helpers
  // -----------------------------
  const filteredGuests = guests.filter((guest) => {
    const matchesSearch =
      guest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      guest.companyOrIndividual.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || guest.status === statusFilter;

    const matchesTicket =
      ticketFilter === "all" || guest.ticketType === ticketFilter;

    return matchesSearch && matchesStatus && matchesTicket;
  });


  const toggleSelectAll = () => {
    if (selectedGuests.length === filteredGuests.length) {
      setSelectedGuests([]);
    } else {
      setSelectedGuests(filteredGuests.map((g) => g.id));
    }
  };

  const toggleSelectGuest = (id: string) => {
    setSelectedGuests((prev) =>
      prev.includes(id) ? prev.filter((gId) => gId !== id) : [...prev, id]
    );
  };

  // -----------------------------
  // Badges & export
  // -----------------------------
  const getStatusBadge = (status: Guest["status"]) => {
    switch (status) {
      case "checked-in":
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs"><Check className="w-3 h-3" /> Checked In</span>;
      case "pending":
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs">Pending</span>;
      case "no-show":
        return <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-destructive/20 text-destructive text-xs"><X className="w-3 h-3" /> No Show</span>;
    }
  };

  const getTicketBadge = (type: Guest["ticketType"]) => {
    const colors: Record<string, string> = {
      VIP: "bg-yellow-500/20 text-yellow-500",
      Speaker: "bg-primary/20 text-primary",
      Press: "bg-purple-500/20 text-purple-500",
      General: "bg-muted text-muted-foreground",
    };
    return <span className={`px-2 py-1 rounded-full text-xs ${colors[type]}`}>{type === "VIP" && <Crown className="w-3 h-3 inline mr-1" />}{type}</span>;
  };
  const formatDate = (isoString: string | undefined) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const exportToExcel = () => {
    if (guests.length === 0) return;

    const dataToExport =
      selectedGuests.length > 0
        ? guests.filter((g) => selectedGuests.includes(g.id))
        : guests;

    const data = dataToExport.map((g) => {
      // Map customFields keys (fieldId) to labels
      const mappedCustomFields: Record<string, any> = {};
      if (g.customFields) {
        Object.entries(g.customFields).forEach(([fieldId, value]) => {
          const label = registrationFields[fieldId] || fieldId;
          mappedCustomFields[label] = value;
        });
      }

      return {
        Name: g.name,
        Email: g.email,
        Phone: g.phone,
        Company: g.companyOrIndividual,
        Ticket: g.ticketType,
        Status: g.status,
        "Checked In At": formatDate(g.checkedInAt),
        "Registered At": formatDate(g.registeredAt),
        "Amount Paid": g.amountPaid,
        ...mappedCustomFields,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "guests.xlsx");
  };

  const [registrationFields, setRegistrationFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!tenantId) return;

    const fetchFields = async () => {
      const snap = await getDocs(collection(db, `tenants/${tenantId}/registration_fields`));
      const fieldsMap: Record<string, string> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        fieldsMap[doc.id] = data.label; // map fieldId => label
      });
      setRegistrationFields(fieldsMap);
    };

    fetchFields();
  }, [tenantId]);
const navigate = useNavigate();

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

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
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                variant="hero"
                size="sm"
                onClick={() => navigate("/register")}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Guest
              </Button>
            </div>
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
              <Select value={ticketFilter} onValueChange={(v) => setTicketFilter(v as any)}>
                <SelectTrigger className="w-full md:w-48 h-11">
                  <Crown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Ticket type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tickets</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Speaker">Speaker</SelectItem>
                  <SelectItem value="Press">Press</SelectItem>
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


          {/* Guest Table */}
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
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Amount Paid</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Check-in</th>
                    <th className="p-4 text-left text-sm font-medium text-muted-foreground">Custom Fields</th>
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
                              {guest.name.split(" ").map((n) => n[0]).join("")}
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
                            <Mail className="w-3 h-3" /> {guest.email}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" /> {guest.phone}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 hidden lg:table-cell">{guest.companyOrIndividual}</td>
                      <td className="p-4">{getTicketBadge(guest.ticketType)}</td>
                      <td className="p-4">Ksh {guest.amountPaid.toFixed(2)}</td>
                      <td className="p-4">{getStatusBadge(guest.status)}</td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-sm text-muted-foreground">{formatDate(guest.checkedInAt) || "—"}</span>
                        <Button
                          size="sm"
                          className="ml-2"
                          onClick={() => handleCheckIn(guest)}
                        >
                          {guest.status === "checked-in" ? "Undo" : "Check In"}
                        </Button>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 text-sm text-foreground">
                          {guest.customFields
                            ? Object.entries(guest.customFields).map(([fieldId, value]) => (
                              <div key={fieldId}>
                                <span className="font-medium">
                                  {registrationFields[fieldId] || fieldId}:
                                </span>{" "}
                                {value.toString()}
                              </div>
                            ))
                            : <span className="text-muted-foreground">—</span>
                          }
                        </div>
                      </td>

                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewGuest(guest)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditGuest(guest)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Send className="w-4 h-4 mr-2" />
                              Send Message
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteGuest(guest.id)}>
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
          </div>


          {/* Pagination placeholder */}
          <div className="flex items-center justify-between p-4 border-t border-border mt-4">
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
      </main>

      {/* View Guest Modal */}
      {viewGuest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-2xl w-96">
            <h2 className="text-xl font-bold mb-2">{viewGuest.name}</h2>
            <p><strong>Email:</strong> {viewGuest.email}</p>
            <p><strong>Phone:</strong> {viewGuest.phone}</p>
            <p><strong>Company:</strong> {viewGuest.companyOrIndividual}</p>
            <p><strong>Ticket Type:</strong> {viewGuest.ticketType}</p>
            <p><strong>Status:</strong> {viewGuest.status}</p>
            <p><strong>Checked In At:</strong> {viewGuest.checkedInAt || '—'}</p>
            <p><strong>Registered At:</strong> {viewGuest.registeredAt}</p>
            <p><strong>Amount Paid:</strong> Ksh {viewGuest.amountPaid.toFixed(2)}</p>
            <div className="mt-4">
              <h3 className="font-medium mb-2">Custom Fields:</h3>
              {viewGuest.customFields ? (
                <div className="space-y-1">
                  {Object.entries(viewGuest.customFields).map(([fieldId, value]) => (
                    <p key={fieldId}>
                      <strong>{registrationFields[fieldId] || fieldId}:</strong> {value.toString()}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No custom fields.</p>
              )}
            </div>
            <Button className="mt-4 w-full" onClick={() => setViewGuest(null)}>Close</Button>
          </div>
        </div>
      )}

      {/* Edit Guest Modal */}
      {editGuest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-2xl w-96">
            <h2 className="text-xl font-bold mb-4">Edit {editGuest.name}</h2>
            <div className="space-y-2">
              <Input
                placeholder="First Name"
                value={editForm.firstName || ""}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              />
              <Input
                placeholder="Last Name"
                value={editForm.lastName || ""}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              <Input
                placeholder="Phone"
                value={editForm.phone || ""}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1" onClick={saveGuestEdits}>Save</Button>
              <Button className="flex-1" variant="outline" onClick={() => setEditGuest(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Guests;
